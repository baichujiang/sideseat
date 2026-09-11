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
    let inspiration: NativeExploreIntent?

    static func create(from inspiration: NativeExploreIntent? = nil) -> Self {
        Self(id: "create", intent: nil, inspiration: inspiration)
    }

    static func edit(_ intent: NativeWeeklyIntent) -> Self {
        Self(id: intent.id, intent: intent, inspiration: nil)
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
                TogetherHomeView().id(session.currentUser?.id)
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

enum TogetherSection: String, CaseIterable, Identifiable, Sendable {
    case recommendations, intentions, explore
    var id: Self { self }

    var title: String {
        switch self {
        case .recommendations: AppLocalization.string("Together recommendations")
        case .intentions: AppLocalization.string("My intentions")
        case .explore: AppLocalization.string("Together explore")
        }
    }

    static func initial(hasIntentions: Bool, hasOpportunities: Bool, hasLegacySession: Bool) -> Self {
        hasIntentions || hasOpportunities || hasLegacySession ? .recommendations : .intentions
    }
}

private struct TogetherHomeView: View {
    @Environment(ClientConfigurationStore.self) private var clientConfiguration
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var store = WeeklyIntentStore()
    @State private var matchingSessionStore = TogetherMatchingSessionStore()
    @State private var opportunityStore = MutualOpportunityStore()
    @State private var v2Store = ActionToPlanV2Store.shared
    @State private var presentedEditor: WeeklyIntentEditorPresentation?
    @State private var selectedSection: TogetherSection = .recommendations
    @State private var resolvedInitialSection = false

    private var automaticMatchingEnabled: Bool {
        v2Store.isMutualOpportunityEnabled && clientConfiguration.configuration?.isFeatureEnabled("v2AutomaticMatching") == true
    }
    private var exploreEnabled: Bool {
        clientConfiguration.configuration?.isFeatureEnabled("v2ExploreIntents") == true
    }
    private var sectionSelection: Binding<TogetherSection> {
        Binding(get: { selectedSection }, set: {
            selectedSection = $0
            resolvedInitialSection = true
        })
    }

    var body: some View {
        TimelineView(.periodic(from: .now, by: 60)) { context in
            VStack(spacing: 0) {
                sectionPicker(at: context.date)
                    .padding(.horizontal, SideSeatTheme.screenHorizontal)
                    .padding(.vertical, SideSeatTheme.spaceMD)
                    .background(SideSeatTheme.bgGrouped)

                if selectedSection == .explore {
                    ExploreIntentListView(embeddedInTogether: true) { inspiration in
                        presentedEditor = .create(from: inspiration)
                    }
                } else {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: SideSeatTheme.spaceLG) {
                            if selectedSection == .intentions {
                                intentSection(at: context.date)
                            } else {
                                recommendationsSection(at: context.date)
                            }
                        }
                        .padding(.horizontal, SideSeatTheme.screenHorizontal)
                        .padding(.top, SideSeatTheme.spaceXS)
                        .padding(.bottom, SideSeatTheme.spaceXL)
                    }
                    .id(selectedSection)
                    .accessibilityIdentifier("together-section-\(selectedSection.rawValue)")
                    .refreshable { await loadContent() }
                }
            }
        }
        .background(SideSeatTheme.bgGrouped)
        .ssRootNavigationTitle("Together")
        .task { await loadContent() }
        .onReceive(NotificationCenter.default.publisher(for: .sideSeatTogetherNeedsRefresh)) { _ in
            Task { await loadContent() }
        }
        .sheet(item: $presentedEditor) { presentation in
            WeeklyIntentEditorView(intent: presentation.intent, inspiration: presentation.inspiration, saveIssue: store.issue) {
                topic, activityText, sportTag, sportOtherNote, togetherMode, studyGoal,
                courseId, timeWindows, timePreference, exploreVisible, note in
                let saved = await store.save(
                    intent: presentation.intent, topic: topic, activityText: activityText,
                    sportTag: sportTag, sportOtherNote: sportOtherNote, togetherMode: togetherMode,
                    studyGoal: studyGoal, courseId: courseId, timeWindows: timeWindows,
                    timePreference: timePreference, automaticMatching: automaticMatchingEnabled,
                    exploreVisible: exploreEnabled ? exploreVisible : nil, note: note, using: session
                )
                if saved {
                    sectionSelection.wrappedValue = .intentions
                    presentedEditor = nil
                    await refreshOpportunitiesAfterIntentChange()
                }
                return saved
            }
            .dynamicTypeSize(dynamicTypeSize)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("together-home")
    }

    @ViewBuilder
    private func sectionPicker(at now: Date) -> some View {
        // Native segmented control normally; full-size labeled alternatives for accessibility text.
        if dynamicTypeSize.isAccessibilitySize {
            VStack(spacing: SideSeatTheme.spaceXS) {
                ForEach(TogetherSection.allCases) { section in
                    Button {
                        sectionSelection.wrappedValue = section
                    } label: {
                        HStack {
                            Text(sectionTitle(section, at: now))
                                .font(.body.weight(.semibold))
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: SideSeatTheme.spaceSM)
                            if selectedSection == section {
                                Image(systemName: "checkmark").accessibilityHidden(true)
                            }
                        }
                        .padding(.horizontal, SideSeatTheme.spaceMD)
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .background(selectedSection == section ? SideSeatTheme.surface : Color.clear,
                                    in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(selectedSection == section ? .isSelected : [])
                    .accessibilityIdentifier("together-tab-\(section.rawValue)")
                }
            }
            .accessibilityElement(children: .contain)
        } else {
            Picker(AppLocalization.string("Together"), selection: sectionSelection) {
                ForEach(TogetherSection.allCases) { section in
                    Text(sectionTitle(section, at: now)).tag(section)
                        .accessibilityIdentifier("together-tab-\(section.rawValue)")
                }
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("together-segmented-control")
        }
    }

    private func sectionTitle(_ section: TogetherSection, at now: Date) -> String {
        let count = findingCount(at: now)
        return section == .intentions && count > 0 ? "\(section.title) \(count)" : section.title
    }

    private func status(for intent: NativeWeeklyIntent, at now: Date) -> TogetherIntentStatus {
        TogetherIntentStatus(intent: intent, matchingEnabled: v2Store.isWeeklyIntentEnabled && v2Store.isMutualOpportunityEnabled,
            automaticMatchingEnabled: automaticMatchingEnabled,
            legacySessionActive: matchingSessionStore.session.isMatching(at: now), now: now)
    }

    private func findingCount(at now: Date) -> Int {
        store.intents.filter { status(for: $0, at: now) == .finding }.count
    }

    @ViewBuilder
    private func intentSection(at now: Date) -> some View {
        if !v2Store.isWeeklyIntentEnabled {
            unavailableSection
        } else {
            HStack(alignment: .firstTextBaseline) {
                Text(AppLocalization.string("What I want to do"))
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: SideSeatTheme.spaceSM)
                Button { presentedEditor = .create() } label: {
                    Label(AppLocalization.string("Add an intention"), systemImage: "plus")
                        .labelStyle(.iconOnly)
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.bordered)
                .disabled(store.isCreating)
                .accessibilityIdentifier("together-add-intent")
            }
            Text(AppLocalization.string("Your activities, timing and finding status, all in one place."))
                .font(.subheadline)
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .fixedSize(horizontal: false, vertical: true)

            if !store.hasLoaded && store.issue == nil && store.intents.isEmpty {
                ProgressView().frame(maxWidth: .infinity, minHeight: 120)
            } else if let issue = store.issue, store.intents.isEmpty {
                loadFailure(issue: issue)
            } else if store.intents.isEmpty {
                SSEmptyState(
                    title: "What would you like to do?", systemImage: "sparkles",
                    description: "Add an activity and choose when. You stay in control of finding company and Explore visibility.",
                    actionTitle: AppLocalization.string("Add an intention"),
                    action: { presentedEditor = .create() }
                )
                .accessibilityIdentifier("together-set-intent")
            } else {
                ForEach(store.intents) { intent in
                    WeeklyIntentCard(
                        intent: intent, status: status(for: intent, at: now),
                        exploreEnabled: exploreEnabled, isWorking: store.mutatingIDs.contains(intent.id),
                        onEdit: { presentedEditor = .edit(intent) },
                        onPause: {
                            Task {
                                let changed = await store.setPaused(!intent.isPaused, intent: intent,
                                    automaticMatching: automaticMatchingEnabled, using: session)
                                if changed { await refreshOpportunitiesAfterIntentChange() }
                            }
                        },
                        onExtend: {
                            Task {
                                let changed = await store.setPaused(false, intent: intent, extend: true, using: session)
                                if changed { await refreshOpportunitiesAfterIntentChange() }
                            }
                        },
                        onEnd: {
                            Task {
                                let changed = await store.end(intent, using: session)
                                if changed { await refreshOpportunitiesAfterIntentChange() }
                            }
                        }
                    )
                }
                if let issue = store.issue { loadFailure(issue: issue) }
            }
        }
    }

    @ViewBuilder
    private func recommendationsSection(at now: Date) -> some View {
        if v2Store.isMutualOpportunityEnabled {
            let count = findingCount(at: now)
            if count > 0 {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                    Label(AppLocalization.string("Finding company for you"), systemImage: "sparkle.magnifyingglass")
                        .font(.subheadline.weight(.semibold))
                    Text(String(format: AppLocalization.string("Based on %lld intentions finding company"), Int64(count)))
                        .font(.footnote)
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("together-finding-summary")
            }
            if !automaticMatchingEnabled,
               !store.intents.isEmpty || matchingSessionStore.session.state != .idle {
                matchingSessionSection
            }
            opportunitySection
        } else {
            unavailableSection
        }
    }

    private func loadFailure(issue: String) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            Label(issue, systemImage: "wifi.exclamationmark")
                .font(.footnote).foregroundStyle(SideSeatTheme.danger)
                .fixedSize(horizontal: false, vertical: true)
            Button(AppLocalization.string("Try again")) { Task { await loadContent() } }
                .buttonStyle(.bordered).frame(minHeight: 44)
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
                SSFlowCard {
                    TimelineView(.periodic(from: .now, by: 60)) { context in
                        matchingSessionContent(at: context.date)
                    }
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

                Text("When SideSeat finds someone compatible, they will appear here.")
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)

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
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)

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
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
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
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)

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
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .accessibilityIdentifier("together-start-matching-disabled-reason")
                }
            }
        }
    }

    private var unavailableSection: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            SSProductSectionHeader(title: AppLocalization.string("Recent intentions"))
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
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            if (opportunityStore.isLoading || (!store.hasLoaded && store.issue == nil)), opportunityStore.opportunities.isEmpty {
                ProgressView().frame(maxWidth: .infinity, minHeight: 120)
            } else if let issue = opportunityStore.issue, opportunityStore.opportunities.isEmpty {
                loadFailure(issue: issue)
            } else if opportunityStore.opportunities.isEmpty {
                emptyOpportunityState
            } else {
                ForEach(opportunityStore.opportunities) { opportunity in
                    opportunityCard(opportunity)
                }
                if let issue = opportunityStore.issue { loadFailure(issue: issue) }
            }
        }
        .accessibilityElement(children: .contain)

    }

    private var emptyOpportunityState: some View {
        let count = findingCount(at: Date())
        return VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            Label(AppLocalization.string("No new company right now"), systemImage: "person.2")
                .font(.headline)
            Text(count > 0
                ? String(format: AppLocalization.string("%lld intentions are still finding company. New suggestions will appear here."), Int64(count))
                : AppLocalization.string("Review your intentions to start or resume finding company."))
                .font(.subheadline)
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .fixedSize(horizontal: false, vertical: true)
            Button(AppLocalization.string("View my intentions")) {
                sectionSelection.wrappedValue = .intentions
            }
            .buttonStyle(.bordered).frame(minHeight: 44)
            .accessibilityIdentifier("together-discovery-empty-action")
        }
        .padding(.vertical, SideSeatTheme.spaceXL)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("together-opportunities-empty")
    }

    private func opportunityCard(_ opportunity: NativeMutualOpportunity) -> some View {
        MutualOpportunityCard(
            opportunity: opportunity,
            isWorking: opportunityStore.mutatingIDs.contains(opportunity.id),
            onYes: {
                await opportunityStore.decide(
                    "YES",
                    opportunity: opportunity,
                    using: session
                )
                await store.load(using: session)
            },
            onNo: {
                await opportunityStore.decide(
                    "NO",
                    opportunity: opportunity,
                    using: session
                )
                await store.load(using: session)
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
            async let intents: Void = store.load(using: session)
            async let matching: Void = loadLegacyMatchingSession()
            async let opportunities: Void = refreshOpportunitiesAfterIntentChange()
            _ = await (intents, matching, opportunities)
        } else {
            await refreshOpportunitiesAfterIntentChange()
        }
        if !resolvedInitialSection, store.hasLoaded, store.issue == nil, opportunityStore.issue == nil {
            selectedSection = TogetherSection.initial(hasIntentions: !store.intents.isEmpty,
                hasOpportunities: !opportunityStore.opportunities.isEmpty,
                hasLegacySession: matchingSessionStore.session.isMatching(at: Date()))
            resolvedInitialSection = true
        }
    }

    private func refreshOpportunitiesAfterIntentChange() async {
        guard v2Store.isMutualOpportunityEnabled else { return }
        await opportunityStore.load(using: session)
    }

    private func loadLegacyMatchingSession() async {
        // Legacy intentions still participate through explicit sessions even after automatic matching ships.
        if v2Store.isMutualOpportunityEnabled { await matchingSessionStore.load(using: session) }
    }

    private var activeIntents: [NativeWeeklyIntent] {
        store.intents.filter { $0.status == "ACTIVE" && $0.expiresAt > Date() }
    }
}

