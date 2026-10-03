import SwiftUI
import Observation

@MainActor @Observable
final class PlanRebookingLaunch {
    static let shared = PlanRebookingLaunch()
    var plan: NativePlanRequest?
}

struct PlanCancellationSheet: View {
    @Environment(\.dismiss) private var dismiss
    let plan: NativePlanRequest
    let issue: String?
    let submit: (String?, String) async -> Bool
    @State private var reason = ""
    @State private var note = ""
    @State private var submitting = false
    private var confirmed: Bool { plan.status == "ACCEPTED" }
    private var late: Bool { confirmed && (plan.startDate ?? .distantFuture).timeIntervalSinceNow < 7200 }
    static let reasons = ["SCHEDULE_CHANGED", "UNWELL", "SAFETY", "OTHER"]
    static func reasonLabel(_ code: String) -> String {
        AppLocalization.string(String.LocalizationValue(["SCHEDULE_CHANGED": "Schedule changed", "UNWELL": "Not feeling well",
            "SAFETY": "Not comfortable meeting", "OTHER": "Other reason"][code] ?? "Other reason"))
    }
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(plan.title).font(.headline)
                    if let start = plan.startDate { Text(start, format: .dateTime.month().day().hour().minute()) }
                    Text(confirmed ? "This removes the plan from both calendars and notifies the other person. Your chat stays available." : "The other person will be notified. Any previously confirmed time stays unchanged.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                if late {
                    Section {
                        Label("They may already be preparing or on their way. Please choose a reason.", systemImage: "exclamationmark.circle")
                            .foregroundStyle(.orange)
                    }
                }
                Section {
                    Picker(late ? "Reason (required)" : "Reason (optional)", selection: $reason) {
                        Text("Choose a reason").tag("")
                        ForEach(Self.reasons, id: \.self) { Text(Self.reasonLabel($0)).tag($0) }
                    }.accessibilityIdentifier("plan-cancel-reason")
                    TextField("Add a note (optional)", text: $note, axis: .vertical)
                        .lineLimit(2...4).accessibilityIdentifier("plan-cancel-note")
                        .onChange(of: note) { if note.count > 240 { note = String(note.prefix(240)) } }
                    Text("Your reason and note are shared with the other person.").font(.caption).foregroundStyle(.secondary)
                }
                if let issue { Section { Text(AppLocalization.string(String.LocalizationValue(issue))).foregroundStyle(.red) } }
                Section {
                    Button(role: .destructive) {
                        submitting = true
                        Task {
                            let success = await submit(reason.isEmpty ? nil : reason, note)
                            submitting = false
                            if success { dismiss() }
                        }
                    } label: {
                        HStack { Text(confirmed ? "Confirm cancellation" : "Confirm withdrawal"); if submitting { ProgressView() } }
                    }
                    .disabled(submitting || (late && reason.isEmpty))
                    .accessibilityIdentifier("plan-cancel-confirm")
                }
            }
            .navigationTitle(confirmed ? "Cancel plan" : "Withdraw proposal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Keep plan") { dismiss() }.disabled(submitting) } }
            .interactiveDismissDisabled(submitting)
        }
    }
}

struct NativeCancellationNotice: Decodable, Identifiable {
    let id: String
    let actorName: String
    let wasConfirmed: Bool
    let plan: NativePlanRequest
    var summary: String {
        let action = AppLocalization.string(wasConfirmed ? "canceled the plan" : "withdrew the proposal")
        let time = plan.startDate?.formatted(date: .abbreviated, time: .shortened) ?? ""
        return "\(actorName) \(action)\n\(plan.title)\n\(time)"
    }
}

@MainActor @Observable
final class PlanCancellationNoticeStore {
    var current: NativeCancellationNotice?
    private var loading = false
    private var owner: String?
    private var pendingAcknowledgments: Set<String> = []
    private var storageKey: String { "plan-cancellation-acks.\(owner ?? "")" }
    func reset() { current = nil; owner = nil; pendingAcknowledgments = [] }
    func refresh(using session: SessionStore) async {
        guard session.canMakeAuthenticatedRequests, !loading, let userID = session.currentUser?.id else { return }
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            if ProcessInfo.processInfo.arguments.contains("--ui-testing-cancellation-notice"),
               !UserDefaults.standard.bool(forKey: "ui-cancel-notice-ack"), current == nil,
               let plan = UITestingChatFixtures.directPage(connectionID: "ui-connection").messages.compactMap(\.planRequest).first {
                current = NativeCancellationNotice(id: "ui-cancel-notice", actorName: "米娜", wasConfirmed: true, plan: plan)
            }
            return
        }
        #endif
        loading = true
        defer { loading = false }
        if owner != userID {
            current = nil; owner = userID
            pendingAcknowledgments = Set(UserDefaults.standard.stringArray(forKey: storageKey) ?? [])
        }
        do {
            for id in pendingAcknowledgments {
                struct Ack: Decodable { let acknowledged: Bool }
                do {
                    let _: APIEnvelope<Ack> = try await session.sendAuthorized("api/v1/me/plan-cancellations/\(id)", method: .patch)
                    guard owner == userID, session.currentUser?.id == userID else { return }
                    pendingAcknowledgments.remove(id)
                } catch let APIClientError.server(status, _) where status == 404 {
                    pendingAcknowledgments.remove(id)
                } catch { /* Retry on resume; keep locally acknowledged notices hidden. */ }
            }
            UserDefaults.standard.set(Array(pendingAcknowledgments), forKey: storageKey)
            struct Payload: Decodable { let notices: [NativeCancellationNotice] }
            let response: APIEnvelope<Payload> = try await session.sendAuthorized("api/v1/me/plan-cancellations")
            guard owner == userID, session.currentUser?.id == userID else { return }
            if current == nil {
                current = response.data.notices.first { !pendingAcknowledgments.contains($0.id) }
                if current != nil {
                    await HomeScheduleCache.shared.clear()
                    NotificationCenter.default.post(name: .sideSeatCalendarNeedsRefresh, object: nil)
                    NotificationCenter.default.post(name: .sideSeatPlansNeedsRefresh, object: nil)
                    NotificationCenter.default.post(name: .sideSeatInboxNeedsRefresh, object: nil)
                }
            }
        } catch { /* Persistent server notices will be fetched on the next foreground refresh. */ }
    }
    func acknowledge(using session: SessionStore) {
        guard let current else { return }
        #if DEBUG
        if current.id == "ui-cancel-notice" { UserDefaults.standard.set(true, forKey: "ui-cancel-notice-ack") }
        #endif
        pendingAcknowledgments.insert(current.id)
        UserDefaults.standard.set(Array(pendingAcknowledgments), forKey: storageKey)
        self.current = nil
        Task { await refresh(using: session) }
    }
}
