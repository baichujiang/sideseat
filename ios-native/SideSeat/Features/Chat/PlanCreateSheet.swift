import SwiftUI

struct PlanCreateSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    let connectionID: String
    var recipientName: String? = nil
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
    @FocusState private var focusedField: Field?

    private enum Field: Hashable {
        case title
        case location
        case note
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceXL) {
                    recipientSummary
                    planDetails
                    timing
                    calendarOutcome

                    if let issue {
                        Label(issue, systemImage: "exclamationmark.circle")
                            .font(.footnote)
                            .foregroundStyle(SideSeatTheme.danger)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .accessibilityIdentifier("plan-create-issue")
                    }
                }
                .padding(.horizontal, SideSeatTheme.screenHorizontal)
                .padding(.top, SideSeatTheme.spaceLG)
                .padding(.bottom, SideSeatTheme.spaceXL)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(SideSeatTheme.bgGrouped)
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
                    Button {
                        focusedField = nil
                        Task { await create() }
                    } label: {
                        if isCreating {
                            ProgressView()
                        } else {
                            Text(
                                counterOf == nil
                                    ? String(localized: "Send plan")
                                    : String(localized: "Send new time")
                            )
                            .fontWeight(.semibold)
                        }
                    }
                    .disabled(!canSend || isCreating)
                    .accessibilityIdentifier("plan-create-submit")
                }
            }
            .onAppear { seedFromCounterIfNeeded() }
            .onChange(of: start) { oldValue, newValue in
                guard end <= newValue else { return }
                let previousDuration = max(end.timeIntervalSince(oldValue), 30 * 60)
                end = newValue.addingTimeInterval(previousDuration)
            }
            .accessibilityIdentifier("plan-create-sheet")
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    private var recipientSummary: some View {
        HStack(spacing: SideSeatTheme.spaceMD) {
            Image(systemName: counterOf == nil ? "person.crop.circle.badge.plus" : "arrow.triangle.2.circlepath")
                .font(.title2.weight(.semibold))
                .foregroundStyle(SideSeatTheme.accent)
                .frame(width: 42, height: 42)
                .background(SideSeatTheme.accent.opacity(0.10), in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(counterOf == nil ? String(localized: "Plan with") : String(localized: "New time for"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(recipientName ?? String(localized: "This chat"))
                    .font(.body.weight(.semibold))
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(SideSeatTheme.spaceMD)
        .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private var planDetails: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            Text("Details")
                .font(.headline)

            VStack(spacing: 0) {
                HStack(spacing: SideSeatTheme.spaceMD) {
                    Image(systemName: "text.cursor")
                        .foregroundStyle(SideSeatTheme.accent)
                        .frame(width: 22)
                    TextField("What are you planning?", text: $title)
                        .focused($focusedField, equals: .title)
                        .submitLabel(.next)
                        .onSubmit { focusedField = .location }
                        .accessibilityIdentifier("plan-create-title")
                }
                .padding(.horizontal, SideSeatTheme.spaceMD)
                .frame(minHeight: 50)

                Divider().padding(.leading, 50)

                HStack(spacing: SideSeatTheme.spaceMD) {
                    Image(systemName: "mappin.and.ellipse")
                        .foregroundStyle(SideSeatTheme.accent)
                        .frame(width: 22)
                    TextField("Location (optional)", text: $location)
                        .focused($focusedField, equals: .location)
                        .submitLabel(.next)
                        .onSubmit { focusedField = .note }
                        .accessibilityIdentifier("plan-create-location")
                }
                .padding(.horizontal, SideSeatTheme.spaceMD)
                .frame(minHeight: 50)

                Divider().padding(.leading, 50)

                HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
                    Image(systemName: "note.text")
                        .foregroundStyle(SideSeatTheme.accent)
                        .frame(width: 22)
                        .padding(.top, 3)
                    TextField("Note (optional)", text: $message, axis: .vertical)
                        .lineLimit(2...4)
                        .focused($focusedField, equals: .note)
                        .accessibilityIdentifier("plan-create-message")
                }
                .padding(SideSeatTheme.spaceMD)
                .frame(minHeight: 58, alignment: .top)
            }
            .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
    }

    private var timing: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            Text("When")
                .font(.headline)

            VStack(spacing: 0) {
                dateRow(label: String(localized: "Starts"), icon: "clock", selection: $start)
                Divider().padding(.leading, 50)
                dateRow(label: String(localized: "Ends"), icon: "clock.badge.checkmark", selection: $end)
            }
            .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))

            if end.timeIntervalSince(start) < 30 * 60 {
                Text("A plan must be at least 30 minutes.")
                    .font(.caption)
                    .foregroundStyle(SideSeatTheme.danger)
            }
        }
    }

    private func dateRow(
        label: String,
        icon: String,
        selection: Binding<Date>
    ) -> some View {
        HStack(spacing: SideSeatTheme.spaceMD) {
            Image(systemName: icon)
                .foregroundStyle(SideSeatTheme.accent)
                .frame(width: 22)
            Text(label)
                .font(.body)
            Spacer(minLength: SideSeatTheme.spaceSM)
            DatePicker(label, selection: selection, displayedComponents: [.date, .hourAndMinute])
                .labelsHidden()
                .datePickerStyle(.compact)
                .accessibilityIdentifier(label == String(localized: "Starts") ? "plan-create-start" : "plan-create-end")
        }
        .padding(.horizontal, SideSeatTheme.spaceMD)
        .frame(minHeight: 54)
    }

    private var calendarOutcome: some View {
        HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
            Image(systemName: "calendar.badge.checkmark")
                .font(.body.weight(.semibold))
                .foregroundStyle(SideSeatTheme.success)
                .frame(width: 34, height: 34)
                .background(SideSeatTheme.success.opacity(0.10), in: Circle())
            VStack(alignment: .leading, spacing: 3) {
                Text("Added after acceptance")
                    .font(.subheadline.weight(.semibold))
                Text("Once accepted, this plan appears in both calendars.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(SideSeatTheme.spaceMD)
        .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
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
                location: normalized(location),
                message: normalized(message),
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

    private func normalized(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
