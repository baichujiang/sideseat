import SwiftUI

struct PlanCreateSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    let connectionID: String
    var counterOf: NativePlanRequest? = nil
    let onCreated: () -> Void

    @State private var title = ""
    @State private var location = ""
    @State private var message = ""
    @State private var start = Date().addingTimeInterval(60 * 60)
    @State private var end = Date().addingTimeInterval(2 * 60 * 60)
    @State private var isCreating = false
    @State private var issue: String?
    @State private var didSeed = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Plan") {
                    TextField("Title", text: $title)
                        .accessibilityIdentifier("plan-create-title")
                    TextField("Location (optional)", text: $location)
                        .accessibilityIdentifier("plan-create-location")
                    TextField("Note (optional)", text: $message, axis: .vertical)
                        .lineLimit(2...4)
                        .accessibilityIdentifier("plan-create-message")
                }
                Section("When") {
                    DatePicker("Starts", selection: $start)
                        .accessibilityIdentifier("plan-create-start")
                    DatePicker("Ends", selection: $end)
                        .accessibilityIdentifier("plan-create-end")
                }
                if let issue {
                    Section {
                        Text(issue)
                            .font(.footnote)
                            .foregroundStyle(SideSeatTheme.danger)
                    }
                }
            }
            .navigationTitle(
                counterOf == nil
                    ? String(localized: "Propose a plan")
                    : String(localized: "Suggest another time")
            )
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Send") {
                        Task { await create() }
                    }
                    .disabled(!canSend || isCreating)
                    .accessibilityIdentifier("plan-create-submit")
                }
            }
            .onAppear { seedFromCounterIfNeeded() }
            .accessibilityIdentifier("plan-create-sheet")
        }
    }

    private func seedFromCounterIfNeeded() {
        guard !didSeed, let plan = counterOf else { return }
        didSeed = true
        title = plan.title
        location = plan.location ?? ""
        message = plan.message ?? ""
        if let startDate = plan.startDate {
            start = startDate.addingTimeInterval(60 * 60)
        }
        if let endDate = plan.endDate {
            end = endDate.addingTimeInterval(60 * 60)
        }
    }

    private var canSend: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && end.timeIntervalSince(start) >= 30 * 60
    }

    private func create() async {
        isCreating = true
        issue = nil
        defer { isCreating = false }

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            onCreated()
            dismiss()
            return
        }
        #endif

        do {
            let body = NativePlanCreateRequest(
                title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                location: {
                    let value = location.trimmingCharacters(in: .whitespacesAndNewlines)
                    return value.isEmpty ? nil : value
                }(),
                message: {
                    let value = message.trimmingCharacters(in: .whitespacesAndNewlines)
                    return value.isEmpty ? nil : value
                }(),
                startTime: formatter.string(from: start),
                endTime: formatter.string(from: end),
                planType: counterOf?.planType ?? "CUSTOM"
            )
            if let counterOf {
                let _: APIEnvelope<NativePlanEnvelopePayload> = try await session.sendAuthorized(
                    "api/v1/plans/\(counterOf.id)/counter",
                    method: .post,
                    body: body,
                    idempotencyKey: UUID().uuidString
                )
            } else {
                let _: APIEnvelope<NativePlanCreatePayload> = try await session.sendAuthorized(
                    "api/v1/connections/\(connectionID)/plans",
                    method: .post,
                    body: body,
                    idempotencyKey: UUID().uuidString
                )
            }
            onCreated()
            dismiss()
        } catch {
            issue = error.localizedDescription
        }
    }
}
