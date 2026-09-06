import SwiftUI
import UIKit

enum TogetherOpportunityPresentationState: Equatable, Sendable {
    case undecided
    case privateYes
    case mutual
    case expired
    case unavailable

    init(state: String, viewerDecision: String?, hasCoordination: Bool) {
        switch state {
        case "READY_TO_COORDINATE" where hasCoordination:
            self = .mutual
        case "DECIDED" where viewerDecision == "YES":
            self = .privateYes
        case "NEEDS_DECISION" where viewerDecision == nil:
            self = .undecided
        case "EXPIRED":
            self = .expired
        default:
            self = .unavailable
        }
    }

    init(_ opportunity: NativeMutualOpportunity) {
        self.init(
            state: opportunity.state,
            viewerDecision: opportunity.viewerDecision,
            hasCoordination: opportunity.coordination != nil
        )
    }
}

private struct TogetherAssignmentLoadID: Equatable {
    let userID: String?
    let canMakeAuthenticatedRequests: Bool
}

private struct WeeklyIntentEditorPresentation: Identifiable {
    let id: String
    let intent: NativeWeeklyIntent?

    static func create() -> Self {
        Self(id: "create", intent: nil)
    }

    static func edit(_ intent: NativeWeeklyIntent) -> Self {
        Self(id: intent.id, intent: intent)
    }
}

struct TogetherRootView: View {
    @Environment(SessionStore.self) private var session
    @State private var v2Store = ActionToPlanV2Store.shared

    var body: some View {
        Group {
            if !v2Store.hasLoadedAssignment, session.isOffline {
                TogetherAssignmentOfflineView(
                    isReconnecting: session.isRestoringConnection
                ) {
                    Task {
                        await session.retryConnection()
                        guard session.canMakeAuthenticatedRequests else { return }
                        await v2Store.loadAssignment(using: session, force: true)
                    }
                }
            } else if !v2Store.hasLoadedAssignment ||
                (v2Store.isLoadingAssignment && v2Store.assignment == nil)
            {
                TogetherAssignmentLoadingView()
            } else if let issue = v2Store.assignmentIssue,
                      v2Store.assignment == nil
            {
                TogetherAssignmentFailureView(issue: issue) {
                    Task {
                        await v2Store.loadAssignment(using: session, force: true)
                    }
                }
            } else {
                TogetherHomeView()
            }
        }
        .task(
            id: TogetherAssignmentLoadID(
                userID: session.currentUser?.id,
                canMakeAuthenticatedRequests: session.canMakeAuthenticatedRequests
            )
        ) {
            guard session.canMakeAuthenticatedRequests else { return }
            await v2Store.loadAssignment(using: session)
        }
    }
}

private struct TogetherAssignmentOfflineView: View {
    let isReconnecting: Bool
    let onReconnect: () -> Void

    var body: some View {
        ContentUnavailableView {
            Label("Together is offline", systemImage: "wifi.slash")
        } description: {
            Text("Reconnect to load your latest Together opportunities.")
        } actions: {
            Button(action: onReconnect) {
                if isReconnecting {
                    ProgressView()
                } else {
                    Text("Reconnect")
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(isReconnecting)
        }
        .background(SideSeatTheme.bgGrouped)
        .ssRootNavigationTitle("Together")
        .accessibilityIdentifier("together-assignment-offline")
    }
}

private struct TogetherAssignmentLoadingView: View {
    var body: some View {
        VStack(spacing: SideSeatTheme.spaceMD) {
            ProgressView()
            Text("Loading Together…")
                .font(.subheadline)
                .foregroundStyle(SideSeatTheme.textSecondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(SideSeatTheme.bgGrouped)
        .ssRootNavigationTitle("Together")
        .accessibilityIdentifier("together-assignment-loading")
    }
}

private struct TogetherAssignmentFailureView: View {
    let issue: String
    let onRetry: () -> Void

    var body: some View {
        ContentUnavailableView {
            Label("Together couldn't load", systemImage: "wifi.exclamationmark")
        } description: {
            Text(issue)
        } actions: {
            Button("Try again", action: onRetry)
                .buttonStyle(.borderedProminent)
        }
        .background(SideSeatTheme.bgGrouped)
        .ssRootNavigationTitle("Together")
        .accessibilityIdentifier("together-assignment-failure")
    }
}

private struct TogetherHomeView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    @State private var store = WeeklyIntentStore()
    @State private var matchingSessionStore = TogetherMatchingSessionStore()
    @State private var opportunityStore = MutualOpportunityStore()
    @State private var v2Store = ActionToPlanV2Store.shared
    @State private var presentedEditor: WeeklyIntentEditorPresentation?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: SideSeatTheme.spaceXL) {
                if v2Store.isWeeklyIntentEnabled {
                    intentSection
                } else {
                    unavailableSection
                }
                if v2Store.isMutualOpportunityEnabled {
                    matchingSessionSection
                    opportunitySection
                }
            }
            .padding(.horizontal, SideSeatTheme.screenHorizontal)
            .padding(.top, SideSeatTheme.spaceMD)
            .padding(.bottom, SideSeatTheme.spaceXL)
        }
        .background(SideSeatTheme.bgGrouped)
        .ssRootNavigationTitle("Together")
        .refreshable {
            await loadContent()
        }
        .task {
            await loadContent()
        }
        .onReceive(NotificationCenter.default.publisher(for: .sideSeatTogetherNeedsRefresh)) { _ in
            Task { await loadContent() }
        }
        .sheet(item: $presentedEditor) { presentation in
            WeeklyIntentEditorView(intent: presentation.intent) {
                topic,
                activityText,
                sportTag,
                sportOtherNote,
                togetherMode,
                studyGoal,
                courseId,
                timeWindows,
                note in
                let saved = await store.save(
                    intent: presentation.intent,
                    topic: topic,
                    activityText: activityText,
                    sportTag: sportTag,
                    sportOtherNote: sportOtherNote,
                    togetherMode: togetherMode,
                    studyGoal: studyGoal,
                    courseId: courseId,
                    timeWindows: timeWindows,
                    note: note,
                    using: session
                )
                if saved {
                    await refreshOpportunitiesAfterIntentChange()
                    presentedEditor = nil
                }
                return saved
            }
            .presentationDetents([.large])
            .presentationDragIndicator(.visible)
            .presentationBackground(SideSeatTheme.bgGrouped)
        }
        .accessibilityIdentifier("together-home")
    }

