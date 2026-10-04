import SwiftUI

struct PlanCreateSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let target: PlanSubmissionTarget
    var recipientName: String? = nil
    var counterOf: NativePlanRequest? = nil
    var draft: NativePlanDraft? = nil
    var onAmbiguousFailure: () -> Void = {}
    let onCreated: (PlanSubmissionResult) -> Void

    @State private var title = ""
    @State private var repeatPlanType = "CUSTOM"
    @State private var location = ""
    @State private var message = ""
    @State private var start = Date().addingTimeInterval(60 * 60)
    @State private var end = Date().addingTimeInterval(2 * 60 * 60)
    @State private var isCreating = false
    @State private var issue: String?
    @State private var didSeed = false
    @State private var hasConfirmedTiming = false
    @State private var idempotencyKey: String?
    @State private var submissionSignature: String?
    @State private var showSmartTime = false
    @State private var suggestedTime: SmartTimeWindow?
    @State private var showsRepeatTimePicker = false
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
                    smartTimeEntry
                    recipientSummary
                    if counterOf != nil {
                        timing
                        planDetails
                    } else {
                        planDetails
                        timing
                    }
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
                draft?.isRepeat == true
                    ? String(format: AppLocalization.string("Plan again with %@"), recipientName ?? AppLocalization.string("This chat"))
                    : counterOf == nil
                    ? AppLocalization.string("Propose a plan")
                    : AppLocalization.string("Suggest another time")
            )
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isCreating)
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { focusedField = nil }
                        .accessibilityIdentifier("plan-editor-keyboard-done")
                }
            }
            .accessibilityIdentifier("plan-create-sheet")
            .safeAreaInset(edge: .bottom, spacing: 0) {
                SSFlowActionDock(
                    title: AppLocalization.string(draft?.isRepeat == true ? "Send invitation" : counterOf == nil ? "Send plan" : "Send new time"),
                    detail: draft?.isRepeat == true && !hasConfirmedTiming ? AppLocalization.string("Choose a new time") : "",
                    isLoading: isCreating,
                    isEnabled: canSend,
                    accessibilityID: "plan-create-submit"
                ) {
                    focusedField = nil
                    Task { await create() }
                }
            }
            .onAppear { seedIfNeeded() }
            .onChange(of: start) { oldValue, newValue in
                guard end <= newValue else { return }
                let previousDuration = max(end.timeIntervalSince(oldValue), 30 * 60)
                end = newValue.addingTimeInterval(previousDuration)
            }
            .sheet(isPresented: $showsRepeatTimePicker) {
                NavigationStack {
                    Form {
                        DatePicker("Starts", selection: $start, in: Date()..., displayedComponents: [.date, .hourAndMinute])
                        DatePicker("Ends", selection: $end, displayedComponents: [.date, .hourAndMinute])
                    }
                    .environment(\.locale, AppLocalization.selectedLanguage.locale)
                    .environment(\.timeZone, Calendar.sideSeatBerlin.timeZone)
                    .navigationTitle("Choose a new time")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel") { showsRepeatTimePicker = false }
                        }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done") { hasConfirmedTiming = true; showsRepeatTimePicker = false }
                                .disabled(start <= Date() || end.timeIntervalSince(start) < 30 * 60)
                                .accessibilityIdentifier("plan-repeat-time-done")
                        }
                    }
                }
                .ssFlowSheet(isSaving: false)
            }
            .sheet(isPresented: $showSmartTime) {
                SmartTimeSuggestionSheet(activityTitle: title) { window in
                    start = window.start
                    end = window.end
                    suggestedTime = window
                    hasConfirmedTiming = true
                    showSmartTime = false
                }
            }
        }
        .ssFlowSheet(isSaving: isCreating)
    }

    private var smartTimeEntry: some View {
        SSFlowCard(contentPadding: 0) {
            Button {
                focusedField = nil
                showSmartTime = true
            } label: {
                HStack(spacing: SideSeatTheme.spaceMD) {
                    Image(systemName: "sparkles")
                        .foregroundStyle(SideSeatTheme.HubTint.plans)
                    Text("Find a time together")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textPrimary)
                    Spacer(minLength: SideSeatTheme.spaceSM)
                    Image(systemName: "chevron.right")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.tertiary)
                }
                .padding(.horizontal, SideSeatTheme.spaceLG)
                .frame(minHeight: 52)
                .contentShape(Rectangle())
            }
            .buttonStyle(SSPressButtonStyle())
            .disabled(isCreating)
            .accessibilityIdentifier("plan-smart-time")
        }
    }

    private var recipientSummary: some View {
        SSFlowCard {
            SSFlowCardHeader(
                title: recipientName ?? AppLocalization.string("This chat"),
                subtitle: AppLocalization.string(counterOf == nil ? "Plan with" : "New time for"),
                systemImage: counterOf == nil ? "person.2" : "calendar.badge.clock"
            )
            if let counterOf, let previousStart = counterOf.startDate {
                Label(
                    previousStart.formatted(
                        .dateTime.month(.abbreviated).day().hour().minute()
                            .locale(AppLocalization.selectedLanguage.locale)),
                    systemImage: "clock.arrow.circlepath"
                )
                .font(.subheadline)
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
            } else if suggestedTime != nil {
                Text("Your chosen free time is filled in. The other person still needs to confirm.")
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
            } else if draft?.isSharedTimeSuggestion == true {
                Text(draft?.sharedTimeExpired == true
                    ? "The shared time has passed. Choose a new time to propose."
                    : "Their chosen time is filled in. Review it before sending your invitation.")
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .accessibilityIdentifier("plan-shared-time-hint")
            } else if needsExplicitTiming {
                Text("Your activity is filled in. Choose the time you want to propose.")
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
            } else if draft != nil {
                Text("Details from your conversation are already filled in.")
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
            }
        }
    }

    private var planDetails: some View {
        SSFlowCard {
            Text("Details")
                .font(.headline)

            if draft?.isRepeat == true {
                Picker("Activity", selection: $repeatPlanType) {
                    Text("Study").tag("STUDY")
                    Text("Food").tag("MEAL")
                    Text("Sports").tag("SPORTS")
                    Text("Languages").tag("LANGUAGE")
                    Text("Other").tag("CUSTOM")
                }
                .accessibilityIdentifier("plan-repeat-activity")
            }

            VStack(spacing: 0) {
                HStack(spacing: SideSeatTheme.spaceMD) {
                    Image(systemName: "text.cursor")
                        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .frame(width: 22)
                        .accessibilityHidden(true)
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
                        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .frame(width: 22)
                        .accessibilityHidden(true)
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
                        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .frame(width: 22)
                        .padding(.top, 3)
                        .accessibilityHidden(true)
                    TextField("Note (optional)", text: $message, axis: .vertical)
                        .lineLimit(2...4)
                        .focused($focusedField, equals: .note)
                        .accessibilityIdentifier("plan-create-message")
                }
                .padding(SideSeatTheme.spaceMD)
                .frame(minHeight: 58, alignment: .top)
            }
        }
    }

    private var timing: some View {
        SSFlowCard {
            Text("When")
                .font(.headline)

            if draft?.isRepeat == true && !hasConfirmedTiming {
                Button { showsRepeatTimePicker = true } label: {
                    Text("Choose a new time")
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .accessibilityIdentifier("plan-repeat-choose-time")
            } else {
                VStack(spacing: 0) {
                dateRow(label: AppLocalization.string("Starts"), icon: "clock", selection: $start)
                Divider().padding(.leading, 50)
                dateRow(label: AppLocalization.string("Ends"), icon: "clock.badge.checkmark", selection: $end)
                }
            }
            if needsExplicitTiming && draft?.isRepeat != true {
                Toggle("Propose these times", isOn: $hasConfirmedTiming)
                    .accessibilityIdentifier("plan-confirm-timing")
                Text("The other person still needs to accept. Nothing is added to your calendars yet.")
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
            }

            if start <= Date() {
                Text("Choose a future start time.")
                    .font(.caption)
                    .foregroundStyle(SideSeatTheme.danger)
            } else if end.timeIntervalSince(start) < 30 * 60 {
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
        let layout =
            dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SideSeatTheme.spaceSM))
            : AnyLayout(HStackLayout(spacing: SideSeatTheme.spaceSM))
        return layout {
            Label(label, systemImage: icon)
                .font(.subheadline)
                .frame(maxWidth: .infinity, alignment: .leading)
            DatePicker(label, selection: selection, displayedComponents: [.date, .hourAndMinute])
                .labelsHidden()
                .datePickerStyle(.compact)
                .environment(\.locale, AppLocalization.selectedLanguage.locale)
                .environment(\.timeZone, Calendar.sideSeatBerlin.timeZone)
                .accessibilityIdentifier(
                    label == AppLocalization.string("Starts") ? "plan-create-start" : "plan-create-end")
        }
        .padding(.vertical, SideSeatTheme.spaceSM)
        .frame(minHeight: 54)
    }

    private var calendarOutcome: some View {
        SSFlowNotice(
            text: AppLocalization.string(
                counterOf?.commitmentId != nil
                    ? "The confirmed Plan stays unchanged until this new time is accepted."
                    : "Once accepted, this plan appears in both calendars."
            ),
            systemImage: "calendar.badge.checkmark"
        )
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
            repeatPlanType = draft.planType
            location = draft.location ?? ""
            if let startDate = draft.startTime.flatMap(Date.sideSeatChatISO8601) {
                start = startDate
            }
            if let endDate = draft.endTime.flatMap(Date.sideSeatChatISO8601) {
                end = endDate
            } else {
                end = start.addingTimeInterval(draft.suggestedDuration ?? 60 * 60)
            }
        }
    }

    private var canSend: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && (!needsExplicitTiming || hasConfirmedTiming)
            && start > Date()
            && end.timeIntervalSince(start) >= 30 * 60
    }

    private var needsExplicitTiming: Bool {
        counterOf == nil && suggestedTime == nil && draft?.needsTimeSelection == true
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
                planType: draft?.isRepeat == true ? repeatPlanType : counterOf?.planType ?? draft?.planType ?? "CUSTOM",
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
            draft?.isRepeat == true ? repeatPlanType : counterOf?.planType ?? draft?.planType ?? "CUSTOM",
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