private struct MutualOpportunityCard: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var isShowingFitDetails = false

    let opportunity: NativeMutualOpportunity
    let isWorking: Bool
    let onYes: () async -> Void
    let onNo: () async -> Void
    let onWithdraw: () -> Void
    let onOpenConversation: () -> Void

    private var presentationState: TogetherOpportunityPresentationState {
        TogetherOpportunityPresentationState(opportunity)
    }

    var body: some View {
        SSFlowCard(contentPadding: SideSeatTheme.spaceMD) {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                peerRow
                activityHeader
                availabilityRow
                activityContext
                fitDisclosure
                decisionArea
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("mutual-opportunity-\(opportunity.id)")
    }

    private var activityTitle: String {
        if opportunity.matchFit?.isDifferentActivity == true { return AppLocalization.string("Do something together") }
        if let activity = opportunity.matchFit?.viewerActivity { return activity.title }
        // Related activities are a suggestion to agree on something, not an agreed plan.
        if opportunity.matchFit?.isRelatedActivity == true { return opportunity.topic.title }
        if opportunity.topic == .study {
            return opportunity.effectiveMatchKind == .sharedContext
                ? opportunity.matchContextTitle : opportunity.viewerStudyGoalTitle
        }
        return opportunity.activityTitle
    }

    private var activityHeader: some View {
        HStack(alignment: .center, spacing: SideSeatTheme.spaceSM) {
            SSActivityArtwork(
                topic: opportunity.matchFit?.viewerActivity?.topic ?? opportunity.topic,
                size: 40
            )
            VStack(alignment: .leading, spacing: 2) {
                if activityTitle != opportunity.topic.title {
                    Text(opportunity.topic.title)
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                }
                Text(activityTitle)
                    .font(.headline.weight(.bold))
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("mutual-opportunity-activity-\(opportunity.id)")
    }

    private var peerRow: some View {
        HStack(alignment: .center, spacing: SideSeatTheme.spaceSM) {
            InitialAvatar(name: opportunity.peer.displayName, url: opportunity.peer.avatarUrl, size: 36)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                HStack(alignment: .firstTextBaseline, spacing: SideSeatTheme.spaceXS) {
                    Text(opportunity.peer.displayName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .lineLimit(1)
                    if opportunity.peer.verifiedStudent {
                        Image(systemName: "checkmark.seal.fill")
                            .font(.caption)
                            .foregroundStyle(SideSeatTheme.verifiedSeal)
                            .accessibilityLabel(AppLocalization.string("Verified student"))
                            .accessibilityIdentifier("mutual-opportunity-verified-\(opportunity.id)")
                    }
                }
                if !peerContext.isEmpty {
                    Text(peerContext)
                        .font(.caption2)
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("mutual-opportunity-peer-\(opportunity.id)")
    }

    private var availabilityRow: some View {
        HStack(alignment: .firstTextBaseline, spacing: SideSeatTheme.spaceSM) {
            Image(systemName: "clock")
                .font(.caption.weight(.semibold))
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .frame(width: 20)
                .accessibilityHidden(true)
            Text(opportunity.matchFit?.differences?.contains("TIME") == true
                 ? AppLocalization.string("Time needs a new agreement") : opportunityWindow)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(SideSeatTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityLabel(AppLocalization.string(opportunity.startDate == nil ? "Timing preference" : "Available together"))
        .accessibilityValue(opportunity.matchFit?.differences?.contains("TIME") == true
                             ? AppLocalization.string("Time needs a new agreement") : opportunityWindow)
        .accessibilityElement(children: .ignore)
        .accessibilityRespondsToUserInteraction(false)
        .accessibilityIdentifier("mutual-opportunity-time-\(opportunity.id)")
    }

    private var activityContext: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
            opportunityFitRow(
                title: AppLocalization.string("Activity"),
                value: activityFitSummary,
                systemImage: "figure.walk"
            )
            opportunityFitRow(
                title: AppLocalization.string("Time"),
                value: timeFitSummary,
                systemImage: "clock"
            )
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("mutual-opportunity-differences-\(opportunity.id)")
    }

    private var activityFitSummary: String {
        if let fit = opportunity.matchFit, fit.isDiscovery, let first = fit.differenceHints.first {
            return first
        }
        return opportunity.matchTitle
    }

    private var timeFitSummary: String {
        if let fit = opportunity.matchFit, fit.isDiscovery, fit.differenceHints.count > 1 {
            return fit.differenceHints[1]
        }
        if opportunity.matchFit?.differences?.contains("TIME") == true {
            return AppLocalization.string("Time needs a new agreement")
        }
        return opportunity.startDate == nil
            ? AppLocalization.string("Time to discuss")
            : AppLocalization.string("Available together")
    }

    private func opportunityFitRow(title: String, value: String, systemImage: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: SideSeatTheme.spaceSM) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .frame(width: 54, alignment: .leading)
            Text(value)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(SideSeatTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
    }

    private var fitDisclosure: some View {
        VStack(alignment: .leading, spacing: 0) {
            Divider()
            Button {
                withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) {
                    isShowingFitDetails.toggle()
                }
            } label: {
                HStack(spacing: SideSeatTheme.spaceSM) {
                    let layout = dynamicTypeSize.isAccessibilitySize
                        ? AnyLayout(VStackLayout(alignment: .leading, spacing: SideSeatTheme.spaceXS))
                        : AnyLayout(HStackLayout(spacing: SideSeatTheme.spaceSM))
                    layout {
                        Text(AppLocalization.string("Why this opportunity"))
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(SideSeatTheme.textPrimary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        if let fit = opportunity.matchFit {
                            Text("\(fit.score)/100")
                                .font(.caption.weight(.semibold))
                                .monospacedDigit()
                                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        }
                    }
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("mutual-opportunity-fit-\(opportunity.id)")
                    Image(systemName: "chevron.down")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .rotationEffect(.degrees(isShowingFitDetails ? 180 : 0))
                        .accessibilityHidden(true)
                }
                .padding(.vertical, SideSeatTheme.spaceXS)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint(AppLocalization.string(opportunity.matchFit == nil
                ? "Why this opportunity" : "How this is calculated"))
            .accessibilityValue(AppLocalization.string(isShowingFitDetails ? "Expanded" : "Collapsed"))
            .accessibilityIdentifier("mutual-opportunity-fit-details-\(opportunity.id)")

            // Use intrinsic text height so expanded explanations remain scrollable at large sizes.
            if isShowingFitDetails {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                    Text(opportunity.matchExplanation)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("mutual-opportunity-match-explanation-\(opportunity.id)")
                    if let fit = opportunity.matchFit, fit.isDiscovery {
                        let layout = dynamicTypeSize.isAccessibilitySize
                            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SideSeatTheme.spaceMD))
                            : AnyLayout(HStackLayout(alignment: .top, spacing: SideSeatTheme.spaceLG))
                        layout {
                            if let activity = fit.viewerActivity {
                                explanationRow(title: AppLocalization.string("You"), value: activity.title)
                            }
                            if let activity = fit.peerActivity {
                                explanationRow(title: opportunity.peer.displayName, value: activity.title)
                            }
                        }
                    }
                    else if opportunity.topic == .study || opportunity.matchFit?.isRelatedActivity == true {
                        let layout = dynamicTypeSize.isAccessibilitySize
                            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SideSeatTheme.spaceMD))
                            : AnyLayout(HStackLayout(alignment: .top, spacing: SideSeatTheme.spaceLG))
                        layout {
                            if let activity = opportunity.topic == .study
                                ? opportunity.viewerStudyGoalTitle : opportunity.matchFit?.viewerActivityText {
                                explanationRow(title: AppLocalization.string("You"), value: activity)
                            }
                            if let activity = opportunity.topic == .study
                                ? opportunity.peerStudyGoalTitle : opportunity.matchFit?.peerActivityText {
                                explanationRow(title: opportunity.peer.displayName, value: activity)
                            }
                        }
                    }
                    if let course = opportunity.course {
                        Label([course.code, course.name].compactMap { $0 }.joined(separator: " "),
                              systemImage: "book.closed")
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    if let fit = opportunity.matchFit {
                        Text(fit.breakdown)
                            .fixedSize(horizontal: false, vertical: true)
                        if let minutes = fit.overlapMinutes {
                            Text(String(format: AppLocalization.string("%d minutes of shared availability"), minutes))
                                .fixedSize(horizontal: false, vertical: true)
                        } else {
                            Text("Time is not agreed yet. Start a conversation to work it out.")
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Text(AppLocalization.string("This describes the activity, not the person or the chance of success. A lower score can still be worth trying."))
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("mutual-opportunity-fit-disclaimer-\(opportunity.id)")
                    }
                }
                .font(.footnote)
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .padding(.top, SideSeatTheme.spaceSM)
                .padding(.bottom, SideSeatTheme.spaceMD)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
                .transition(.opacity)
            }
            Divider()
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("mutual-opportunity-trust-\(opportunity.id)")
    }

    @ViewBuilder
    private var decisionArea: some View {
        switch presentationState {
        case .mutual:
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                SSInlineStatus(
                    text: AppLocalization.string("You both showed interest"),
                    systemImage: "checkmark.circle.fill",
                    tone: .success,
                    accessibilityID: "mutual-opportunity-mutual-\(opportunity.id)"
                )
                SSPrimaryButton(
                    title: AppLocalization.string("Chat about the details"),
                    fill: .product,
                    height: 48,
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
                Button(action: onWithdraw) {
                    Text("Withdraw")
                        .frame(minHeight: 44)
                }
                .buttonStyle(.bordered)
                .disabled(isWorking)
            }
            .accessibilityIdentifier("mutual-opportunity-saved-\(opportunity.id)")

        case .undecided:
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                Label(AppLocalization.string("If you both show interest, chat first and confirm a plan later."), systemImage: "lock")
                    .font(.caption)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("mutual-opportunity-privacy-\(opportunity.id)")
                SSOpportunityDecisionBar(
                    opportunityID: opportunity.id,
                    isWorking: isWorking,
                    onInterested: onYes,
                    onSkip: onNo
                )
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
                .font(.subheadline.weight(.medium))
                .foregroundStyle(SideSeatTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var opportunityWindow: String {
        guard let start = opportunity.startDate,
              let end = opportunity.endDate
        else {
            return opportunity.timeContext?.summary ?? AppLocalization.string("Time to discuss")
        }
        let startText = start.formatted(.dateTime.month(.abbreviated).day().hour().minute().locale(AppLocalization.selectedLanguage.locale))
        let format: Date.FormatStyle = Calendar.current.isDate(start, inSameDayAs: end)
            ? .dateTime.hour().minute() : .dateTime.month(.abbreviated).day().hour().minute()
        let endText = end.formatted(format.locale(AppLocalization.selectedLanguage.locale))
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
    @Environment(ClientConfigurationStore.self) private var clientConfiguration
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var confirmsEnd = false
    let intent: NativeWeeklyIntent
    let status: TogetherIntentStatus
    let exploreEnabled: Bool
    let isWorking: Bool
    let onEdit: () -> Void
    let onPause: () -> Void
    let onExtend: () -> Void
    let onEnd: () -> Void

    private var isTerminal: Bool { status == .ended || status == .expired }
    private var visibleInExplore: Bool {
        exploreEnabled && intent.exploreVisible == true && !intent.isPaused && !isTerminal
    }

    var body: some View {
        SSFlowCard {
            HStack(alignment: .top, spacing: SideSeatTheme.spaceSM) {
                SSFlowCardHeader(
                    title: intent.activityTitle,
                    subtitle: intent.topic == .study ? intent.effectiveTogetherMode.studyTitle : intent.topic.title,
                    systemImage: intent.topic.systemImage,
                    activityTopic: intent.topic
                )
                if !isTerminal {
                    Menu {
                        if clientConfiguration.configuration?.isFeatureEnabled("v2FlexibleTiming") == true {
                            Button("Keep for 14 more days", systemImage: "arrow.clockwise", action: onExtend)
                        }
                        Button("End", systemImage: "stop.circle", role: .destructive) { confirmsEnd = true }
                    } label: {
                        Image(systemName: "ellipsis")
                            .font(.subheadline.weight(.semibold))
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(AppLocalization.string("More"))
                    .accessibilityIdentifier("weekly-intent-more-\(intent.id)")
                }
            }

            Label(status.title, systemImage: status.symbol)
                .font(.caption.weight(.semibold))
                .foregroundStyle(status == .finding ? SideSeatTheme.statusSuccessText : SideSeatTheme.textSecondaryStrong)
                .padding(.horizontal, SideSeatTheme.spaceSM)
                .padding(.vertical, SideSeatTheme.spaceXS)
                .background(status == .finding ? SideSeatTheme.statusSuccessText.opacity(0.08) : SideSeatTheme.fillTertiary,
                            in: Capsule())
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("weekly-intent-status-\(intent.id)")

            VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                if let timing = intent.timePreference, timing.kind != "EXACT" {
                    timeLabel(timing.summary)
                } else {
                    let windows = intent.relevantTimeWindows()
                    if windows.isEmpty { timeLabel(AppLocalization.string("Time to discuss")) }
                    ForEach(Array(windows.prefix(2).enumerated()), id: \.offset) { _, window in
                        timeLabel(windowSummary(window))
                    }
                    if windows.count > 2 {
                        Text(String(format: AppLocalization.string("%lld more times"), Int64(windows.count - 2)))
                            .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    }
                }
                // Only show a real course context, never invent a meeting location from the user's school.
                if let course = intent.course {
                    Label([course.code, course.name].compactMap { $0 }.joined(separator: " "), systemImage: "book.closed")
                        .font(.footnote)
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .accessibilityIdentifier("weekly-intent-timing-\(intent.id)")

            if let note = intent.note, !note.isEmpty {
                Text(note).font(.subheadline)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Text(status.detail)
                .font(.footnote)
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .fixedSize(horizontal: false, vertical: true)
            if !isTerminal {
                Label(AppLocalization.string(visibleInExplore ? "Also visible in Explore" : "Not visible in Explore"),
                      systemImage: visibleInExplore ? "sparkle.magnifyingglass" : "lock")
                    .font(.caption)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("weekly-intent-visibility-\(intent.id)")
                Text(String(format: AppLocalization.string("Active until %@"),
                    intent.expiresAt.formatted(.dateTime.month(.abbreviated).day().locale(AppLocalization.selectedLanguage.locale))))
                    .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
            }

            if !isTerminal {
                Divider()
                let layout = dynamicTypeSize.isAccessibilitySize
                    ? AnyLayout(VStackLayout(alignment: .leading, spacing: SideSeatTheme.spaceSM))
                    : AnyLayout(HStackLayout(spacing: SideSeatTheme.spaceSM))
                layout {
                    if status == .finding || status == .paused {
                        Button(action: onPause) {
                            Label(AppLocalization.string(intent.isPaused
                                ? (clientConfiguration.configuration?.isFeatureEnabled("v2AutomaticMatching") == true ? "Resume finding company" : "Resume")
                                : "Pause finding company"), systemImage: intent.isPaused ? "play.fill" : "pause")
                                .font(.subheadline.weight(.medium))
                                .fixedSize(horizontal: false, vertical: true)
                                .frame(minHeight: 44)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.bordered)
                        .accessibilityIdentifier("weekly-intent-pause-\(intent.id)")
                    } else if status == .unpublished {
                        Button(AppLocalization.string("Review and start"), action: onEdit)
                            .font(.subheadline.weight(.medium))
                            .buttonStyle(.bordered)
                            .frame(minHeight: 44)
                            .accessibilityIdentifier("weekly-intent-publish-\(intent.id)")
                    }
                    if !dynamicTypeSize.isAccessibilitySize { Spacer(minLength: 0) }
                    Button(action: onEdit) {
                        Label(AppLocalization.string("Edit"), systemImage: "pencil")
                            .font(.subheadline.weight(.medium))
                            .frame(minWidth: 68, minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("weekly-intent-edit-\(intent.id)")
                }
            }
        }
        .disabled(isWorking)
        .confirmationDialog(AppLocalization.string("End this intention?"), isPresented: $confirmsEnd, titleVisibility: .visible) {
            Button(AppLocalization.string("End"), role: .destructive, action: onEnd)
            Button(AppLocalization.string("Cancel"), role: .cancel) {}
        } message: {
            Text(AppLocalization.string("This intention will stop finding company. Existing conversations and confirmed plans stay unchanged."))
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("weekly-intent-\(intent.id)")
    }

    private func timeLabel(_ text: String) -> some View {
        Label(text, systemImage: "clock")
            .font(.subheadline.weight(.medium))
            .foregroundStyle(SideSeatTheme.textPrimary)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func windowSummary(_ window: NativeWeeklyIntentTimeWindow) -> String {
        let locale = AppLocalization.selectedLanguage.locale
        let day: String
        if Calendar.current.isDateInToday(window.startAt) { day = AppLocalization.string("Today") }
        else if Calendar.current.isDateInTomorrow(window.startAt) { day = AppLocalization.string("Tomorrow") }
        else { day = window.startAt.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day().locale(locale)) }
        let time = window.startAt.formatted(.dateTime.hour().minute().locale(locale))
        let end = Calendar.current.isDate(window.startAt, inSameDayAs: window.endAt)
            ? window.endAt.formatted(.dateTime.hour().minute().locale(locale))
            : window.endAt.formatted(.dateTime.month(.abbreviated).day().hour().minute().locale(locale))
        return "\(day) · \(time)–\(end)"
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
        picker.setContentCompressionResistancePriority(.required, for: .horizontal)
        picker.addTarget(
            context.coordinator,
            action: #selector(Coordinator.selectionChanged(_:)),
            for: .valueChanged
        )
        return picker
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UIDatePicker, context: Context) -> CGSize? {
        uiView.sizeThatFits(CGSize(
            width: proposal.width ?? UIView.layoutFittingExpandedSize.width,
            height: 44
        ))
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
    @Environment(ClientConfigurationStore.self) private var clientConfiguration
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
    @State private var timingKind: String
    @State private var flexibleStart: Date
    @State private var flexibleEnd: Date
    @State private var period: String
    @State private var exploreVisible: Bool
    @State private var note: String
    @State private var isSaving = false
    @State private var editorStep = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @FocusState private var isSportInputFocused: Bool

    let intent: NativeWeeklyIntent?
    let saveIssue: String?
    let onSave:
        (
            NativeWeeklyIntentTopic,
            String,
            NativeSportTag?,
            String,
            NativeTogetherMode,
            String,
            String?,
            [NativeWeeklyIntentTimeWindow],
            NativeIntentTimePreference?,
            Bool,
            String
        ) async -> Bool

    init(
        intent: NativeWeeklyIntent?,
        inspiration: NativeExploreIntent? = nil,
        saveIssue: String?,
        onSave:
            @escaping (
                NativeWeeklyIntentTopic,
                String,
                NativeSportTag?,
                String,
                NativeTogetherMode,
                String,
                String?,
                [NativeWeeklyIntentTimeWindow],
                NativeIntentTimePreference?,
                Bool,
                String
            ) async -> Bool
    ) {
        self.intent = intent
        self.saveIssue = saveIssue
        self.onSave = onSave
        let proposed = Self.defaultWindows(intent: intent)
        _topic = State(initialValue: intent?.topic ?? inspiration?.topic ?? .coffee)
        _activityText = State(initialValue: intent?.activityText ?? inspiration?.activityText ?? "")
        _sportText = State(
            initialValue: NativeSportInput.displayText(
                tag: intent?.sportTag ?? inspiration?.sportTag,
                otherNote: intent?.sportOtherNote ?? inspiration?.sportOtherNote
            )
        )
        _togetherMode = State(initialValue: intent?.effectiveTogetherMode ?? inspiration?.togetherMode ?? .sameActivity)
        _studyGoal = State(initialValue: intent?.studyGoal ?? inspiration?.studyGoal ?? "")
        _selectedCourseID = State(initialValue: intent?.courseId)
        _timeWindows = State(
            initialValue: proposed.map {
                WeeklyIntentWindowDraft(startAt: $0.startAt, endAt: $0.endAt)
            }
        )
        _exploreVisible = State(initialValue: intent?.exploreVisible ?? false)
        _note = State(initialValue: intent?.note ?? "")
        _timingKind = State(initialValue: intent?.timePreference?.kind ?? (intent == nil ? "UNDECIDED" : "EXACT"))
        let tomorrow = Calendar.current.date(byAdding: .day, value: 1, to: Date())!
        _flexibleStart = State(initialValue: NativeIntentTimePreference.date(intent?.timePreference?.startDate) ?? tomorrow)
        _flexibleEnd = State(initialValue: NativeIntentTimePreference.date(intent?.timePreference?.endDate) ?? tomorrow)
        _period = State(initialValue: intent?.timePreference?.period ?? "ANY")
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if !dynamicTypeSize.isAccessibilitySize { editorProgress }
                Form {
                    if dynamicTypeSize.isAccessibilitySize {
                        Section { editorProgress }
                            .listRowBackground(Color.clear)
                            .listRowInsets(EdgeInsets())
                    }
                    if editorStep == 0 {
                        activityFields
                    } else {
                        timeFields
                    }
                    if dynamicTypeSize.isAccessibilitySize {
                        Section {
                            Text(editorActionDetail)
                                .font(.caption)
                                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .listRowBackground(Color.clear)
                    }
                }
                .scrollContentBackground(.hidden)
                .scrollDismissesKeyboard(.interactively)
                .accessibilityIdentifier("intent-editor-fields")
                .id(editorStep)
                .disabled(isSaving)
            }
            .background(SideSeatTheme.bgGrouped)
            .navigationTitle(AppLocalization.string(intent == nil ? "Add an intention" : "Edit intention"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    if editorStep == 0 {
                        Button("Cancel") { dismiss() }
                            .disabled(isSaving)
                    } else {
                        Button("Back") { changeStep(0) }
                            .disabled(isSaving)
                            .accessibilityIdentifier("intent-editor-back")
                    }
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                VStack(spacing: 0) {
                    if let saveIssue {
                        Text(saveIssue)
                            .font(.footnote)
                            .foregroundStyle(SideSeatTheme.danger)
                            .padding(.horizontal, SideSeatTheme.screenHorizontal)
                            .padding(.top, SideSeatTheme.spaceSM)
                            .accessibilityIdentifier("intent-editor-issue")
                    }
                    SSFlowActionDock(
                        title: editorActionTitle,
                        detail: dynamicTypeSize.isAccessibilitySize ? "" : editorActionDetail,
                        isLoading: isSaving,
                        isEnabled: editorStep == 0
                            ? hasValidActivity : hasValidActivity && hasValidTimeWindows && note.count <= 160,
                        accessibilityID: editorStep == 0 ? "intent-editor-next" : "intent-editor-save"
                    ) {
                        if editorStep == 0 {
                            changeStep(1)
                        } else {
                            Task { await save() }
                        }
                    }
                }
                .background(SideSeatTheme.surface)
            }
        }
        .ssFlowSheet(isSaving: isSaving)
        .accessibilityIdentifier("intent-editor")
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

    private var editorActionDetail: String {
        AppLocalization.string(editorStep == 0
            ? "One activity at a time. You can add more later."
            : automaticMatchingEnabled
                ? (intent?.isPaused == true ? "This intention stays paused until you resume it."
                    : clientConfiguration.configuration?.isFeatureEnabled("v2DiscoveryMatching") == true
                        ? "Discover participating people by relevance, even when preferences differ. Both choose whether to chat. Pause anytime."
                        : "Automatically find company until this intention expires. Pause anytime.")
                : "Saved privately. Start matching separately when you're ready.")
    }

    private var automaticMatchingEnabled: Bool {
        clientConfiguration.configuration?.isFeatureEnabled("v2AutomaticMatching") == true &&
            ActionToPlanV2Store.shared.isMutualOpportunityEnabled
    }

    private var editorActionTitle: String {
        if editorStep == 0 {
            return AppLocalization.string(dynamicTypeSize.isAccessibilitySize ? "Next" : "Choose timing preference")
        }
        if automaticMatchingEnabled, intent?.isPaused != true {
            if intent?.automaticMatching == true {
                return AppLocalization.string(dynamicTypeSize.isAccessibilitySize ? "Save" : "Save changes")
            }
            return AppLocalization.string(dynamicTypeSize.isAccessibilitySize ? "Publish intention (short)" : "Publish intention")
        }
        return AppLocalization.string(dynamicTypeSize.isAccessibilitySize ? "Save" : "Save intention")
    }

    private var editorProgress: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            HStack(spacing: SideSeatTheme.spaceSM) {
                ForEach(0..<2) { step in
                    Capsule()
                        .fill(step <= editorStep ? SideSeatTheme.accent : SideSeatTheme.fillTertiary)
                        .frame(height: 3)
                }
            }
            .accessibilityHidden(true)
            Text(AppLocalization.string(editorStep == 0 ? "1 · What would you like to do?" : "2 · When would you like to go?"))
                .font(.headline)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
        }
        .padding(.horizontal, SideSeatTheme.screenHorizontal)
        .padding(.top, SideSeatTheme.spaceMD)
        .padding(.bottom, SideSeatTheme.spaceSM)
    }

    private var activityFields: some View {
        Group {
            Section("Activity") {
                LazyVGrid(
                    columns: [GridItem(.adaptive(minimum: dynamicTypeSize.isAccessibilitySize ? 260 : 130))],
                    spacing: SideSeatTheme.spaceMD
                ) {
                    ForEach(NativeWeeklyIntentTopic.allCases) { option in
                        SSActivityChoice(
                            topic: option,
                            isSelected: topic == option
                        ) {
                            topic = option
                        }
                        .accessibilityIdentifier("intent-topic-\(option.rawValue.lowercased())")
                    }
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
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
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
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
                    .accessibilityIdentifier("intent-editor-activity")

                    if !hasValidActivityText {
                        Text("Describe the specific thing you want to do.")
                            .font(.footnote)
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
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
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
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

        }
    }

    private var timeFields: some View {
        Group {
            Section {
                SSFlowCardHeader(
                    title: activitySummary,
                    subtitle: topic.title,
                    systemImage: topic.systemImage,
                    activityTopic: topic
                )
            }
            if supportsFlexibleTiming { timingPreferences }
            if effectiveTimingKind == "EXACT" {
              Section("When") {
                ForEach($timeWindows) { $window in
                    VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                        timeRowLayout {
                            Text("Start")
                                .fixedSize()
                                .layoutPriority(2)
                            if !dynamicTypeSize.isAccessibilitySize { Spacer() }
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
                                        window.endAt =
                                            NativeWeeklyIntentTimeRules
                                            .minimumEnd(after: start)
                                    }
                                ),
                                range: pickerLowerBound...pickerUpperBound,
                                accessibilityLabel: AppLocalization.string("Start")
                            )
                            .frame(minHeight: 44)
                            .layoutPriority(1)
                        }
                        timeRowLayout {
                            Text("End")
                                .fixedSize()
                                .layoutPriority(2)
                            if !dynamicTypeSize.isAccessibilitySize { Spacer() }
                            WeeklyIntentDateTimePicker(
                                selection: Binding(
                                    get: { window.endAt },
                                    set: { newValue in
                                        let minimumEnd =
                                            NativeWeeklyIntentTimeRules
                                            .minimumEnd(after: window.startAt)
                                        let end =
                                            NativeWeeklyIntentTimeRules
                                            .roundedUpToQuarterHour(newValue)
                                        window.endAt = min(max(end, minimumEnd), expiry)
                                    }
                                ),
                                range:
                                    NativeWeeklyIntentTimeRules
                                    .minimumEnd(after: window.startAt)...expiry,
                                accessibilityLabel: AppLocalization.string("End")
                            )
                            .frame(minHeight: 44)
                            .layoutPriority(1)
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
                    Text("Choose future, non-overlapping times of 30 minutes to 12 hours before this intention expires.")
                        .font(.footnote)
                        .foregroundStyle(SideSeatTheme.danger)
                }
            }
            }
            if clientConfiguration.configuration?.isFeatureEnabled("v2ExploreIntents") == true {
            Section("Explore visibility") {
                Toggle(AppLocalization.string("Allow others to discover this intention"), isOn: $exploreVisible)
                    .accessibilityIdentifier("intent-explore-visible")
                Text(AppLocalization.string("Before mutual interest, Explore shows only the activity, broad timing, campus, verification and limited language context. Your name, photo, profile and contact details stay hidden."))
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            }
            Section("Optional") {
                TextField("A short clarification", text: $note, axis: .vertical)
                    .lineLimit(2...4)
                Text(AppLocalization.string(exploreVisible
                    ? "This note may appear as a short Explore activity preview."
                    : "This note stays private while Explore visibility is off."))
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.textSecondary)
            }
        }
    }

    private var supportsFlexibleTiming: Bool {
        clientConfiguration.configuration?.isFeatureEnabled("v2FlexibleTiming") == true || intent?.timePreference != nil
    }

    private var effectiveTimingKind: String { supportsFlexibleTiming ? timingKind : "EXACT" }

    private var submittedTiming: NativeIntentTimePreference? {
        guard supportsFlexibleTiming else { return nil }
        if timingKind == "FLEXIBLE" {
            return NativeIntentTimePreference(kind: timingKind,
                startDate: NativeIntentTimePreference.dateKey(flexibleStart),
                endDate: NativeIntentTimePreference.dateKey(flexibleEnd), period: period)
        }
        return NativeIntentTimePreference(kind: timingKind)
    }

    private var lastFlexibleDay: Date {
        let calendar = Calendar.current
        return max(calendar.startOfDay(for: Date()), calendar.date(byAdding: .day, value: -1,
            to: calendar.startOfDay(for: expiry.addingTimeInterval(1)))!)
    }

    private var timingPreferences: some View {
        Group {
            Section {
                timingChoice("UNDECIDED", title: "Time to discuss", detail: "Just an intention for now. Find someone first.", icon: "bubble.left.and.bubble.right")
                timingChoice("FLEXIBLE", title: "A day or date range", detail: "Tomorrow, next week, or a few possible days.", icon: "calendar")
                timingChoice("EXACT", title: "Specific times", detail: "I already know when I am available.", icon: "clock")
            } header: {
                Text("Timing preference")
            } footer: {
                Text("This is a preference, not an appointment. Agree on the exact time in chat.")
            }
            if timingKind == "FLEXIBLE" {
                Section("A day or date range") {
                    let quickLayout = dynamicTypeSize.isAccessibilitySize
                        ? AnyLayout(VStackLayout(alignment: .leading, spacing: SideSeatTheme.spaceSM))
                        : AnyLayout(HStackLayout(spacing: SideSeatTheme.spaceSM))
                    quickLayout { quickDateButtons }
                    DatePicker("From", selection: $flexibleStart,
                        in: Calendar.current.startOfDay(for: Date())...lastFlexibleDay, displayedComponents: .date)
                        .accessibilityIdentifier("intent-flexible-start")
                        .onChange(of: flexibleStart) { _, value in
                            if flexibleEnd < value { flexibleEnd = value }
                        }
                    DatePicker("Through", selection: $flexibleEnd,
                        in: min(flexibleStart, lastFlexibleDay)...lastFlexibleDay, displayedComponents: .date)
                        .accessibilityIdentifier("intent-flexible-end")
                    if dynamicTypeSize.isAccessibilitySize {
                        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                            Text("Part of the day")
                            Menu {
                                ForEach(["ANY", "MORNING", "AFTERNOON", "EVENING"], id: \.self) { part in
                                    Button(NativeIntentTimePreference.periodTitle(part)) { period = part }
                                }
                            } label: {
                                HStack(alignment: .top) {
                                    Text(NativeIntentTimePreference.periodTitle(period))
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .fixedSize(horizontal: false, vertical: true)
                                    Image(systemName: "chevron.up.chevron.down").font(.caption)
                                }
                                .foregroundStyle(SideSeatTheme.textPrimary)
                            }
                            .accessibilityIdentifier("intent-period-picker")
                        }
                    } else {
                        Picker("Part of the day", selection: $period) {
                            ForEach(["ANY", "MORNING", "AFTERNOON", "EVENING"], id: \.self) { part in
                                Text(NativeIntentTimePreference.periodTitle(part)).tag(part)
                            }
                        }
                    }
                    Text(submittedTiming?.summary ?? "")
                        .font(.footnote)
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("intent-timing-summary")
                }
                .environment(\.locale, AppLocalization.selectedLanguage.locale)
            }
            Section {
                Text(String(format: AppLocalization.string("Active until %@"),
                    expiry.formatted(.dateTime.month(.abbreviated).day().locale(AppLocalization.selectedLanguage.locale))))
                Text("You can pause, end, or extend this intention later.")
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
            }
        }
    }

    private func timingChoice(_ kind: String, title: String, detail: String, icon: String) -> some View {
        Button {
            withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) {
                timingKind = kind
                if kind == "FLEXIBLE" {
                    flexibleStart = min(max(Calendar.current.startOfDay(for: flexibleStart), Calendar.current.startOfDay(for: Date())), lastFlexibleDay)
                    flexibleEnd = min(max(Calendar.current.startOfDay(for: flexibleEnd), flexibleStart), lastFlexibleDay)
                }
            }
        } label: {
            HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
                Image(systemName: icon)
                    .font(.system(size: 20))
                    .frame(width: 24).padding(.top, 3)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 4) {
                    Text(AppLocalization.string(String.LocalizationValue(title))).font(.subheadline.weight(.semibold))
                    Text(AppLocalization.string(String.LocalizationValue(detail))).font(.footnote)
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
                Image(systemName: timingKind == kind ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 22))
                    .padding(.top, 3)
                    .accessibilityHidden(true)
            }
            .foregroundStyle(timingKind == kind ? SideSeatTheme.accent : SideSeatTheme.textPrimary)
            .padding(.vertical, SideSeatTheme.spaceSM)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("intent-timing-\(kind.lowercased())")
        .accessibilityAddTraits(timingKind == kind ? .isSelected : [])
    }

    @ViewBuilder private var quickDateButtons: some View {
        ForEach(["Tomorrow", "This weekend", "Next week"], id: \.self) { title in
            let range = quickDateRange(title)
            Button(AppLocalization.string(String.LocalizationValue(title))) {
                flexibleStart = range.0
                flexibleEnd = range.1
            }
            .buttonStyle(.bordered)
            .fixedSize(horizontal: false, vertical: true)
            .tint(SideSeatTheme.accent)
            .disabled(range.1 > lastFlexibleDay)
            .accessibilityIdentifier("intent-quick-\(title)")
        }
    }

    private func quickDateRange(_ title: String) -> (Date, Date) {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        let weekday = calendar.component(.weekday, from: today)
        let offset = title == "Tomorrow" ? 1 : title == "This weekend" ? (weekday == 1 ? 0 : (7 - weekday)) : (9 - weekday) % 7 == 0 ? 7 : (9 - weekday) % 7
        let start = calendar.date(byAdding: .day, value: offset, to: today)!
        let count = title == "Next week" ? 6 : title == "This weekend" && weekday != 1 ? 1 : 0
        return (start, calendar.date(byAdding: .day, value: count, to: start)!)
    }

    private var timeRowLayout: AnyLayout {
        dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SideSeatTheme.spaceSM))
            : AnyLayout(HStackLayout(spacing: SideSeatTheme.spaceSM))
    }

    private var activitySummary: String {
        switch topic {
        case .study: studyGoal.trimmingCharacters(in: .whitespacesAndNewlines)
        case .sports: sportText.trimmingCharacters(in: .whitespacesAndNewlines)
        default: activityText.trimmingCharacters(in: .whitespacesAndNewlines)
        }
    }

    private var hasValidActivity: Bool {
        hasValidActivityText && hasValidSportSelection && hasValidStudyGoal
    }

    private func changeStep(_ step: Int) {
        isSportInputFocused = false
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) {
            editorStep = step
        }
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        let sportSelection = NativeSportInput.normalized(sportText)
        _ = await onSave(
            topic, activityText, sportSelection.tag, sportSelection.otherNote ?? "",
            togetherMode, studyGoal, selectedCourseID, normalizedTimeWindows, submittedTiming, exploreVisible, note
        )
    }

    private var expiry: Date {
        intent?.expiresAt ?? (supportsFlexibleTiming || automaticMatchingEnabled ? Date().addingTimeInterval(14 * 24 * 60 * 60) : Self.currentWeekExpiry())
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
        guard effectiveTimingKind == "EXACT" else { return [] }
        return timeWindows
            .map(\.value)
            .sorted {
                $0.startAt == $1.startAt
                    ? $0.endAt < $1.endAt
                    : $0.startAt < $1.startAt
            }
    }

    private var hasValidTimeWindows: Bool {
        if effectiveTimingKind == "UNDECIDED" { return true }
        if effectiveTimingKind == "FLEXIBLE" {
            return flexibleStart <= flexibleEnd && Calendar.current.startOfDay(for: flexibleStart) >= Calendar.current.startOfDay(for: Date()) && flexibleEnd <= lastFlexibleDay
        }
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