    @ViewBuilder
    private var intentSection: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            SSProductSectionHeader(
                title: AppLocalization.string("This week"),
                actionTitle: AppLocalization.string("Add"),
                accessibilityID: "together-intent-section-title",
                actionAccessibilityID: "together-add-intent",
                onAction: { presentedEditor = .create() }
            )
            .disabled(store.isCreating)

            if store.isLoading, store.intents.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 72)
            } else if store.intents.isEmpty {
                SSEmptyState(
                    title: "What would you like to do?",
                    systemImage: "sparkles",
                    description: "Set one private intention for this week. It is not a public post.",
                    actionTitle: AppLocalization.string("Set this week's intention"),
                    actionAccessibilityID: "together-set-intent",
                    action: { presentedEditor = .create() }
                )
                .padding(.vertical, SideSeatTheme.spaceSM)
            } else {
                ForEach(store.intents) { intent in
                    WeeklyIntentCard(
                        intent: intent,
                        isWorking: store.mutatingIDs.contains(intent.id),
                        onEdit: { presentedEditor = .edit(intent) },
                        onPause: {
                            Task {
                                let changed = await store.setPaused(
                                    !intent.isPaused,
                                    intent: intent,
                                    using: session
                                )
                                if changed {
                                    await refreshOpportunitiesAfterIntentChange()
                                }
                            }
                        },
                        onEnd: {
                            Task {
                                let changed = await store.end(intent, using: session)
                                if changed {
                                    await refreshOpportunitiesAfterIntentChange()
                                }
                            }
                        }
                    )
                }
            }

            if let issue = store.issue {
                Text(issue)
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.danger)
            }
        }
    }

    private var matchingSessionSection: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            SSProductSectionHeader(
                title: AppLocalization.string("Matching"),
                accessibilityID: "together-matching-section-title"
            )

            if matchingSessionStore.isLoading,
               !matchingSessionStore.hasLoaded
            {
                HStack(spacing: SideSeatTheme.spaceSM) {
                    ProgressView()
                    Text("Loading matching status")
                        .font(.subheadline)
                        .foregroundStyle(SideSeatTheme.textSecondary)
                }
                .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
            } else {
                TimelineView(.periodic(from: .now, by: 60)) { context in
                    matchingSessionContent(at: context.date)
                }
            }

            if let issue = matchingSessionStore.issue {
                Text(issue)
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.danger)
            }
        }
        .accessibilityIdentifier("together-matching-session")
    }

    @ViewBuilder
    private func matchingSessionContent(at now: Date) -> some View {
        if matchingSessionStore.session.isMatching(at: now) {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                HStack(alignment: .firstTextBaseline, spacing: SideSeatTheme.spaceSM) {
                    SSInlineStatus(
                        text: AppLocalization.string("Matching is active"),
                        systemImage: "dot.radiowaves.left.and.right",
                        tone: .neutral,
                        accessibilityID: "together-matching-status"
                    )
                    Spacer(minLength: SideSeatTheme.spaceSM)
                    if let remaining = matchingSessionStore.session.remainingText(at: now) {
                        Text(remaining)
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    }
                }

                if let remainingFraction = matchingSessionStore.session.remainingFraction(at: now) {
                    ProgressView(value: remainingFraction)
                        .tint(SideSeatTheme.textSecondaryStrong)
                        .accessibilityLabel("Matching time remaining")
                }

                Button {
                    Task {
                        _ = await matchingSessionStore.stop(using: session)
                    }
                } label: {
                    HStack(spacing: SideSeatTheme.spaceSM) {
                        if matchingSessionStore.isMutating {
                            ProgressView()
                        }
                        Text("Stop matching")
                            .font(.body.weight(.medium))
                    }
                    .frame(minHeight: 44)
                }
                .buttonStyle(.bordered)
                .disabled(matchingSessionStore.isMutating)
                .accessibilityIdentifier("together-stop-matching")
            }
        } else if matchingSessionStore.session.hasExpired(at: now) {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                SSInlineStatus(
                    text: AppLocalization.string("Matching ended"),
                    systemImage: "clock",
                    tone: .neutral,
                    accessibilityID: "together-matching-ended"
                )
                Text("Start another 48-hour round.")
                    .font(.subheadline)
                    .foregroundStyle(SideSeatTheme.textSecondary)

                SSPrimaryButton(
                    title: AppLocalization.string("Match again"),
                    isLoading: matchingSessionStore.isMutating,
                    fill: .product,
                    height: 46,
                    accessibilityID: "together-restart-matching"
                ) {
                    Task {
                        let started = await matchingSessionStore.start(using: session)
                        if started {
                            await opportunityStore.load(using: session)
                        }
                    }
                }
                .disabled(activeIntents.isEmpty || matchingSessionStore.isMutating)

                if activeIntents.isEmpty {
                    Label("Add something you want to do first.", systemImage: "info.circle")
                        .font(.footnote)
                        .foregroundStyle(SideSeatTheme.textSecondary)
                }
            }
        } else {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                SSInlineStatus(
                    text: AppLocalization.string("Start matching when you're ready"),
                    systemImage: "person.2",
                    tone: .neutral,
                    accessibilityID: "together-matching-idle"
                )
                Text("Match all your active intentions for 48 hours.")
                    .font(.subheadline)
                    .foregroundStyle(SideSeatTheme.textSecondary)

                SSPrimaryButton(
                    title: AppLocalization.string("Start matching"),
                    isLoading: matchingSessionStore.isMutating,
                    fill: .product,
                    height: 46,
                    accessibilityID: "together-start-matching"
                ) {
                    Task {
                        let started = await matchingSessionStore.start(using: session)
                        if started {
                            await opportunityStore.load(using: session)
                        }
                    }
                }
                .disabled(activeIntents.isEmpty || matchingSessionStore.isMutating)

                if activeIntents.isEmpty {
                    Label("Add something you want to do first.", systemImage: "info.circle")
                        .font(.footnote)
                        .foregroundStyle(SideSeatTheme.textSecondary)
                        .accessibilityIdentifier("together-start-matching-disabled-reason")
                }
            }
        }
    }

    private var unavailableSection: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            SSProductSectionHeader(title: AppLocalization.string("This week"))
            SSEmptyState(
                title: "Together isn't enabled for this account yet",
                systemImage: "person.2.slash",
                description: "Your main navigation will stay the same. Check again when access is enabled.",
                actionTitle: AppLocalization.string("Check again"),
                action: {
                    Task {
                        await v2Store.loadAssignment(using: session, force: true)
                    }
                }
            )
        }
        .accessibilityIdentifier("together-not-enabled")
    }

    @ViewBuilder
    private var opportunitySection: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            SSProductSectionHeader(
                title: "Opportunities",
                accessibilityID: "together-opportunities-section-title"
            )

            if opportunityStore.isLoading, opportunityStore.opportunities.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 72)
            } else if opportunityStore.opportunities.isEmpty {
                emptyOpportunityState
            } else {
                ForEach(opportunityStore.opportunities) { opportunity in
                    opportunityCard(opportunity)
                }
            }

            if let issue = opportunityStore.issue,
               v2Store.isMutualOpportunityEnabled
            {
                Text(issue)
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.danger)
            }
        }
    }

    private var emptyOpportunityState: some View {
        TimelineView(.periodic(from: .now, by: 60)) { context in
            let isMatching = matchingSessionStore.session.isMatching(at: context.date)
            let hasExpired = matchingSessionStore.session.hasExpired(at: context.date)
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                SSInlineStatus(
                    text: AppLocalization.string(
                        isMatching
                            ? "Matching is active"
                            : hasExpired
                                ? "Matching ended"
                                : "Start matching when you're ready"
                    ),
                    systemImage: isMatching ? "dot.radiowaves.left.and.right" : "person.2",
                    tone: .neutral
                )
                Text(
                    AppLocalization.string(
                        isMatching
                            ? "When SideSeat finds someone compatible, they will appear here."
                            : hasExpired
                                ? "Start another 48-hour round."
                                : "Tap Start matching above to look for people across your active intentions."
                    )
                )
                .font(.footnote)
                .foregroundStyle(SideSeatTheme.textSecondary)
            }
            .padding(.vertical, SideSeatTheme.spaceMD)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityIdentifier("together-opportunities-empty")
    }

    private func opportunityCard(_ opportunity: NativeMutualOpportunity) -> some View {
        MutualOpportunityCard(
            opportunity: opportunity,
            isWorking: opportunityStore.mutatingIDs.contains(opportunity.id),
            onYes: {
                Task {
                    await opportunityStore.decide(
                        "YES",
                        opportunity: opportunity,
                        using: session
                    )
                    await store.load(using: session)
                }
            },
            onNo: {
                Task {
                    await opportunityStore.decide(
                        "NO",
                        opportunity: opportunity,
                        using: session
                    )
                    await store.load(using: session)
                }
            },
            onWithdraw: {
                Task {
                    await opportunityStore.withdraw(
                        opportunity: opportunity,
                        using: session
                    )
                    await store.load(using: session)
                }
            },
            onOpenConversation: {
                guard let connectionID = opportunity.coordination?.connectionId else { return }
                router.navigate(to: .directChat(connectionID: connectionID))
            }
        )
    }

    private func loadContent() async {
        if v2Store.isWeeklyIntentEnabled {
            if v2Store.isMutualOpportunityEnabled {
                async let intentLoad: Void = store.load(using: session)
                async let matchingSessionLoad: Void = matchingSessionStore.load(using: session)
                async let opportunityLoad: Void = opportunityStore.load(using: session)
                _ = await (intentLoad, matchingSessionLoad, opportunityLoad)
            } else {
                await store.load(using: session)
            }
        } else if v2Store.isMutualOpportunityEnabled {
            await opportunityStore.load(using: session)
        }
    }

    private func refreshOpportunitiesAfterIntentChange() async {
        guard v2Store.isMutualOpportunityEnabled else { return }
        await opportunityStore.load(using: session)
    }

    private var activeIntents: [NativeWeeklyIntent] {
        store.intents.filter { $0.status == "ACTIVE" }
    }
}

