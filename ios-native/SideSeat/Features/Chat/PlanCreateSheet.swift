import SwiftUI

struct PlanCreateSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    let target: PlanSubmissionTarget
    var recipientName: String? = nil
    var counterOf: NativePlanRequest? = nil
    var draft: NativePlanDraft? = nil
    var onAmbiguousFailure: () -> Void = {}
    let onCreated: (PlanSubmissionResult) -> Void

    @State private var title = ""
    @State private var location = ""
    @State private var message = ""
    @State private var start = Date().addingTimeInterval(60 * 60)
    @State private var end = Date().addingTimeInterval(2 * 60 * 60)
    @State private var isCreating = false
    @State private var issue: String?
    @State private var didSeed = false
    @State private var idempotencyKey: String?
    @State private var submissionSignature: String?
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
                    ? AppLocalization.string( "Propose a plan")
                    : AppLocalization.string( "Suggest another time")
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
                                    ? AppLocalization.string( "Send plan")
                                    : AppLocalization.string( "Send new time")
                            )
                            .fontWeight(.semibold)
                        }
                    }
                    .disabled(!canSend || isCreating)
                    .ssConfirmationActionStyle()
                    .accessibilityIdentifier("plan-create-submit")
                }
            }
            .onAppear { seedIfNeeded() }
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
                .foregroundStyle(SideSeatTheme.HubTint.plans)
                .frame(width: 42, height: 42)
                .background(SideSeatTheme.HubTint.plans.opacity(0.12), in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(counterOf == nil ? AppLocalization.string( "Plan with") : AppLocalization.string( "New time for"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(recipientName ?? AppLocalization.string( "This chat"))
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
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
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
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
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
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
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
                dateRow(label: AppLocalization.string( "Starts"), icon: "clock", selection: $start)
                Divider().padding(.leading, 50)
                dateRow(label: AppLocalization.string( "Ends"), icon: "clock.badge.checkmark", selection: $end)
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
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .frame(width: 22)
            Text(label)
                .font(.body)
            Spacer(minLength: SideSeatTheme.spaceSM)
            DatePicker(label, selection: selection, displayedComponents: [.date, .hourAndMinute])
                .labelsHidden()
                .datePickerStyle(.compact)
                .accessibilityIdentifier(label == AppLocalization.string( "Starts") ? "plan-create-start" : "plan-create-end")
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

    private func seedIfNeeded() {
        guard !didSeed else { return }
        didSeed = true
        if let plan = counterOf {
            title = plan.title
            location = plan.location ?? ""
            message = plan.message ?? ""
            if let startDate = plan.startDate {
                start = startDate.addingTimeInterval(60 * 60)
            }
            if let endDate = plan.endDate {
                end = endDate.addingTimeInterval(60 * 60)
            }
            return
        }
        if let draft {
            title = draft.title
            location = draft.location ?? ""
            if let startDate = draft.startTime.flatMap(Date.sideSeatChatISO8601) {
                start = startDate
            }
            if let endDate = draft.endTime.flatMap(Date.sideSeatChatISO8601) {
                end = endDate
            } else {
                end = start.addingTimeInterval(60 * 60)
            }
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
            onCreated(PlanSubmissionResult(
                connectionID: fallbackConnectionID,
                commitmentID: nil,
                revisionID: "ui-plan-\(UUID().uuidString)",
                contextID: nil
            ))
            dismiss()
            return
        }
        #endif

        do {
            prepareIdempotencyKey()
            let body = NativePlanCreateRequest(
                title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                location: normalized(location),
                message: normalized(message),
                startTime: formatter.string(from: start),
                endTime: formatter.string(from: end),
                planType: counterOf?.planType ?? draft?.planType ?? "CUSTOM",
                origin: counterOf == nil ? draft?.origin : nil
            )
            let result = try await submit(body)
            onCreated(result)
            dismiss()
        } catch is CancellationError {
            if case .coordination = target { onAmbiguousFailure() }
        } catch {
            if case .coordination = target,
               let apiError = error as? APIClientError,
               apiError.shouldPreserveIdempotencyKey
            {
                onAmbiguousFailure()
            }
            if let recovered = recoveryResult(from: error) {
                onCreated(recovered)
                dismiss()
                return
            }
            if let apiError = error as? APIClientError,
               !apiError.shouldPreserveIdempotencyKey {
                submissionSignature = nil
                idempotencyKey = nil
            }
            issue = error.localizedDescription
        }
    }

    private func submit(_ legacyBody: NativePlanCreateRequest) async throws -> PlanSubmissionResult {
        switch target {
        case .legacyConnection(let connectionID):
            let envelope: APIEnvelope<NativePlanCreatePayload> = try await session.sendAuthorized(
                "api/v1/connections/\(connectionID)/plans",
                method: .post,
                body: legacyBody,
                idempotencyKey: requiredIdempotencyKey
            )
            return result(from: envelope.data.plan)
        case .legacyCounter(let planID):
            let envelope: APIEnvelope<NativePlanEnvelopePayload> = try await session.sendAuthorized(
                "api/v1/plans/\(planID)/counter",
                method: .post,
                body: legacyBody,
                idempotencyKey: requiredIdempotencyKey
            )
            return result(from: envelope.data.plan)
        case .actionContext(let contextID):
            let envelope: Components.Schemas.ActionPlanMutationEnvelope = try await session.sendAuthorized(
                "api/v1/action-coordination/v2/contexts/\(contextID)/plans",
                method: .post,
                body: actionPlanInput,
                idempotencyKey: requiredIdempotencyKey
            )
            return result(from: envelope.plan, contextID: contextID)
        case .actionCounter(let revisionID, _, let contextID):
            let envelope: Components.Schemas.ActionPlanMutationEnvelope = try await session.sendAuthorized(
                "api/v1/action-coordination/v2/plans/\(revisionID)/counter",
                method: .post,
                body: actionPlanInput,
                idempotencyKey: requiredIdempotencyKey
            )
            return result(from: envelope.plan, contextID: contextID)
        case .coordination(let reservationID):
            let firstPlan = Components.Schemas.ActionCoordinationFirstPlanContent(
                _type: .plan,
                planType: firstPlanType,
                title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                location: normalized(location),
                message: normalized(message),
                startTime: start,
                endTime: end
            )
            let request = Components.Schemas.ActionCoordinationActivationRequest(
                firstContent: .plan(firstPlan)
            )
            let envelope: Components.Schemas.ActionCoordinationActivationEnvelope = try await session.sendAuthorized(
                "api/v1/action-coordination/v2/reservations/\(reservationID)/activate",
                method: .post,
                body: request,
                idempotencyKey: requiredIdempotencyKey
            )
            guard case .plan(let activation) = envelope.activation else {
                throw APIClientError.invalidResponse
            }
            return PlanSubmissionResult(
                connectionID: activation.connectionId,
                commitmentID: activation.commitmentId,
                revisionID: activation.revisionId,
                contextID: activation.contextId
            )
        }
    }

    private var fallbackConnectionID: String {
        switch target {
        case .legacyConnection(let id): id
        case .legacyCounter: counterOf?.connectionId ?? "ui-connection"
        case .actionCounter: counterOf?.connectionId ?? "ui-connection"
        case .actionContext, .coordination: "ui-connection"
        }
    }

    private var requiredIdempotencyKey: String {
        idempotencyKey ?? "plan-\(UUID().uuidString)"
    }

    private func prepareIdempotencyKey() {
        let signature = [
            String(describing: target),
            title.trimmingCharacters(in: .whitespacesAndNewlines),
            normalized(location) ?? "",
            normalized(message) ?? "",
            start.formatted(.iso8601),
            end.formatted(.iso8601),
            counterOf?.planType ?? draft?.planType ?? "CUSTOM",
        ].joined(separator: "\u{1F}")
        if submissionSignature != signature {
            submissionSignature = signature
            idempotencyKey = UUID().uuidString
        }
    }

    private var actionPlanInput: Components.Schemas.ActionPlanInput {
        Components.Schemas.ActionPlanInput(
            planType: actionPlanType,
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            location: normalized(location),
            message: normalized(message),
            startTime: start,
            endTime: end
        )
    }

    private var actionPlanType: Components.Schemas.ActionPlanInput.PlanTypePayload {
        .init(rawValue: counterOf?.planType ?? draft?.planType ?? "CUSTOM") ?? .custom
    }

    private var firstPlanType: Components.Schemas.ActionCoordinationFirstPlanContent.PlanTypePayload {
        .init(rawValue: counterOf?.planType ?? draft?.planType ?? "CUSTOM") ?? .custom
    }

    private func result(from plan: NativePlanRequest) -> PlanSubmissionResult {
        PlanSubmissionResult(
            connectionID: plan.connectionId,
            commitmentID: plan.commitmentId,
            revisionID: plan.id,
            contextID: plan.originContextId
        )
    }

    private func result(
        from mutation: Components.Schemas.ActionPlanMutation,
        contextID: String
    ) -> PlanSubmissionResult {
        PlanSubmissionResult(
            connectionID: mutation.connectionId,
            commitmentID: mutation.commitmentId,
            revisionID: mutation.revisionId,
            contextID: contextID
        )
    }

    private func recoveryResult(from error: Error) -> PlanSubmissionResult? {
        guard case .server(_, let payload) = error as? APIClientError,
              payload.recovery?.action == "OPEN_PLAN",
              let focus = payload.recovery?.focus,
              let connectionID = focus.connectionId,
              let commitmentID = focus.commitmentId
        else { return nil }
        return PlanSubmissionResult(
            connectionID: connectionID,
            commitmentID: commitmentID,
            revisionID: focus.revisionId,
            contextID: focus.contextId
        )
    }

    private func normalized(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