private struct MutualOpportunityCard: View {
    let opportunity: NativeMutualOpportunity
    let isWorking: Bool
    let onYes: () -> Void
    let onNo: () -> Void
    let onWithdraw: () -> Void
    let onOpenConversation: () -> Void

    private var presentationState: TogetherOpportunityPresentationState {
        TogetherOpportunityPresentationState(opportunity)
    }

    var body: some View {
        SSCard {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                Label {
                    Text(opportunity.activityTitle)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                } icon: {
                    Image(systemName: opportunity.topic.systemImage)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.accentText)
                }

                Label(opportunityWindow, systemImage: "clock")
                    .font(.subheadline)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .fixedSize(horizontal: false, vertical: true)

                trustContext

                Divider()

                HStack(spacing: SideSeatTheme.spaceSM) {
                    InitialAvatar(
                        name: opportunity.peer.displayName,
                        url: opportunity.peer.avatarUrl,
                        size: 38
                    )
                    VStack(alignment: .leading, spacing: 2) {
                        Text(opportunity.peer.displayName)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(SideSeatTheme.textPrimary)
                        if !peerContext.isEmpty {
                            Text(peerContext)
                                .font(.caption)
                                .foregroundStyle(SideSeatTheme.textSecondary)
                                .lineLimit(2)
                        }
                    }
                }

                decisionArea
            }
        }
        .accessibilityIdentifier("mutual-opportunity-\(opportunity.id)")
    }

    private var trustContext: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            HStack(alignment: .firstTextBaseline, spacing: SideSeatTheme.spaceSM) {
                SSInlineStatus(
                    text: opportunity.matchTitle,
                    systemImage: opportunity.effectiveMatchKind == .sharedContext
                        ? "building.2.fill"
                        : "equal.circle.fill",
                    tone: .neutral
                )
                Spacer(minLength: SideSeatTheme.spaceSM)
                if opportunity.peer.verifiedStudent {
                    SSVerifiedSeal(
                        label: AppLocalization.string("Verified student"),
                        compact: true,
                        accessibilityID: "mutual-opportunity-verified-\(opportunity.id)"
                    )
                }
            }

            Text(opportunity.matchExplanation)
                .font(.footnote)
                .foregroundStyle(SideSeatTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            if let course = opportunity.course {
                Label(
                    [course.code, course.name].compactMap { $0 }.joined(separator: " "),
                    systemImage: "book.closed"
                )
                .font(.footnote)
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
            }

            if opportunity.topic == .study {
                explanationRow(
                    title: AppLocalization.string("Your plan"),
                    value: opportunity.viewerStudyGoalTitle
                )
                explanationRow(
                    title: String(
                        format: AppLocalization.string("%@'s plan"),
                        opportunity.peer.displayName
                    ),
                    value: opportunity.peerStudyGoalTitle
                )
            }
        }
        .padding(SideSeatTheme.spaceMD)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            SideSeatTheme.fillSubtle,
            in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
        )
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("mutual-opportunity-trust-\(opportunity.id)")
    }

    @ViewBuilder
    private var decisionArea: some View {
        switch presentationState {
        case .mutual:
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                SSInlineStatus(
                    text: AppLocalization.string("You both want to do this"),
                    systemImage: "checkmark.circle.fill",
                    tone: .success,
                    accessibilityID: "mutual-opportunity-mutual-\(opportunity.id)"
                )
                SSPrimaryButton(
                    title: AppLocalization.string("Start planning"),
                    fill: .product,
                    height: 44,
                    accessibilityID: "mutual-opportunity-open-\(opportunity.id)"
                ) { onOpenConversation() }
            }

        case .privateYes:
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                Label("Your choice is saved privately", systemImage: "lock.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.textPrimary)
                Text("Only you can see this.")
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.textSecondary)
                Button("Withdraw", action: onWithdraw)
                    .buttonStyle(.bordered)
                    .disabled(isWorking)
            }
            .accessibilityIdentifier("mutual-opportunity-saved-\(opportunity.id)")

        case .undecided:
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                Text("SideSeat found someone for this activity")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                HStack(spacing: SideSeatTheme.spaceSM) {
                    Button("Not this time", action: onNo)
                        .buttonStyle(.bordered)
                        .frame(maxWidth: .infinity)
                    Button("Do it together", action: onYes)
                        .buttonStyle(.borderedProminent)
                        .tint(SideSeatTheme.accent)
                        .foregroundStyle(SideSeatTheme.onAccent)
                        .frame(maxWidth: .infinity)
                }
                .disabled(isWorking)
            }

        case .expired:
            SSInlineStatus(
                text: AppLocalization.string("Expired"),
                systemImage: "clock",
                tone: .warning,
                accessibilityID: "mutual-opportunity-expired-\(opportunity.id)"
            )

        case .unavailable:
            SSInlineStatus(
                text: AppLocalization.string("Details are no longer available."),
                systemImage: "minus.circle",
                tone: .neutral,
                accessibilityID: "mutual-opportunity-unavailable-\(opportunity.id)"
            )
        }
    }

    private func explanationRow(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
            Text(value)
                .font(.footnote)
                .foregroundStyle(SideSeatTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var opportunityWindow: String {
        guard let start = opportunity.startDate,
              let end = opportunity.endDate
        else {
            return AppLocalization.string("Overlapping availability")
        }
        let startText = start.formatted(date: .abbreviated, time: .shortened)
        let endText = end.formatted(
            date: Calendar.current.isDate(start, inSameDayAs: end) ? .omitted : .abbreviated,
            time: .shortened
        )
        return "\(startText) – \(endText)"
    }

    private var peerContext: String {
        let language = opportunity.peer.sharedLanguages.first.map(languageTitle)
        return [opportunity.peer.major, language]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }

    private func languageTitle(_ tag: String) -> String {
        switch tag {
        case "CHINESE": AppLocalization.string("Chinese")
        case "ENGLISH": AppLocalization.string("English")
        case "GERMAN": AppLocalization.string("German")
        case "FRENCH": AppLocalization.string("French")
        case "HINDI": AppLocalization.string("Hindi")
        case "SPANISH": AppLocalization.string("Spanish")
        default: AppLocalization.string("Other")
        }
    }
}

private struct WeeklyIntentCard: View {
    let intent: NativeWeeklyIntent
    let isWorking: Bool
    let onEdit: () -> Void
    let onPause: () -> Void
    let onEnd: () -> Void

    private var isEnded: Bool { intent.status == "ENDED" }

    var body: some View {
        SSCard {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
                    Image(systemName: intent.topic.systemImage)
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.accentText)
                        .frame(width: 38, height: 38)
                        .background(SideSeatTheme.accent.opacity(0.08), in: Circle())
                    VStack(alignment: .leading, spacing: 4) {
                        Text(intent.activityTitle)
                            .font(.headline)
                        if intent.topic == .sports, intent.sportTag != nil {
                            Text("Sports")
                                .font(.caption)
                                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        }
                        if intent.topic == .study {
                            Text(intent.effectiveTogetherMode.studyTitle)
                                .font(.caption)
                                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        if let course = intent.course {
                            Text(courseTitle(course))
                                .font(.caption)
                                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                                .lineLimit(1)
                        }
                    }
                    Spacer(minLength: SideSeatTheme.spaceSM)
                    if !isEnded {
                        Menu {
                            Button("Edit", systemImage: "pencil", action: onEdit)
                            Button(
                                intent.isPaused ? "Resume" : "Pause",
                                systemImage: intent.isPaused ? "play.fill" : "pause.fill",
                                action: onPause
                            )
                            Divider()
                            Button(
                                "End",
                                systemImage: "stop.circle",
                                role: .destructive,
                                action: onEnd
                            )
                        } label: {
                            Image(systemName: "ellipsis")
                                .font(.headline)
                                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                                .frame(width: 44, height: 44)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .disabled(isWorking)
                        .accessibilityLabel("More")
                    }
                }

                VStack(alignment: .leading, spacing: 5) {
                    let windows = intent.relevantTimeWindows()
                    ForEach(Array(windows.prefix(2).enumerated()), id: \.offset) { _, window in
                        Label {
                            Text(windowSummary(window))
                        } icon: {
                            Image(systemName: "clock")
                        }
                        .font(.subheadline)
                        .foregroundStyle(SideSeatTheme.textSecondary)
                    }
                    if windows.count > 2 {
                        Text(
                            String(
                                format: AppLocalization.string("%lld more times"),
                                Int64(windows.count - 2)
                            )
                        )
                        .font(.caption)
                        .foregroundStyle(SideSeatTheme.textSecondary)
                        .padding(.leading, 22)
                    }
                }

                if let note = intent.note, !note.isEmpty {
                    Text(note)
                        .font(.subheadline)
                        .foregroundStyle(SideSeatTheme.textSecondary)
                        .lineLimit(2)
                }

                if intent.isPaused {
                    SSInlineStatus(
                        text: AppLocalization.string("Paused"),
                        systemImage: "pause.fill",
                        tone: .neutral,
                        accessibilityID: "weekly-intent-paused-\(intent.id)"
                    )
                } else if isEnded {
                    SSInlineStatus(
                        text: AppLocalization.string("Ended"),
                        systemImage: "stop.circle",
                        tone: .neutral,
                        accessibilityID: "weekly-intent-ended-\(intent.id)"
                    )
                }
            }
        }
        .accessibilityIdentifier("weekly-intent-\(intent.id)")
    }

    private func courseTitle(_ course: NativeWeeklyIntentCourse) -> String {
        [course.code, course.name]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    private func windowSummary(_ window: NativeWeeklyIntentTimeWindow) -> String {
        let start = window.startAt.formatted(date: .abbreviated, time: .shortened)
        if Calendar.current.isDate(window.startAt, inSameDayAs: window.endAt) {
            return "\(start) – \(window.endAt.formatted(date: .omitted, time: .shortened))"
        }
        return "\(start) – \(window.endAt.formatted(date: .abbreviated, time: .shortened))"
    }
}

private struct WeeklyIntentWindowDraft: Identifiable {
    let id: UUID
    var startAt: Date
    var endAt: Date

    init(
        id: UUID = UUID(),
        startAt: Date,
        endAt: Date
    ) {
        self.id = id
        self.startAt = startAt
        self.endAt = endAt
    }

    var value: NativeWeeklyIntentTimeWindow {
        NativeWeeklyIntentTimeWindow(startAt: startAt, endAt: endAt)
    }
}

private struct WeeklyIntentDateTimePicker: UIViewRepresentable {
    @Binding var selection: Date
    let range: ClosedRange<Date>
    let accessibilityLabel: String

    func makeCoordinator() -> Coordinator {
        Coordinator(selection: $selection)
    }

    func makeUIView(context: Context) -> UIDatePicker {
        let picker = UIDatePicker()
        picker.datePickerMode = .dateAndTime
        picker.preferredDatePickerStyle = .compact
        picker.minuteInterval = NativeWeeklyIntentTimeRules.minuteInterval
        picker.roundsToMinuteInterval = true
        picker.timeZone = .current
        picker.calendar = .current
        picker.locale = AppLocalization.selectedLanguage.locale
        picker.addTarget(
            context.coordinator,
            action: #selector(Coordinator.selectionChanged(_:)),
            for: .valueChanged
        )
        return picker
    }

    func updateUIView(_ picker: UIDatePicker, context: Context) {
        context.coordinator.selection = $selection
        picker.minimumDate = range.lowerBound
        picker.maximumDate = range.upperBound
        picker.timeZone = .current
        picker.locale = AppLocalization.selectedLanguage.locale
        picker.accessibilityLabel = accessibilityLabel
        if abs(picker.date.timeIntervalSince(selection)) > 0.5 {
            picker.setDate(selection, animated: false)
        }
    }

    @MainActor
    final class Coordinator: NSObject {
        var selection: Binding<Date>

        init(selection: Binding<Date>) {
            self.selection = selection
        }

        @objc func selectionChanged(_ sender: UIDatePicker) {
            selection.wrappedValue = sender.date
        }
    }
}

private struct WeeklyIntentCourseOption: Identifiable, Hashable {
    let id: String
    let code: String?
    let name: String

    var title: String {
        [code, name]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }
}

private struct WeeklyIntentEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(SessionStore.self) private var session
    @State private var courseStore = CourseListStore()
    @State private var topic: NativeWeeklyIntentTopic
    @State private var activityText: String
    @State private var sportText: String
    @State private var togetherMode: NativeTogetherMode
    @State private var studyGoal: String
    @State private var selectedCourseID: String?
    @State private var timeWindows: [WeeklyIntentWindowDraft]
    @State private var note: String
    @State private var isSaving = false
    @FocusState private var isSportInputFocused: Bool

    let intent: NativeWeeklyIntent?
    let onSave: (
        NativeWeeklyIntentTopic,
        String,
        NativeSportTag?,
        String,
        NativeTogetherMode,
        String,
        String?,
        [NativeWeeklyIntentTimeWindow],
        String
    ) async -> Bool

    init(
        intent: NativeWeeklyIntent?,
        onSave: @escaping (
            NativeWeeklyIntentTopic,
            String,
            NativeSportTag?,
            String,
            NativeTogetherMode,
            String,
            String?,
            [NativeWeeklyIntentTimeWindow],
            String
        ) async -> Bool
    ) {
        self.intent = intent
        self.onSave = onSave
        let proposed = Self.defaultWindows(intent: intent)
        _topic = State(initialValue: intent?.topic ?? .coffee)
        _activityText = State(initialValue: intent?.activityText ?? "")
        _sportText = State(
            initialValue: NativeSportInput.displayText(
                tag: intent?.sportTag,
                otherNote: intent?.sportOtherNote
            )
        )
        _togetherMode = State(initialValue: intent?.effectiveTogetherMode ?? .sameActivity)
        _studyGoal = State(initialValue: intent?.studyGoal ?? "")
        _selectedCourseID = State(initialValue: intent?.courseId)
        _timeWindows = State(
            initialValue: proposed.map {
                WeeklyIntentWindowDraft(startAt: $0.startAt, endAt: $0.endAt)
            }
        )
        _note = State(initialValue: intent?.note ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("What") {
                    Picker("Activity", selection: $topic) {
                        ForEach(NativeWeeklyIntentTopic.allCases) { topic in
                            Label(topic.title, systemImage: topic.systemImage).tag(topic)
                        }
                    }
                }

                if topic == .sports {
                    Section("Sport") {
                        TextField("Which sport?", text: $sportText)
                            .textInputAutocapitalization(.words)
                            .submitLabel(.done)
                            .focused($isSportInputFocused)
                            .onSubmit { isSportInputFocused = false }

                        if !sportSuggestions.isEmpty {
                            ScrollView(.horizontal) {
                                HStack(spacing: SideSeatTheme.spaceSM) {
                                    ForEach(sportSuggestions) { sport in
                                        Button(sport.title) {
                                            sportText = sport.title
                                            isSportInputFocused = false
                                        }
                                        .buttonStyle(.bordered)
                                        .controlSize(.small)
                                    }
                                }
                            }
                            .scrollIndicators(.hidden)
                        }
                        if !hasValidSportSelection {
                            Text("Enter the sport you want to do.")
                                .font(.footnote)
                                .foregroundStyle(SideSeatTheme.danger)
                        }
                    }
                }

                if usesGeneralActivityText {
                    Section("What exactly?") {
                        TextField(
                            generalActivityPlaceholder,
                            text: $activityText,
                            axis: .vertical
                        )
                        .lineLimit(1...3)
                        .textInputAutocapitalization(.sentences)

                        if !hasValidActivityText {
                            Text("Describe the specific thing you want to do.")
                                .font(.footnote)
                                .foregroundStyle(SideSeatTheme.danger)
                        }
                    }
                }

                if topic == .study {
                    Section("What are you working on?") {
                        TextField(
                            "For example: write a thesis or review for an exam",
                            text: $studyGoal,
                            axis: .vertical
                        )
                        .lineLimit(1...3)
                        .textInputAutocapitalization(.sentences)

                        if !hasValidStudyGoal {
                            Text("Add a short study goal so SideSeat can find a useful match.")
                                .font(.footnote)
                                .foregroundStyle(SideSeatTheme.danger)
                        }
                    }

                    Section("How would you like to study?") {
                        ForEach(NativeTogetherMode.allCases) { mode in
                            Button {
                                togetherMode = mode
                            } label: {
                                HStack(alignment: .firstTextBaseline, spacing: SideSeatTheme.spaceSM) {
                                    Text(mode.studyTitle)
                                        .foregroundStyle(SideSeatTheme.textPrimary)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                    Image(
                                        systemName: togetherMode == mode
                                            ? "checkmark.circle.fill"
                                            : "circle"
                                    )
                                    .foregroundStyle(
                                        togetherMode == mode
                                            ? SideSeatTheme.accent
                                            : SideSeatTheme.textSecondary
                                    )
                                }
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(togetherMode == mode ? .isSelected : [])
                        }
                    }
                }

                if topic == .study {
                    Section("Course") {
                        if courseStore.isLoading, courseStore.payload == nil {
                            HStack(spacing: SideSeatTheme.spaceSM) {
                                ProgressView()
                                Text("Loading courses")
                                    .foregroundStyle(SideSeatTheme.textSecondary)
                            }
                        } else {
                            Picker("Course", selection: $selectedCourseID) {
                                Text("None").tag(String?.none)
                                ForEach(courseOptions) { course in
                                    Text(course.title).tag(Optional(course.id))
                                }
                            }
                            if courseOptions.isEmpty {
                                Text("No current courses")
                                    .font(.footnote)
                                    .foregroundStyle(SideSeatTheme.textSecondary)
                            }
                        }
                        if let issue = courseStore.issue, courseStore.payload == nil {
                            Text(issue)
                                .font(.footnote)
                                .foregroundStyle(SideSeatTheme.danger)
                        }
                    }
                }

                Section("When") {
                    ForEach($timeWindows) { $window in
                        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                            HStack {
                                Text("Start")
                                Spacer()
                                WeeklyIntentDateTimePicker(
                                    selection: Binding(
                                        get: { window.startAt },
                                        set: { newValue in
                                            let start = min(
                                                max(
                                                    NativeWeeklyIntentTimeRules
                                                        .roundedUpToQuarterHour(newValue),
                                                    pickerLowerBound
                                                ),
                                                pickerUpperBound
                                            )
                                            window.startAt = start
                                            window.endAt = NativeWeeklyIntentTimeRules
                                                .minimumEnd(after: start)
                                        }
                                    ),
                                    range: pickerLowerBound...pickerUpperBound,
                                    accessibilityLabel: AppLocalization.string("Start")
                                )
                                .fixedSize()
                            }
                            HStack {
                                Text("End")
                                Spacer()
                                WeeklyIntentDateTimePicker(
                                    selection: Binding(
                                        get: { window.endAt },
                                        set: { newValue in
                                            let minimumEnd = NativeWeeklyIntentTimeRules
                                                .minimumEnd(after: window.startAt)
                                            let end = NativeWeeklyIntentTimeRules
                                                .roundedUpToQuarterHour(newValue)
                                            window.endAt = min(max(end, minimumEnd), expiry)
                                        }
                                    ),
                                    range: NativeWeeklyIntentTimeRules
                                        .minimumEnd(after: window.startAt)...expiry,
                                    accessibilityLabel: AppLocalization.string("End")
                                )
                                .fixedSize()
                            }
                            if timeWindows.count > 1 {
                                Button("Remove time", systemImage: "minus.circle", role: .destructive) {
                                    timeWindows.removeAll { $0.id == window.id }
                                }
                            }
                        }
                    }
                    Button("Add another time", systemImage: "plus.circle") {
                        addTimeWindow()
                    }
                    .disabled(nextTimeWindow == nil || timeWindows.count >= 7)

                    if !hasValidTimeWindows {
                        Text("Choose future, non-overlapping times of 30 minutes to 12 hours within this week.")
                            .font(.footnote)
                            .foregroundStyle(SideSeatTheme.danger)
                    }
                }
                Section("Optional") {
                    TextField("A short clarification", text: $note, axis: .vertical)
                        .lineLimit(2...4)
                    Text("This is private and is not published as a post.")
                        .font(.footnote)
                        .foregroundStyle(SideSeatTheme.textSecondary)
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle(intent == nil ? "Set this week" : "Edit intention")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            isSaving = true
                            let sportSelection = NativeSportInput.normalized(sportText)
                            _ = await onSave(
                                topic,
                                activityText,
                                sportSelection.tag,
                                sportSelection.otherNote ?? "",
                                togetherMode,
                                studyGoal,
                                selectedCourseID,
                                normalizedTimeWindows,
                                note
                            )
                            isSaving = false
                        }
                    }
                    .disabled(
                        !hasValidTimeWindows ||
                            !hasValidActivityText ||
                            !hasValidSportSelection ||
                            !hasValidStudyGoal ||
                            note.count > 160 ||
                            activityText.count > 80 ||
                            sportText.count > 60 ||
                            isSaving
                    )
                }
            }
        }
        .task(id: topic) {
            guard topic == .study, courseStore.payload == nil else { return }
            await courseStore.load(
                using: session,
                scope: .enrolled,
                school: session.currentUser?.school,
                query: ""
            )
        }
    }

    private var expiry: Date {
        intent?.expiresAt ?? Self.currentWeekExpiry()
    }

    private var pickerUpperBound: Date {
        let latestStart = expiry.addingTimeInterval(-NativeWeeklyIntentTimeRules.minimumDuration)
        let rounded = NativeWeeklyIntentTimeRules.roundedUpToQuarterHour(latestStart)
        if rounded > latestStart {
            return rounded.addingTimeInterval(
                -TimeInterval(NativeWeeklyIntentTimeRules.minuteInterval * 60)
            )
        }
        return rounded
    }

    private var pickerLowerBound: Date {
        min(
            NativeWeeklyIntentTimeRules.roundedUpToQuarterHour(Date()),
            pickerUpperBound
        )
    }

    private var courseOptions: [WeeklyIntentCourseOption] {
        var options = courseStore.payload?.courses.map {
            WeeklyIntentCourseOption(id: $0.id, code: $0.code, name: $0.name)
        } ?? []
        if let course = intent?.course,
           !options.contains(where: { $0.id == course.id })
        {
            options.insert(
                WeeklyIntentCourseOption(
                    id: course.id,
                    code: course.code,
                    name: course.name
                ),
                at: 0
            )
        }
        return options
    }

    private var normalizedTimeWindows: [NativeWeeklyIntentTimeWindow] {
        timeWindows
            .map(\.value)
            .sorted {
                $0.startAt == $1.startAt
                    ? $0.endAt < $1.endAt
                    : $0.startAt < $1.startAt
            }
    }

    private var hasValidTimeWindows: Bool {
        let now = Date()
        let windows = normalizedTimeWindows
        guard !windows.isEmpty, windows.count <= 7 else { return false }
        for window in windows {
            let duration = window.endAt.timeIntervalSince(window.startAt)
            guard window.startAt > now,
                  duration >= NativeWeeklyIntentTimeRules.minimumDuration,
                  duration <= 12 * 60 * 60,
                  window.endAt <= expiry
            else {
                return false
            }
        }
        for index in windows.indices.dropFirst() {
            guard windows[index].startAt >= windows[index - 1].endAt else {
                return false
            }
        }
        return true
    }

    private var hasValidSportSelection: Bool {
        guard topic == .sports else { return true }
        let normalized = sportText.trimmingCharacters(in: .whitespacesAndNewlines)
        return !normalized.isEmpty && normalized.count <= 60
    }

    private var usesGeneralActivityText: Bool {
        topic != .study && topic != .sports
    }

    private var hasValidActivityText: Bool {
        guard usesGeneralActivityText else { return true }
        let normalized = activityText.trimmingCharacters(in: .whitespacesAndNewlines)
        return !normalized.isEmpty && normalized.count <= 80
    }

    private var generalActivityPlaceholder: LocalizedStringKey {
        switch topic {
        case .coffee: "For example: coffee and a short walk"
        case .explore: "For example: walk through the English Garden"
        case .food: "For example: eat hotpot"
        case .events: "For example: campus concert"
        case .study, .sports: "Describe the activity"
        }
    }

    private var sportSuggestions: [NativeSportTag] {
        guard isSportInputFocused else { return [] }
        let selection = NativeSportInput.normalized(sportText)
        guard selection.tag == .other else { return [] }
        return NativeSportInput.suggestions(matching: sportText)
    }

    private var hasValidStudyGoal: Bool {
        guard topic == .study else { return true }
        let normalized = studyGoal.trimmingCharacters(in: .whitespacesAndNewlines)
        return !normalized.isEmpty && normalized.count <= 80
    }

    private var nextTimeWindow: NativeWeeklyIntentTimeWindow? {
        guard timeWindows.count < 7 else { return nil }
        let latestEnd = timeWindows.map(\.endAt).max() ?? Date()
        let window = NativeWeeklyIntentTimeRules.defaultWindow(
            startingAt: max(Date(), latestEnd)
        )
        guard window.endAt <= expiry else { return nil }
        return window
    }

    private func addTimeWindow() {
        guard let nextTimeWindow else { return }
        timeWindows.append(
            WeeklyIntentWindowDraft(
                startAt: nextTimeWindow.startAt,
                endAt: nextTimeWindow.endAt
            )
        )
    }

    private static func defaultWindows(intent: NativeWeeklyIntent?) -> [NativeWeeklyIntentTimeWindow] {
        if let intent {
            let future = intent.timeWindows
                .filter { $0.startAt > Date() }
                .sorted { $0.startAt < $1.startAt }
            if !future.isEmpty {
                return future
            }
        }
        let now = Date()
        let expiry = currentWeekExpiry()
        let proposed = NativeWeeklyIntentTimeRules.defaultWindow(startingAt: now)
        guard proposed.endAt > expiry else { return [proposed] }
        let latestStart = expiry.addingTimeInterval(-NativeWeeklyIntentTimeRules.minimumDuration)
        let rounded = NativeWeeklyIntentTimeRules.roundedUpToQuarterHour(latestStart)
        let start = rounded > latestStart
            ? rounded.addingTimeInterval(
                -TimeInterval(NativeWeeklyIntentTimeRules.minuteInterval * 60)
            )
            : rounded
        return [
            NativeWeeklyIntentTimeWindow(
                startAt: start,
                endAt: NativeWeeklyIntentTimeRules.minimumEnd(after: start)
            ),
        ]
    }

    private static func currentWeekExpiry(now: Date = Date()) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        let weekday = calendar.component(.weekday, from: now)
        let daysUntilSunday = (1 - weekday + 7) % 7
        let sunday = calendar.date(byAdding: .day, value: daysUntilSunday, to: now) ?? now
        let nextDay = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: sunday)) ?? sunday
        return nextDay.addingTimeInterval(-0.001)
    }
}
