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

@MainActor @Observable
final class IntentionPublicationLaunch {
    static let shared = IntentionPublicationLaunch()
    var intentID: String?
}

/// Present on the originating Plan surface so cancelling preserves its navigation/scroll state.
struct CompletedPlanIntentionSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(ClientConfigurationStore.self) private var clientConfiguration
    @State private var store = WeeklyIntentStore()
    let draft: CompletedPlanIntentDraft
    let onPublished: (String) -> Void

    var body: some View {
        WeeklyIntentEditorView(intent: nil, completedPlanDraft: draft, saveIssue: store.issue) {
            topic, activityText, sportTag, sportOtherNote, togetherMode, studyGoal,
            courseId, timeWindows, timePreference, exploreVisible, note in
            let config = clientConfiguration.configuration
            let saved = await store.save(
                intent: nil, topic: topic, activityText: activityText,
                sportTag: sportTag, sportOtherNote: sportOtherNote,
                togetherMode: togetherMode, studyGoal: studyGoal, courseId: courseId,
                timeWindows: timeWindows, timePreference: timePreference,
                automaticMatching: config?.isFeatureEnabled("v2AutomaticMatching") == true
                    && ActionToPlanV2Store.shared.isMutualOpportunityEnabled,
                exploreVisible: config?.isFeatureEnabled("v2ExploreIntents") == true ? exploreVisible : nil,
                note: note, using: session
            )
            if saved, let id = store.lastSavedIntentID { onPublished(id) }
            return saved
        }
    }
}

private struct WeeklyIntentEditorPresentation: Identifiable {
    let id: String
    let intent: NativeWeeklyIntent?
    var template: NativeWeeklyIntent? = nil
    var rebookingPlan: NativePlanRequest? = nil

    static func repeatIntent(_ intent: NativeWeeklyIntent) -> Self {
        Self(id: "repeat-" + intent.id, intent: nil, template: intent)
    }

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
            .accessibilityLabel(AppLocalization.string("Reconnect"))
            .accessibilityIdentifier("together-reconnect")
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
    case intentions, recommendations, bookmarks
    var id: Self { self }

    var title: String {
        switch self {
        case .recommendations: AppLocalization.string("Together recommendations")
        case .intentions: AppLocalization.string("My intentions")
        case .bookmarks: AppLocalization.string("Saved intentions")
        }
    }

    var compactTitle: String {
        switch self {
        case .intentions: AppLocalization.string("Intentions (section)")
        case .recommendations: AppLocalization.string("Together recommendations")
        case .bookmarks: AppLocalization.string("Saved (section)")
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
    @Environment(\.scenePhase) private var scenePhase
    @State private var store = WeeklyIntentStore()
    @State private var matchingSessionStore = TogetherMatchingSessionStore()
    @State private var opportunityStore = MutualOpportunityStore()
    @State private var v2Store = ActionToPlanV2Store.shared
    @State private var presentedEditor: WeeklyIntentEditorPresentation?
    @State private var showsExpiredIntentions = false
    @State private var showsSectionPicker = false
    @State private var selectedSection: TogetherSection = .recommendations
    @State private var resolvedInitialSection = false
    @State private var createdIntentionRevision = 0
    @State private var publishedIntentID: String?
    @State private var exploreStore = ExploreIntentStore()
    @State private var hasRequestedMoreRecommendations = false
    @State private var messageOpportunity: NativeMutualOpportunity?
    @State private var profileOpportunity: NativeMutualOpportunity?
    @State private var savedWhileBrowsingIDs: Set<String> = []
    @State private var savedFeedbackID: UUID?
    @State private var pendingDismissal: NativeMutualOpportunity?
    @State private var hiddenRecommendationIDs: Set<String> = []

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

    private func consumeRebooking() {
        guard let plan = PlanRebookingLaunch.shared.plan else { return }
        PlanRebookingLaunch.shared.plan = nil
        sectionSelection.wrappedValue = .intentions
        presentedEditor = .init(id: "rebook-" + plan.id, intent: nil, rebookingPlan: plan)
    }

    private func consumePublication() async {
        guard let id = IntentionPublicationLaunch.shared.intentID else { return }
        IntentionPublicationLaunch.shared.intentID = nil
        sectionSelection.wrappedValue = .intentions
        publishedIntentID = id
        await loadContent()
        createdIntentionRevision += 1
    }

    var body: some View {
        TimelineView(.periodic(from: .now, by: 60)) { context in
            VStack(spacing: 0) {
                sectionPicker(at: context.date)
                    .padding(.horizontal, SideSeatTheme.screenHorizontal)
                    .background(SideSeatTheme.bgGrouped)

                SSSectionPager(sections: TogetherSection.allCases, selection: sectionSelection) { section in
                    ScrollViewReader { scrollProxy in
                        ScrollView {
                            VStack(alignment: .leading, spacing: SideSeatTheme.spaceLG) {
                                switch section {
                                case .intentions: intentSection(at: context.date)
                                case .recommendations: recommendationsSection(at: context.date)
                                case .bookmarks: savedOpportunitySection
                                }
                            }
                            .padding(.horizontal, SideSeatTheme.screenHorizontal)
                            .padding(.top, SideSeatTheme.spaceMD)
                            .padding(.bottom, SideSeatTheme.rootScrollBottomClearance)
                        }
                        .accessibilityIdentifier("together-section-\(section.rawValue)")
                        .refreshable {
                            savedWhileBrowsingIDs.removeAll()
                            await loadContent()
                        }
                        .onChange(of: createdIntentionRevision) { _, _ in
                            if section == .intentions {
                                scrollProxy.scrollTo("together-intentions-top", anchor: .top)
                            }
                        }
                    }
                }
            }
        }
        .overlay(alignment: .bottom) {
            if pendingDismissal != nil {
                HStack(spacing: SideSeatTheme.spaceMD) {
                    Text("Recommendation hidden")
                        .fixedSize(horizontal: false, vertical: true)
                    Button("Undo hiding") {
                        if let pendingDismissal { hiddenRecommendationIDs.remove(pendingDismissal.id) }
                        pendingDismissal = nil
                    }
                    .fontWeight(.semibold)
                    .frame(minHeight: 44)
                    .accessibilityIdentifier("recommendation-dismiss-undo")
                }
                .font(.footnote)
                .foregroundStyle(SideSeatTheme.utilityAction)
                .padding(.horizontal, SideSeatTheme.spaceMD)
                .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
                .padding(SideSeatTheme.spaceMD)
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("recommendation-dismiss-feedback")
            } else if savedFeedbackID != nil {
                Label("Saved privately. Only you can see this.", systemImage: "heart.fill")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.utilityAction)
                    .padding(SideSeatTheme.spaceMD)
                    .background(SideSeatTheme.surface, in: Capsule())
                    .padding(.bottom, SideSeatTheme.spaceMD)
                    .allowsHitTesting(false)
                    .accessibilityIdentifier("bookmark-saved-feedback")
            }
        }
        .task(id: savedFeedbackID) {
            guard savedFeedbackID != nil else { return }
            do { try await Task.sleep(for: .seconds(1.8)) } catch { return }
            savedFeedbackID = nil
        }
        .task(id: pendingDismissal?.id) {
            guard pendingDismissal != nil else { return }
            do { try await Task.sleep(for: .seconds(5)) } catch { return }
            // The request must outlive the undo banner's task identity.
            Task { await commitPendingDismissal() }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background { Task { await commitPendingDismissal() } }
        }
        .onDisappear { Task { await commitPendingDismissal() } }
        .background(SideSeatTheme.bgGrouped)
        .ssRootNavigationTitle("Together")
        .task { await loadContent(); consumeRebooking(); await consumePublication() }
        .onChange(of: PlanRebookingLaunch.shared.plan?.id) { consumeRebooking() }
        .onChange(of: IntentionPublicationLaunch.shared.intentID) { _, id in
            if id != nil { Task { await consumePublication() } }
        }
        .onReceive(NotificationCenter.default.publisher(for: .sideSeatTogetherNeedsRefresh)) { _ in
            Task { await loadContent() }
        }
        .sheet(item: $profileOpportunity) { opportunity in
            TogetherPeerPreview(opportunity: opportunity)
        }
        .sheet(item: $messageOpportunity) { opportunity in
            OpportunityMessageComposer(opportunity: opportunity) { body in
                await opportunityStore.interact(opportunity.messageRequest?.isIncoming == true ? "REPLY" : "SEND",
                    opportunity: opportunity, body: body, using: session)
            } onConversation: { updated in
                router.navigate(to: updated.conversationRoute)
            }
        }
        .sheet(item: $presentedEditor) { presentation in
            WeeklyIntentEditorView(intent: presentation.intent, template: presentation.template, rebookingPlan: presentation.rebookingPlan, saveIssue: store.issue) {
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
                    if presentation.intent == nil {
                        publishedIntentID = store.lastSavedIntentID
                        createdIntentionRevision += 1
                    }
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

    private func sectionPicker(at now: Date) -> some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                sectionMenu(at: now)
            } else {
                ViewThatFits(in: .horizontal) {
                    SSRootTabs(items: TogetherSection.allCases.map { section in
                        SSRootTabItem(id: section, title: LocalizedStringKey(section.title),
                            accessibilityID: "together-tab-\(section.rawValue)",
                            accessibilityLabel: sectionTitle(section, at: now))
                    }, selection: sectionSelection)
                    sectionMenu(at: now)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(AppLocalization.string("Together"))
        .accessibilityIdentifier("together-segmented-control")
        .sheet(isPresented: $showsSectionPicker) {
            NavigationStack {
                List(TogetherSection.allCases) { section in
                    Button {
                        sectionSelection.wrappedValue = section
                        showsSectionPicker = false
                    } label: {
                        HStack(spacing: SideSeatTheme.spaceSM) {
                            Text(section.compactTitle)
                                .font(.body.weight(section == selectedSection ? .semibold : .regular))
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 0)
                            if section == selectedSection {
                                Image(systemName: "checkmark").accessibilityHidden(true)
                            }
                        }
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .foregroundStyle(SideSeatTheme.utilityAction)
                        .contentShape(Rectangle())
                    }
                    .accessibilityLabel(sectionTitle(section, at: now))
                    .accessibilityAddTraits(section == selectedSection ? .isSelected : [])
                    .accessibilityIdentifier("together-tab-\(section.rawValue)")
                }
                .navigationTitle("Together")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done", systemImage: "checkmark") { showsSectionPicker = false }.ssToolbarAction()
                    }.ssStandaloneAction()
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("together-section-picker")
            .presentationDetents(dynamicTypeSize.isAccessibilitySize ? [.large] : [.medium, .large])
            .dynamicTypeSize(dynamicTypeSize)
        }
    }

    private func sectionMenu(at now: Date) -> some View {
        Button { showsSectionPicker = true } label: {
            HStack(spacing: SideSeatTheme.spaceSM) {
                Text(selectedSection.compactTitle)
                    .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                    .font(.body.weight(.semibold))
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                Image(systemName: "chevron.down").font(.subheadline.weight(.semibold))
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, SideSeatTheme.spaceSM)
            .padding(.vertical, SideSeatTheme.spaceXS)
            .frame(maxWidth: .infinity, minHeight: 44)
            .padding(.bottom, SideSeatTheme.spaceSM)
            .foregroundStyle(SideSeatTheme.textPrimary)
            .overlay(alignment: .bottomLeading) {
                Capsule().fill(SideSeatTheme.utilityAction)
                    .frame(width: 24, height: 3)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(SSPressButtonStyle())
        .accessibilityLabel(AppLocalization.string("Together sections"))
        .accessibilityValue(sectionTitle(selectedSection, at: now))
        .accessibilityHint(AppLocalization.string("Choose a section"))
        .accessibilityIdentifier("together-section-menu")
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

    private var addIntentionButton: some View {
        Button { presentedEditor = .create() } label: {
            HStack(spacing: SideSeatTheme.spaceSM) {
                Image(systemName: "plus")
                    .accessibilityHidden(true)
                Text("Add")
                    .fixedSize(horizontal: false, vertical: true)
            }
            .font(.subheadline.weight(.medium))
            .foregroundStyle(SideSeatTheme.utilityAction)
            .padding(.vertical, SideSeatTheme.spaceSM)
            .frame(minWidth: 44, maxWidth: dynamicTypeSize.isAccessibilitySize ? .infinity : nil,
                minHeight: 44, alignment: dynamicTypeSize.isAccessibilitySize ? .leading : .trailing)
            .contentShape(Rectangle())
            .fixedSize(horizontal: !dynamicTypeSize.isAccessibilitySize, vertical: true)
        }
        .buttonStyle(SSActionButtonStyle())
        .accessibilityLabel(AppLocalization.string("Add an intention"))
        .accessibilityIdentifier("together-add-intent")
        .disabled(store.isCreating || store.isLoading)
    }

    @ViewBuilder
    private func intentSection(at now: Date) -> some View {
        if !v2Store.isWeeklyIntentEnabled {
            unavailableSection
        } else {
            let current = store.intents.filter { status(for: $0, at: now) != .expired }
            let expired = store.expiredIntents + store.intents.filter { candidate in
                status(for: candidate, at: now) == .expired && !store.expiredIntents.contains(where: { $0.id == candidate.id })
            }
            if !current.isEmpty {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                    let headingLayout = dynamicTypeSize.isAccessibilitySize
                        ? AnyLayout(VStackLayout(alignment: .leading, spacing: SideSeatTheme.spaceMD))
                        : AnyLayout(HStackLayout(alignment: .center, spacing: SideSeatTheme.spaceMD))
                    headingLayout {
                        Text(AppLocalization.string("What I want to do"))
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(SideSeatTheme.Together.ink)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .accessibilityAddTraits(.isHeader)
                            .accessibilityIdentifier("together-intentions-heading")
                        if !current.isEmpty { addIntentionButton }
                    }
                    Text(AppLocalization.string("Your activities, timing and finding status, all in one place."))
                        .font(.subheadline)
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .id("together-intentions-top")
            }

            if let publishedIntentID, store.intents.contains(where: { $0.id == publishedIntentID }) {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                    Label("Intention published", systemImage: "checkmark.circle")
                        .font(.subheadline.weight(.medium))
                        .fixedSize(horizontal: false, vertical: true)
                    Button {
                        sectionSelection.wrappedValue = .recommendations
                        self.publishedIntentID = nil
                    } label: {
                        Text("View recommendations")
                            .font(.subheadline.weight(.medium))
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(minHeight: 44)
                    }
                    .foregroundStyle(SideSeatTheme.utilityAction)
                    .accessibilityIdentifier("together-view-recommendations")
                }
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("together-publication-success")
            }

            if !store.hasLoaded && store.issue == nil && current.isEmpty {
                ProgressView().frame(maxWidth: .infinity, minHeight: 120)
            } else if let issue = store.issue, store.intents.isEmpty {
                loadFailure(issue: issue)
            } else if current.isEmpty {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                    Text("Your next activity")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.Together.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                    Button { presentedEditor = .create() } label: {
                        Text("Add")
                            .font(.body.weight(.semibold))
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.horizontal, SideSeatTheme.spaceSM)
                            .padding(.vertical, SideSeatTheme.spaceMD)
                            .frame(maxWidth: .infinity, minHeight: 48)
                            .foregroundStyle(SideSeatTheme.ProductAction.foreground)
                            .background(SideSeatTheme.ProductAction.fill,
                                in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(SSPressButtonStyle())
                    .disabled(store.isCreating)
                    .accessibilityLabel(AppLocalization.string("Add an intention"))
                    .accessibilityIdentifier("together-add-first-intent")
                    Text("Add an activity and choose when to find company.")
                        .font(.subheadline)
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("together-set-intent")
            } else {
                ForEach(current) { intent in
                    WeeklyIntentCard(
                        intent: intent, status: status(for: intent, at: now),
                        isWorking: store.mutatingIDs.contains(intent.id),
                        onEdit: { presentedEditor = .edit(intent) },
                        onTogglePause: {
                            Task {
                                if await store.setPaused(!intent.isPaused, intent: intent,
                                    automaticMatching: automaticMatchingEnabled, using: session) {
                                    if publishedIntentID == intent.id { publishedIntentID = nil }
                                    await refreshOpportunitiesAfterIntentChange()
                                }
                            }
                        },
                        onDelete: {
                            Task {
                                let changed = await store.end(intent, using: session)
                                if changed { await refreshOpportunitiesAfterIntentChange() }
                            }
                        }
                    )
                }
                if let issue = store.issue { loadFailure(issue: issue) }
            }
            if !expired.isEmpty {
                Button {
                    withAnimation { showsExpiredIntentions.toggle() }
                } label: {
                    HStack {
                        Text("\(AppLocalization.string("Expired")) · \(expired.count)")
                        Spacer()
                        Image(systemName: showsExpiredIntentions ? "chevron.up" : "chevron.down")
                    }
                    .font(.subheadline.weight(.semibold))
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(SSActionButtonStyle(horizontalPadding: 12))
                .accessibilityIdentifier("weekly-intent-expired-history")
                if showsExpiredIntentions {
                    ForEach(expired) { intent in
                        WeeklyIntentCard(intent: intent, status: .expired, isWorking: false,
                            onEdit: {}, onDelete: {},
                            onRepeat: { presentedEditor = .repeatIntent(intent) })
                            .padding(.top, SideSeatTheme.spaceSM)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func recommendationsSection(at now: Date) -> some View {
        if v2Store.isMutualOpportunityEnabled {
            if !opportunityStore.hasLoaded && opportunityStore.issue == nil {
                recommendationSkeletons
            } else {
                if !automaticMatchingEnabled,
                   !store.intents.isEmpty || matchingSessionStore.session.state != .idle {
                    matchingSessionSection
                }
                opportunitySection
                if exploreEnabled && opportunityStore.hasLoaded {
                    if hasRequestedMoreRecommendations {
                        ExploreIntentListView(embeddedInTogether: true,
                            isPageActive: selectedSection == .recommendations,
                            onOpportunityChange: { opportunity in opportunityStore.upsert(opportunity) },
                            onBookmarkSaved: { bookmarkDidSave($0) },
                            onDismiss: { opportunity in Task { await hideRecommendation(opportunity) } },
                            hiddenOpportunityIDs: hiddenRecommendationIDs,
                            onShowRecommendations: nil,
                            inlineInRecommendations: true,
                            opportunities: opportunityStore.opportunities,
                            renderOpportunity: { AnyView(opportunityCard($0)) }, store: exploreStore)
                    }
                    if !showsInitialRecommendationEmptyState,
                       !hasRequestedMoreRecommendations || exploreStore.isLoading || exploreStore.issue != nil || exploreStore.hasMore {
                        Button(action: findMoreRecommendations) {
                            HStack(spacing: SideSeatTheme.spaceSM) {
                                if exploreStore.isLoading { ProgressView() }
                                else { Image(systemName: "sparkle.magnifyingglass") }
                                Text(AppLocalization.string(exploreStore.isLoading ? "Loading recommendations…" : exploreStore.issue != nil ? "Try again" : hasRequestedMoreRecommendations ? "Search again" : "Find more recommendations"))
                                    .font(.subheadline.weight(.semibold))
                            }
                            .foregroundStyle(SideSeatTheme.utilityAction)
                            .frame(maxWidth: .infinity, minHeight: 48)
                            .background(SideSeatTheme.fillSubtle,
                                in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
                        }
                        .buttonStyle(SSPressButtonStyle())
                        .disabled(exploreStore.isLoading)
                        .accessibilityIdentifier("together-find-more")
                    }
                }
            }
        } else {
            unavailableSection
        }
    }

    private var recommendationSkeletons: some View {
        VStack(spacing: SideSeatTheme.spaceMD) {
            ForEach(0..<3) { _ in
                SSFlowCard {
                    HStack(spacing: 12) {
                        Circle().fill(SideSeatTheme.fillTertiary).frame(width: 36, height: 36)
                        RoundedRectangle(cornerRadius: 4).fill(SideSeatTheme.fillTertiary).frame(width: 120, height: 16)
                        Spacer()
                    }
                    RoundedRectangle(cornerRadius: 4).fill(SideSeatTheme.fillTertiary).frame(height: 24)
                    RoundedRectangle(cornerRadius: 4).fill(SideSeatTheme.fillTertiary).frame(height: 56)
                    HStack {
                        RoundedRectangle(cornerRadius: 8).fill(SideSeatTheme.fillTertiary).frame(height: 44)
                        RoundedRectangle(cornerRadius: 8).fill(SideSeatTheme.fillTertiary).frame(height: 44)
                    }
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Loading recommendations…")
        .accessibilityIdentifier("recommendation-loading")
    }

    private func loadFailure(issue: String) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            Label(AppLocalization.string(String.LocalizationValue(issue)), systemImage: "wifi.exclamationmark")
                .font(.footnote).foregroundStyle(SideSeatTheme.danger)
                .fixedSize(horizontal: false, vertical: true)
            Button(AppLocalization.string("Try again")) { Task { await loadContent() } }
                .buttonStyle(.bordered).frame(minHeight: 44)
                .accessibilityIdentifier("recommendation-retry")
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


    private var displayedOpportunities: [NativeMutualOpportunity] {
        let explorationIDs = Set(exploreStore.intents.compactMap { $0.interest?.opportunityId })
        return opportunityStore.opportunities.filter {
            !$0.isUnavailable && !$0.hasConversation && !hiddenRecommendationIDs.contains($0.id)
                && ($0.isBookmarked != true || savedWhileBrowsingIDs.contains($0.id))
                && !explorationIDs.contains($0.id)
        }
    }

    private var savedOpportunities: [NativeMutualOpportunity] {
        opportunityStore.opportunities.filter { $0.isBookmarked == true }
    }

    private var savedOpportunitySection: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            if opportunityStore.isLoading, savedOpportunities.isEmpty {
                ProgressView().frame(maxWidth: .infinity, minHeight: 120)
            } else if let issue = opportunityStore.issue, savedOpportunities.isEmpty {
                loadFailure(issue: issue)
            } else if savedOpportunities.isEmpty {
                ContentUnavailableView {
                    Label(AppLocalization.string("No saved intentions"), systemImage: "heart")
                } description: {
                    Text("Save an intention to find it here later.")
                } actions: {
                    Button(AppLocalization.string("View recommendations")) {
                        sectionSelection.wrappedValue = .recommendations
                    }
                    .buttonStyle(.borderedProminent)
                    .frame(minHeight: 44)
                    .accessibilityIdentifier("together-saved-empty-recommendations")
                }
            } else {
                ForEach(savedOpportunities) { opportunity in opportunityCard(opportunity, inRecommendations: false) }
                if let issue = opportunityStore.issue { loadFailure(issue: issue) }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("together-bookmarks")
    }

    private var opportunitySection: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            if let issue = opportunityStore.issue, displayedOpportunities.isEmpty {
                loadFailure(issue: issue)
            } else if displayedOpportunities.isEmpty {
                if !hasRequestedMoreRecommendations { emptyOpportunityState }
            } else {
                ForEach(displayedOpportunities) { opportunity in opportunityCard(opportunity) }
                if let issue = opportunityStore.issue { loadFailure(issue: issue) }
            }
        }
        .accessibilityElement(children: .contain)
    }

    private var emptyOpportunityState: some View {
        let count = findingCount(at: Date())
        return VStack(spacing: SideSeatTheme.spaceXL) {
            VStack(spacing: SideSeatTheme.spaceMD) {
                Image(systemName: "person.2")
                    .font(.system(size: 25, weight: .medium))
                    .foregroundStyle(SideSeatTheme.utilityAction)
                    .frame(width: 64, height: 64)
                    .background(SideSeatTheme.fillSubtle, in: Circle())
                    .accessibilityHidden(true)
                Text(AppLocalization.string("No new company right now"))
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.textPrimary)
                Text(count > 0
                    ? String(format: AppLocalization.string("%lld intentions are still finding company. New suggestions will appear here."), Int64(count))
                    : AppLocalization.string("Review your intentions to start or resume finding company."))
                    .font(.subheadline)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
            }
            .fixedSize(horizontal: false, vertical: true)

            VStack(spacing: SideSeatTheme.spaceXS) {
                if exploreEnabled {
                    SSPrimaryButton(title: AppLocalization.string("Find more recommendations"),
                        fill: .product, height: 48, accessibilityID: "together-find-more",
                        action: findMoreRecommendations)
                    SSSecondaryButton(title: AppLocalization.string("View my intentions"),
                        accessibilityID: "together-discovery-empty-action") {
                        sectionSelection.wrappedValue = .intentions
                    }
                } else {
                    SSPrimaryButton(title: AppLocalization.string("View my intentions"),
                        fill: .product, height: 48, accessibilityID: "together-discovery-empty-action") {
                        sectionSelection.wrappedValue = .intentions
                    }
                }
            }
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: 340)
        .padding(.vertical, SideSeatTheme.spaceXL)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("together-opportunities-empty")
    }

    private var showsInitialRecommendationEmptyState: Bool {
        displayedOpportunities.isEmpty && opportunityStore.issue == nil && !hasRequestedMoreRecommendations
    }

    private func findMoreRecommendations() {
        savedWhileBrowsingIDs.removeAll()
        hasRequestedMoreRecommendations = true
        Task { await loadExploration() }
    }

    private func opportunityCard(_ opportunity: NativeMutualOpportunity, inRecommendations: Bool = true) -> some View {
        MutualOpportunityCard(
            opportunity: opportunity,
            isWorking: opportunityStore.mutatingIDs.contains(opportunity.id),
            onBookmark: {
                Task {
                    if let updated = await opportunityStore.interact(opportunity.isBookmarked == true ? "UNBOOKMARK" : "BOOKMARK",
                        opportunity: opportunity, using: session) {
                        if updated.isBookmarked == true && inRecommendations {
                            bookmarkDidSave(updated)
                        }
                    }
                }
            },
            onMessage: { messageOpportunity = opportunity },
            onOpenConversation: {
                router.navigate(to: opportunity.conversationRoute)
            },
            onDismiss: inRecommendations ? { Task { await hideRecommendation(opportunity) } } : nil,
            onViewProfile: { profileOpportunity = opportunity },
            showsRecommendationContext: inRecommendations && store.intents.contains { $0.id == opportunity.viewerIntentId },
            compact: !inRecommendations
        )
    }

    private func hideRecommendation(_ opportunity: NativeMutualOpportunity) async {
        await commitPendingDismissal()
        hiddenRecommendationIDs.insert(opportunity.id)
        pendingDismissal = opportunity
        savedFeedbackID = nil
    }

    private func commitPendingDismissal() async {
        guard let opportunity = pendingDismissal else { return }
        pendingDismissal = nil
        if await opportunityStore.decide("NO", opportunity: opportunity, using: session) {
            await loadExploration()
        } else {
            hiddenRecommendationIDs.remove(opportunity.id)
        }
    }

    private func bookmarkDidSave(_ opportunity: NativeMutualOpportunity) {
        savedWhileBrowsingIDs.insert(opportunity.id)
        savedFeedbackID = UUID()
        UIAccessibility.post(notification: .announcement, argument: AppLocalization.string("Saved privately. Only you can see this."))
    }

    private func loadContent() async {
        async let exploration: Void = loadExploration()
        if v2Store.isWeeklyIntentEnabled {
            async let intents: Void = store.load(using: session)
            async let matching: Void = loadLegacyMatchingSession()
            async let opportunities: Void = refreshOpportunitiesAfterIntentChange()
            _ = await (intents, matching, opportunities)
        } else {
            await refreshOpportunitiesAfterIntentChange()
        }
        await exploration
        if !resolvedInitialSection, store.hasLoaded, store.issue == nil, opportunityStore.issue == nil {
            selectedSection = TogetherSection.initial(hasIntentions: !store.intents.isEmpty,
                hasOpportunities: !opportunityStore.opportunities.isEmpty || !exploreStore.intents.isEmpty,
                hasLegacySession: matchingSessionStore.session.isMatching(at: Date()))
            resolvedInitialSection = true
        }
    }

    private func loadExploration() async {
        if exploreEnabled && hasRequestedMoreRecommendations {
            await exploreStore.load(using: session, limit: ExploreAccessTier.current.resultLimit)
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
        store.intents.filter { $0.status == "ACTIVE" && ($0.expiresAt.map { $0 > Date() } ?? true) }
    }
}

struct MutualOpportunityCard: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @ScaledMetric(relativeTo: .subheadline) private var cueIconWidth: CGFloat = 24

    let opportunity: NativeMutualOpportunity
    let isWorking: Bool
    let onBookmark: () -> Void
    let onMessage: () -> Void
    let onOpenConversation: () -> Void
    var onDismiss: (() -> Void)? = nil
    var onViewProfile: (() -> Void)? = nil
    var showsRecommendationContext = false
    var showsActions = true
    var compact = false

    var body: some View {
        SSFlowCard(contentPadding: 0) {
            VStack(alignment: .leading, spacing: 0) {
                peerRow
                    .padding(.horizontal, SideSeatTheme.Together.cardPadding)
                    .padding(.top, SideSeatTheme.Together.cardPadding)
                    .padding(.bottom, compact ? SideSeatTheme.spaceSM : SideSeatTheme.spaceMD)
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("mutual-opportunity-peer-\(opportunity.id)")

                VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                    activityHeader
                    availabilityRow
                    peerDetails
                    if showsRecommendationContext {
                        RecommendationContextView(identifier: "mutual-opportunity-context-\(opportunity.id)",
                            facts: recommendationFacts,
                            profileTitle: AppLocalization.string(opportunity.peer.userId == nil ? "Intention details" : "View profile"),
                            profileIdentifier: "mutual-opportunity-profile-\(opportunity.id)", onProfile: onViewProfile)
                    } else if !compact, let onViewProfile {
                        Button(action: onViewProfile) {
                            Text(AppLocalization.string(opportunity.peer.userId == nil ? "Intention details" : "View profile"))
                                .font(.subheadline.weight(.medium))
                        }
                        .buttonStyle(SSActionButtonStyle(size: .compact)).foregroundStyle(SideSeatTheme.utilityAction)
                        .accessibilityIdentifier("mutual-opportunity-profile-\(opportunity.id)")
                    }
                    if opportunity.isExpired == true && opportunity.hasConversation {
                        Label(AppLocalization.string("Expired"), systemImage: "clock")
                            .font(.caption)
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    }
                    if showsActions {
                        decisionArea
                    }
                }
                .padding(.horizontal, SideSeatTheme.Together.cardPadding)
                .padding(.vertical, compact ? SideSeatTheme.spaceSM : SideSeatTheme.spaceMD)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("mutual-opportunity-\(opportunity.id)")
    }

    private var recommendationFacts: [String] {
        [opportunity.shortActivitySummary, opportunity.shortTimeSummary] + opportunity.shortContextDifferences
    }

    private var activityHeader: some View {
        cueRow(
            text: opportunity.peerActivityTitle,
            systemImage: opportunity.peerActivityTopic.systemImage,
            font: .title3.weight(.semibold),
            identifier: "mutual-opportunity-activity-\(opportunity.id)"
        )
    }

    private var peerRow: some View {
        HStack(alignment: .center, spacing: SideSeatTheme.spaceSM) {
            if compact, let onViewProfile {
                Button(action: onViewProfile) {
                    HStack(spacing: SideSeatTheme.spaceSM) {
                        peerIdentity
                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                            .accessibilityHidden(true)
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(SSPressButtonStyle())
                .accessibilityHint(AppLocalization.string(opportunity.peer.userId == nil ? "Intention details" : "View profile"))
                .accessibilityIdentifier("mutual-opportunity-profile-\(opportunity.id)")
            } else {
                peerIdentity
            }
            if let onDismiss, !opportunity.hasConversation, !opportunity.isUnavailable, opportunity.isBookmarked != true {
                RecommendationOptionsMenu(identifier: "mutual-opportunity-menu-\(opportunity.id)", onDismiss: onDismiss)
                    .disabled(isWorking)
            }
        }
    }

    private var peerIdentity: some View {
        HStack(alignment: .center, spacing: SideSeatTheme.spaceSM) {
            InitialAvatar(name: opportunity.peer.displayName, url: opportunity.peer.avatarUrl, size: 44)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                (dynamicTypeSize.isAccessibilitySize
                    ? AnyLayout(VStackLayout(alignment: .leading, spacing: 5))
                    : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: SideSeatTheme.spaceXS))) {
                    Text(opportunity.peer.displayName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 1)
                    HStack(spacing: 6) {
                        if opportunity.peer.isPlus == true { SSPlusBadge() }
                        if opportunity.peer.verifiedStudent {
                            Image(systemName: "checkmark.seal.fill")
                                .font(.caption)
                                .foregroundStyle(SideSeatTheme.verifiedSeal)
                                .accessibilityLabel(AppLocalization.string("Verified student"))
                                .accessibilityIdentifier("mutual-opportunity-verified-\(opportunity.id)")
                        }
                    }
                }

            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    @ViewBuilder
    private var contactButton: some View {
        if opportunity.isReadyToCoordinate || opportunity.messageRequest != nil {
            contactAction(title: AppLocalization.string("View chat"),
                identifier: "mutual-opportunity-open-\(opportunity.id)", opensConversation: true, action: onOpenConversation)
        } else if !opportunity.isUnavailable,
                  opportunity.messageRequest == nil || (opportunity.messageRequest?.isIncoming == true && opportunity.messageRequest?.status == "PENDING") {
            contactAction(title: AppLocalization.string(opportunity.messageRequest?.isIncoming == true ? "Reply" : "Say hello"),
                identifier: "mutual-opportunity-message-\(opportunity.id)", action: onMessage)
        }
    }

    private func contactAction(title: String, identifier: String, opensConversation: Bool = false, action: @escaping () -> Void) -> some View {
        SSIntentionContactButton(title: title, identifier: identifier, isDisabled: isWorking, action: action,
            opensConversation: opensConversation)
    }

    private var availabilityRow: some View {
        cueRow(
            text: opportunity.peerTimeSummary,
            systemImage: "clock",
            font: .subheadline,
            identifier: "mutual-opportunity-time-\(opportunity.id)"
        )
    }

    private var peerDetails: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            if let campus = opportunity.peer.campus, !campus.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                detailRow(campus, icon: "building.columns", identifier: "campus")
            }
            if let language = opportunity.peer.primaryLanguageTitle {
                detailRow(language, icon: "character.bubble", identifier: "language")
            }
            if let course = opportunity.peerIntention?.course, !course.title.isEmpty {
                detailRow(course.title, icon: "book.closed", identifier: "course")
            }
            if let description = opportunity.peerIntention?.descriptionPreview,
               !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text(description)
                    .font(.subheadline)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, SideSeatTheme.spaceXS)
                    .accessibilityIdentifier("mutual-opportunity-description-\(opportunity.id)")
            }
        }
    }

    private func detailRow(_ text: String, icon: String, identifier: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: SideSeatTheme.spaceSM) {
            Image(systemName: icon)
                .frame(width: cueIconWidth)
                .accessibilityHidden(true)
            Text(text)
                .fixedSize(horizontal: false, vertical: true)
        }
        .font(.footnote)
        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("mutual-opportunity-\(identifier)-\(opportunity.id)")
    }

    private func cueRow(text: String, systemImage: String,
                        font: Font, identifier: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: SideSeatTheme.spaceSM) {
            Image(systemName: systemImage)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .frame(width: cueIconWidth)
                .accessibilityHidden(true)
            Text(text)
                .font(font)
                .foregroundStyle(SideSeatTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(text)
        .accessibilityRespondsToUserInteraction(false)
        .accessibilityIdentifier(identifier)
    }

    private var decisionArea: some View {
        SSIntentionActionRow(
            isBookmarked: opportunity.isBookmarked == true,
            isDisabled: isWorking || (opportunity.isUnavailable && opportunity.isBookmarked != true),
            bookmarkIdentifier: "mutual-opportunity-bookmark-\(opportunity.id)", onBookmark: onBookmark
        ) {
            if opportunity.messageRequest != nil || opportunity.isReadyToCoordinate {
                contactButton
            } else if opportunity.isUnavailable {
                Text(AppLocalization.string(opportunity.isExpired == true ? "Expired" : "Intention unavailable")).font(.subheadline).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .frame(maxWidth: .infinity, minHeight: 48)
            } else {
                contactButton
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("mutual-opportunity-actions-\(opportunity.id)")
    }
}

/// The same sheet introduces a first contact and accepts it with a written reply.
struct OpportunityMessageComposer: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    let opportunity: NativeMutualOpportunity
    let onSend: (String) async -> NativeMutualOpportunity?
    let onConversation: (NativeMutualOpportunity) -> Void
    @State private var bodyText = ""
    @State private var isSending = false
    @State private var failed = false
    @State private var hasLoadedDraft = false
    @State private var didSend = false
    @FocusState private var isFocused: Bool

    private var messageDraftKey: String? {
        session.currentUser.map { "sideseat.together.draft.\($0.id).message.\(opportunity.id).\(isReply)" }
    }
    private var isReply: Bool { opportunity.messageRequest?.isIncoming == true }
    private var trimmedText: String { bodyText.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: SideSeatTheme.spaceSM) {
                        InitialAvatar(name: opportunity.peer.displayName, url: opportunity.peer.avatarUrl, size: 40)
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(spacing: 6) {
                                Text(opportunity.peer.displayName).font(.headline)
                                if opportunity.peer.isPlus == true { SSPlusBadge() }
                            }
                            Text(opportunity.messageActivityTitle).font(.subheadline)
                            Text(opportunity.messageTimeSummary).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    if isReply, let request = opportunity.messageRequest {
                        Text(request.body).textSelection(.enabled)
                    }
                }
                Section {
                    if !isReply {
                        VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                            Label(AppLocalization.string("You can send one message before they reply."), systemImage: "info.circle")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(SideSeatTheme.textPrimary)
                            Text(AppLocalization.string("Introduce yourself and what you'd like to do together. You can keep chatting once they reply."))
                                .font(.footnote)
                                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        }
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.vertical, SideSeatTheme.spaceXS)
                        .listRowBackground(SideSeatTheme.fillSubtle)
                        .accessibilityElement(children: .combine)
                        .accessibilityIdentifier("opportunity-message-limit-notice")
                    }
                    TextField(isReply ? "Write a reply…" : "Say hello and share what you have in mind…", text: $bodyText, axis: .vertical)
                        .lineLimit(4...8)
                        .focused($isFocused)
                        .accessibilityIdentifier("opportunity-message-body")
                    HStack {
                        Spacer()
                        Text("\(bodyText.count)/500").font(.caption).foregroundStyle(bodyText.count > 500 ? .red : .secondary)
                    }
                } footer: {
                    Text(isReply ? "Replying opens a chat with this person." : "Your message includes this intention.")
                }
                if failed {
                    Text("Message could not be sent. Your text is saved here; try again.")
                        .foregroundStyle(SideSeatTheme.danger)
                        .accessibilityIdentifier("opportunity-message-error")
                }
            }
            .navigationTitle(isReply ? AppLocalization.string("Reply") : AppLocalization.string("Send message"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", systemImage: "xmark") { dismiss() }.ssToolbarAction().disabled(isSending)
                }.ssStandaloneAction()
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        isSending = true
                        failed = false
                        Task {
                            let result = await onSend(trimmedText)
                            isSending = false
                            if let result {
                                didSend = true
                                TogetherDraftStorage.remove(messageDraftKey)
                                dismiss()
                                onConversation(result)
                            } else { failed = true }
                        }
                    } label: {
                        if isSending { ProgressView() } else { Text("Send") }
                    }
                    .disabled(isSending || trimmedText.isEmpty || bodyText.count > 500)
                    .accessibilityIdentifier("opportunity-message-submit")
                }
            }
            .interactiveDismissDisabled(isSending)
        }
        .task {
            if !hasLoadedDraft {
                bodyText = TogetherDraftStorage.read(String.self, key: messageDraftKey) ?? ""
                hasLoadedDraft = true
            }
        }
        .onChange(of: bodyText) { _, text in
            guard hasLoadedDraft, !didSend else { return }
            if text.isEmpty { TogetherDraftStorage.remove(messageDraftKey) }
            else { TogetherDraftStorage.write(text, key: messageDraftKey) }
        }
        .onDisappear {
            if hasLoadedDraft && !didSend {
                if bodyText.isEmpty { TogetherDraftStorage.remove(messageDraftKey) }
                else { TogetherDraftStorage.write(bodyText, key: messageDraftKey) }
            }
        }

    }
}

private struct IntentionShareLink: Decodable { let url: URL }

private struct WeeklyIntentCard: View {
    @Environment(SessionStore.self) private var session
    @State private var sharePayload: SSSharePayload?
    @State private var preparingShare = false
    @State private var shareIssue: String?

    @State private var confirmsDelete = false
    @State private var showsAllTimes = false
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let intent: NativeWeeklyIntent
    let status: TogetherIntentStatus
    let isWorking: Bool
    let onEdit: () -> Void
    var onTogglePause: (() -> Void)? = nil
    let onDelete: () -> Void
    var onRepeat: (() -> Void)? = nil

    private var isTerminal: Bool { status == .ended || status == .expired }

    var body: some View {
        cardContent
        .contentShape(RoundedRectangle(cornerRadius: SideSeatTheme.Together.cardRadius))
        .onTapGesture {
            if !isTerminal { onEdit() }
        }
        .tint(SideSeatTheme.utilityAction)
        .disabled(isWorking)
        .ssActionPrompt(
            isPresented: $confirmsDelete,
            title: AppLocalization.string("Delete this intention?"),
            message: AppLocalization.string("This intention will stop finding company. Existing conversations and confirmed plans stay unchanged."),
            systemImage: "trash.fill",
            tint: SideSeatTheme.danger,
            accessibilityIdentifier: "weekly-intent-delete-prompt-\(intent.id)"
        ) {
            [
                SSActionPromptAction(id: "weekly-intent-delete-cancel-\(intent.id)", title: AppLocalization.string("Cancel"), role: .cancel) {},
                SSActionPromptAction(id: "weekly-intent-delete-confirm-\(intent.id)", title: AppLocalization.string("Delete"), systemImage: "trash.fill", role: .destructive, perform: onDelete),
            ]
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("weekly-intent-\(intent.id)")
        .sheet(item: $sharePayload) { SSActivityView(items: $0.items) }
        .ssActionPrompt(
            isPresented: Binding(get: { shareIssue != nil }, set: { if !$0 { shareIssue = nil } }),
            title: AppLocalization.string("Share intention"),
            message: shareIssue,
            systemImage: "exclamationmark.triangle.fill",
            tint: SideSeatTheme.danger,
            onDismiss: { shareIssue = nil },
            accessibilityIdentifier: "weekly-intent-share-error-prompt-\(intent.id)"
        ) {
            [
                SSActionPromptAction(id: "weekly-intent-share-error-ok-\(intent.id)", title: AppLocalization.string("OK"), role: .cancel) { shareIssue = nil },
            ]
        }
    }

    private func shareIntention() async {
        preparingShare = true
        defer { preparingShare = false }
        do {
            let response: APIEnvelope<IntentionShareLink> = try await session.sendAuthorized(
                "api/v1/me/weekly-intents/\(intent.id)/share", method: .post
            )
            sharePayload = SSSharePayload(items: [response.data.url])
        } catch { shareIssue = error.localizedDescription }
    }

    private var cardContent: some View {
        SSFlowCard(contentPadding: 0, contentSpacing: 0) {
            HStack(alignment: .top, spacing: SideSeatTheme.spaceSM) {
                if isTerminal {
                    cardHeader
                } else {
                    Button(action: onEdit) { cardHeader }
                        .buttonStyle(.plain)
                        .accessibilityHint(AppLocalization.string("Edit intention"))
                        .accessibilityIdentifier("weekly-intent-edit-\(intent.id)")
                    Menu {
                        Button(action: onEdit) {
                            Label(AppLocalization.string("Edit"), systemImage: "pencil")
                        }
                        .accessibilityIdentifier("weekly-intent-menu-edit-\(intent.id)")
                        Button(role: .destructive) { confirmsDelete = true } label: {
                            Label(AppLocalization.string("Delete"), systemImage: "trash")
                        }
                        .accessibilityIdentifier("weekly-intent-delete-\(intent.id)")
                    } label: {
                        Image(systemName: "ellipsis")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(SSActionButtonStyle(horizontalPadding: 0, size: .icon))
                    .accessibilityLabel(AppLocalization.string("More"))
                    .accessibilityIdentifier("weekly-intent-menu-\(intent.id)")
                }
            }
            .padding(.horizontal, SideSeatTheme.Together.cardPadding)
            .padding(.top, SideSeatTheme.Together.cardPadding)

            details
                .padding(.horizontal, SideSeatTheme.Together.cardPadding)
                .padding(.top, SideSeatTheme.spaceMD)
                .padding(.bottom, isTerminal && onRepeat == nil ? SideSeatTheme.Together.cardPadding : 0)

            if onRepeat != nil || !isTerminal {
                Divider()
                    .overlay(SideSeatTheme.separator)
                    .padding(.top, SideSeatTheme.spaceMD)
                    .padding(.horizontal, SideSeatTheme.Together.cardPadding)
                actions
                    .padding(.horizontal, SideSeatTheme.Together.cardPadding)
                    .padding(.vertical, SideSeatTheme.spaceSM)
            }
        }
    }

    private var cardHeader: some View {
        SSFlowCardHeader(
            title: intent.activityTitle,
            subtitle: intent.topic == .study ? intent.effectiveTogetherMode.studyTitle : intent.topic.title,
            systemImage: intent.topic.systemImage,
            tint: SideSeatTheme.Together.categoryInk(for: intent.topic),
            activityTopic: intent.topic
        )
        .accessibilityIdentifier("weekly-intent-header-\(intent.id)")
    }

    private var details: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            statusBadge

            VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                if let timing = intent.timePreference, timing.kind != "EXACT" {
                    timeLabel(timing.summary)
                } else {
                    let windows = (isTerminal ? intent.timeWindows : intent.relevantTimeWindows())
                        .sorted { $0.startAt < $1.startAt }
                    if windows.isEmpty { timeLabel(AppLocalization.string("Time to discuss")) }
                    ForEach(Array(windows.prefix(showsAllTimes ? windows.count : 2).enumerated()), id: \.offset) { index, window in
                        timeLabel(windowSummary(window))
                            .accessibilityIdentifier("weekly-intent-time-\(intent.id)-\(index)")
                    }
                    if windows.count > 2 {
                        Button {
                            showsAllTimes.toggle()
                        } label: {
                            HStack(spacing: SideSeatTheme.spaceXS) {
                                Text(showsAllTimes ? AppLocalization.string("Show fewer times")
                                    : String(format: AppLocalization.string("Show %lld more times"), Int64(windows.count - 2)))
                                Image(systemName: showsAllTimes ? "chevron.up" : "chevron.down")
                                    .font(.caption.weight(.semibold))
                            }
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(SideSeatTheme.utilityAction)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(minHeight: 44, alignment: .leading)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(SSPressButtonStyle())
                        .accessibilityValue(AppLocalization.string(showsAllTimes ? "Expanded" : "Collapsed"))
                        .accessibilityIdentifier("weekly-intent-times-toggle-\(intent.id)")
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
            .accessibilityElement(children: .contain)
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
        }
    }

    private var actions: some View {
        (dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SideSeatTheme.spaceXS))
            : AnyLayout(HStackLayout(spacing: SideSeatTheme.spaceSM))) {
            if !isTerminal, intent.status == "ACTIVE" {
                Button {
                    Task { await shareIntention() }
                } label: {
                    HStack(spacing: SideSeatTheme.spaceXS) {
                        if preparingShare { ProgressView() }
                        else { Image(systemName: "square.and.arrow.up") }
                        Text(AppLocalization.string("Share"))
                    }
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(SideSeatTheme.utilityAction)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(SSPressButtonStyle())
                .disabled(preparingShare)
                .accessibilityLabel(AppLocalization.string("Share intention"))
                .accessibilityIdentifier("weekly-intent-share-\(intent.id)")
            }
            if !dynamicTypeSize.isAccessibilitySize { Spacer(minLength: 0) }
            if let onTogglePause, !isTerminal {
                Button(action: onTogglePause) {
                    Label(AppLocalization.string(intent.isPaused ? "Resume intention" : "Pause intention"),
                          systemImage: intent.isPaused ? "play.fill" : "pause.fill")
                        .font(.subheadline.weight(intent.isPaused ? .semibold : .medium))
                        .foregroundStyle(intent.isPaused ? SideSeatTheme.ProductAction.foreground : SideSeatTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, SideSeatTheme.spaceMD)
                        .padding(.vertical, SideSeatTheme.spaceSM)
                        .frame(minHeight: 44)
                        .background(intent.isPaused ? SideSeatTheme.ProductAction.fill : SideSeatTheme.fillTertiary, in: Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(SSPressButtonStyle())
                .frame(maxWidth: dynamicTypeSize.isAccessibilitySize ? .infinity : nil, alignment: .trailing)
                .accessibilityIdentifier("weekly-intent-toggle-pause-\(intent.id)")
            }
            if let onRepeat {
                Button(action: onRepeat) {
                    Label(AppLocalization.string("Plan again"), systemImage: "arrow.clockwise")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.utilityAction)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, SideSeatTheme.spaceMD)
                        .padding(.vertical, SideSeatTheme.spaceSM)
                        .frame(minHeight: 44)
                        .background(SideSeatTheme.fillTertiary, in: Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(SSPressButtonStyle())
                .frame(maxWidth: dynamicTypeSize.isAccessibilitySize ? .infinity : nil, alignment: .trailing)
                .accessibilityIdentifier("weekly-intent-repeat-\(intent.id)")
            }
        }
    }

    private var statusBadge: some View {
        Label(status.title, systemImage: status.symbol)
            .font(.caption.weight(.semibold))
            .foregroundStyle(status == .finding ? SideSeatTheme.statusSuccessText : SideSeatTheme.textSecondaryStrong)
            .padding(.horizontal, SideSeatTheme.spaceSM)
            .padding(.vertical, SideSeatTheme.spaceXS)
            .background(status == .finding ? SideSeatTheme.statusSuccessText.opacity(0.08) : SideSeatTheme.fillTertiary,
                        in: Capsule())
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("weekly-intent-status-\(intent.id)")
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

private struct WeeklyIntentWindowDraft: Identifiable, Codable, Equatable {
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
    let accessibilityIdentifier: String

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
        picker.accessibilityIdentifier = accessibilityIdentifier
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

private struct WeeklyIntentEditorView: View {
    @Environment(SessionStore.self) private var session
    @Environment(ClientConfigurationStore.self) private var clientConfiguration
    @Environment(\.dismiss) private var dismiss
    @State private var topic: NativeWeeklyIntentTopic
    @State private var hasChosenTopic: Bool
    @State private var activityText: String
    @State private var timeWindows: [WeeklyIntentWindowDraft]
    @State private var preservedTimePreference: NativeIntentTimePreference?
    @State private var timeIsUndecided: Bool
    @State private var exploreVisible: Bool
    @State private var note: String
    @State private var hasLoadedDraft = false
    @State private var didSave = false
    @State private var restoredDraft = false
    @State private var initialDraftSnapshot: WeeklyIntentEditorDraft?
    @State private var isSaving = false
    @State private var showingTimePicker = false
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @FocusState private var focusedInput: InputField?

    private enum InputField: Hashable {
        case activity
    }

    let intent: NativeWeeklyIntent?
    let template: NativeWeeklyIntent?
    let rebookingPlan: NativePlanRequest?
    let completedPlanDraft: CompletedPlanIntentDraft?
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
        template: NativeWeeklyIntent? = nil,
        rebookingPlan: NativePlanRequest? = nil,
        completedPlanDraft: CompletedPlanIntentDraft? = nil,
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
        self.template = template
        self.rebookingPlan = rebookingPlan
        self.completedPlanDraft = completedPlanDraft
        self.saveIssue = saveIssue
        self.onSave = onSave
        let proposed: [NativeWeeklyIntentTimeWindow]
        if let rebookingPlan, let start = rebookingPlan.startDate, let end = rebookingPlan.endDate, start > Date() {
            proposed = [.init(startAt: start, endAt: end)]
        } else if let template {
            proposed = NativeWeeklyIntentTimeRules.repeatedWindows(from: template.timeWindows)
        } else { proposed = Self.defaultWindows(intent: intent) }
        let source = intent ?? template
        _topic = State(initialValue: completedPlanDraft?.topic ?? source?.topic ?? (rebookingPlan.map { ["MEAL": NativeWeeklyIntentTopic.food, "STUDY": .study, "LANGUAGE": .study, "SPORTS": .sports][$0.planType] ?? .events } ?? .coffee))
        _hasChosenTopic = State(initialValue: completedPlanDraft == nil || completedPlanDraft?.topic != nil)
        _exploreVisible = State(initialValue: intent == nil || intent?.exploreVisible == true)
        _note = State(initialValue: source?.note ?? "")
        let initialActivity: String
        switch source?.topic {
        case .study: initialActivity = source?.studyGoal ?? source?.activityText ?? ""
        case .sports: initialActivity = NativeSportInput.displayText(tag: source?.sportTag, otherNote: source?.sportOtherNote)
        default: initialActivity = source?.activityText ?? ""
        }
        _activityText = State(initialValue: completedPlanDraft?.title ?? rebookingPlan?.title ?? initialActivity)
        _timeWindows = State(
            initialValue: proposed.map {
                WeeklyIntentWindowDraft(startAt: $0.startAt, endAt: $0.endAt)
            }
        )
        let initialTimingKind = template != nil ? "EXACT" : intent?.timePreference?.kind ?? (intent == nil ? "UNDECIDED" : "EXACT")
        _timeIsUndecided = State(initialValue: rebookingPlan == nil && initialTimingKind == "UNDECIDED")
        // Retain an existing date range until the user explicitly changes the time choice.
        _preservedTimePreference = State(initialValue: initialTimingKind == "FLEXIBLE" ? intent?.timePreference : nil)
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollViewReader { scroll in
                    Form {
                        activityFields
                        if restoredDraft {
                            Text("Draft restored on this device")
                                .font(.footnote).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                                .accessibilityIdentifier("intent-editor-draft-restored")
                        }
                        if completedPlanDraft != nil {
                            Text("Publish a new intention to find company. Choose a new time or leave it undecided.")
                                .font(.footnote).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        }
                        if !((intent ?? template)?.note ?? "").isEmpty {
                            Section("Description") {
                                TextField(AppLocalization.string("Description"), text: $note, axis: .vertical)
                                    .accessibilityIdentifier("intent-editor-note")
                            }
                        }
                        timeFields
                        if rebookingPlan != nil {
                            Text("Review the time before publishing. This creates a new intention without changing your previous plan.")
                                .font(.footnote).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        }
                        if template != nil {
                            Section {
                                Text(timeIsUndecided
                                    ? "This publishes a new intention; previous conversations stay with the original."
                                    : "Next week's time is prefilled. You can adjust it before publishing; previous conversations stay with the original.")
                                    .font(.footnote)
                                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                            }
                        }
                        if intent != nil && intent?.exploreVisible != true {
                            Section {
                                Toggle("Show in recommendations", isOn: $exploreVisible)
                                    .accessibilityIdentifier("intent-editor-visibility")
                            } footer: {
                                Text("This older intention was not public. Turn this on to include it in more recommendations.")
                            }
                        } else if intent == nil {
                            Section {
                                Text("Your activity, time and description will appear in recommendations.")
                                    .font(.footnote)
                                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                            }
                        }
                    }
                    .scrollContentBackground(.hidden)
                    .contentMargins(.top, SideSeatTheme.spaceLG, for: .scrollContent)
                    .listSectionSpacing(SideSeatTheme.spaceXL)
                    .scrollDismissesKeyboard(.immediately)
                    .accessibilityIdentifier("intent-editor-fields")
                    .disabled(isSaving)
                    .onChange(of: focusedInput) { _, field in
                        if let field { scroll.scrollTo(field, anchor: .center) }
                    }
                    .onChange(of: inputLengthIssue) { _, _ in
                        if let focusedInput { scroll.scrollTo(focusedInput, anchor: .center) }
                    }
                    .onGeometryChange(for: CGFloat.self, of: { $0.size.height }) { _ in
                        if let focusedInput { scroll.scrollTo(focusedInput, anchor: .center) }
                    }
                }
                VStack(spacing: 0) {
                    if let issue = inputLengthIssue ?? saveIssue {
                        Text(issue)
                            .font(.footnote)
                            .foregroundStyle(SideSeatTheme.danger)
                            .padding(.horizontal, SideSeatTheme.screenHorizontal)
                            .padding(.top, SideSeatTheme.spaceSM)
                            .padding(.bottom, focusedInput == nil ? 0 : SideSeatTheme.spaceSM)
                            .accessibilityIdentifier("intent-editor-issue")
                    }
                    if focusedInput == nil {
                        SSFlowActionDock(
                            title: editorActionTitle,
                            detail: "",
                            isLoading: isSaving,
                            isEnabled: hasValidDetails && hasValidTimeWindows,
                            accessibilityID: "intent-editor-save"
                        ) {
                            Task { await save() }
                        }
                    }
                }
                .frame(maxWidth: .infinity)
                .background(focusedInput == nil ? SideSeatTheme.surface : SideSeatTheme.bgGrouped)
            }
            .background(SideSeatTheme.bgGrouped)
            .navigationTitle(AppLocalization.string(template != nil ? "Plan again" : intent == nil ? "Add an intention" : "Edit intention"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", systemImage: "xmark") { dismiss() }.ssToolbarAction()
                        .disabled(isSaving)
                }.ssStandaloneAction()
                if focusedInput != nil {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(editorActionTitle) {
                            Task { await save() }
                        }
                        .disabled(isSaving || !hasValidDetails || !hasValidTimeWindows)
                        .accessibilityIdentifier("intent-editor-save")
                    }
                }
            }
        }
        .ssFlowSheet(isSaving: isSaving)
        .task {
            guard !hasLoadedDraft else { return }
            initialDraftSnapshot = draftSnapshot
            if let draft = TogetherDraftStorage.read(WeeklyIntentEditorDraft.self, key: intentionDraftKey) {
                topic = draft.topic; hasChosenTopic = draft.hasChosenTopic; activityText = draft.activityText
                timeWindows = draft.timeWindows; preservedTimePreference = draft.timePreference
                timeIsUndecided = draft.timeIsUndecided; exploreVisible = draft.exploreVisible; note = draft.note
                restoredDraft = true
            }
            hasLoadedDraft = true
        }
        .onChange(of: draftSnapshot) { _, _ in persistIntentionDraft() }
        .onDisappear { persistIntentionDraft() }
        .accessibilityIdentifier("intent-editor")
        .sheet(isPresented: $showingTimePicker) {
            WeeklyIntentTimePickerSheet(
                windows: timeWindows,
                timePreference: effectiveTimingKind == "FLEXIBLE" ? preservedTimePreference : nil,
                allowsUndecided: supportsFlexibleTiming && rebookingPlan == nil,
                onSave: { windows, preference in
                    timeWindows = windows
                    preservedTimePreference = preference
                    timeIsUndecided = false
                },
                onClear: {
                    preservedTimePreference = nil
                    timeIsUndecided = true
                }
            )
            .dynamicTypeSize(dynamicTypeSize)
        }
    }

    private var automaticMatchingEnabled: Bool {
        clientConfiguration.configuration?.isFeatureEnabled("v2AutomaticMatching") == true &&
            ActionToPlanV2Store.shared.isMutualOpportunityEnabled
    }

    private var editorActionTitle: String {
        let useShortTitle = focusedInput != nil || dynamicTypeSize.isAccessibilitySize
        if template != nil { return AppLocalization.string("Publish new intention") }
        if completedPlanDraft != nil {
            return AppLocalization.string(useShortTitle ? "Publish intention (short)" : "Publish new intention")
        }
        if automaticMatchingEnabled, intent?.isPaused != true {
            if intent?.automaticMatching == true {
                return AppLocalization.string(useShortTitle ? "Save" : "Save changes")
            }
            return AppLocalization.string(useShortTitle ? "Publish intention (short)" : "Publish intention")
        }
        return AppLocalization.string(useShortTitle ? "Save" : "Save intention")
    }

    private var activityFields: some View {
        Group {
            Section {
                if !hasChosenTopic {
                    Text("Choose an activity")
                        .font(.subheadline.weight(.medium))
                        .accessibilityIdentifier("intent-topic-required")
                }
                let columns = dynamicTypeSize.isAccessibilitySize ? 1 : 3
                Grid(horizontalSpacing: SideSeatTheme.spaceSM, verticalSpacing: SideSeatTheme.spaceSM) {
                    ForEach(0..<(NativeWeeklyIntentTopic.allCases.count / columns), id: \.self) { row in
                        GridRow {
                            ForEach(0..<columns, id: \.self) { column in
                                let option = NativeWeeklyIntentTopic.allCases[row * columns + column]
                                SSActivityChoice(topic: option, isSelected: hasChosenTopic && topic == option) {
                                    focusedInput = nil
                                    topic = option
                                    hasChosenTopic = true
                                }
                                .accessibilityIdentifier("intent-topic-\(option.rawValue.lowercased())")
                            }
                        }
                    }
                }
                .accessibilityElement(children: .contain)
                .accessibilityLabel(AppLocalization.string("Activity"))
                .accessibilityValue(hasChosenTopic ? topic.title : AppLocalization.string("Choose an activity"))
                .accessibilityIdentifier("intent-editor-topic")
                .listRowInsets(EdgeInsets(top: SideSeatTheme.spaceMD, leading: SideSeatTheme.spaceMD,
                                         bottom: SideSeatTheme.spaceMD, trailing: SideSeatTheme.spaceMD))
                .listRowSeparator(.hidden)
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceLG) {
                    Divider()
                    TextField("Activity details (optional)", text: $activityText,
                        prompt: Text(AppLocalization.string(dynamicTypeSize.isAccessibilitySize ? "Optional" : "Describe what you'd like to do…")),
                        axis: .vertical)
                        .lineLimit(1...3)
                        .frame(minHeight: 64, alignment: .topLeading)
                        .textInputAutocapitalization(.sentences)
                        .focused($focusedInput, equals: .activity)
                        .accessibilityIdentifier("intent-editor-activity")
                }
                .id(InputField.activity)
                .listRowInsets(EdgeInsets(top: 0, leading: SideSeatTheme.spaceLG,
                                         bottom: SideSeatTheme.spaceLG, trailing: SideSeatTheme.spaceLG))
                .listRowSeparator(.hidden)
            }
        }
    }

    private var timeFields: some View {
        Section {
            Button {
                focusedInput = nil
                showingTimePicker = true
            } label: {
                timeRowLayout {
                    HStack(spacing: SideSeatTheme.spaceSM) {
                        Text("Time")
                            .foregroundStyle(SideSeatTheme.textPrimary)
                        if effectiveTimingKind == "EXACT", timeWindows.count > 1 {
                            Text("\(timeWindows.count) time options")
                                .font(.subheadline)
                                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        }
                    }
                    if !dynamicTypeSize.isAccessibilitySize { Spacer(minLength: SideSeatTheme.spaceMD) }
                    HStack(spacing: SideSeatTheme.spaceXS) {
                        if effectiveTimingKind == "UNDECIDED" {
                            Text("Time undecided · Tap to set")
                                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        } else {
                            Text("Modify times")
                                .foregroundStyle(SideSeatTheme.utilityAction)
                        }
                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                            .accessibilityHidden(true)
                    }
                    .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(SSActionButtonStyle(horizontalPadding: 0))
            .accessibilityIdentifier("intent-timing-choose")
            .listRowInsets(EdgeInsets(top: SideSeatTheme.spaceXS, leading: SideSeatTheme.spaceMD,
                                     bottom: SideSeatTheme.spaceXS, trailing: SideSeatTheme.spaceMD))
            .listRowSeparator(.hidden)

            if let preference = preservedTimePreference, effectiveTimingKind == "FLEXIBLE" {
                Text(preference.summary)
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
            } else if effectiveTimingKind == "EXACT" {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                    ForEach(timeWindows.sorted { $0.startAt < $1.startAt }) { window in
                        selectedTimeRow(window)
                    }
                }
                .listRowInsets(EdgeInsets(top: 0, leading: SideSeatTheme.spaceMD,
                                         bottom: SideSeatTheme.spaceMD, trailing: SideSeatTheme.spaceMD))
                .listRowSeparator(.hidden)
            }
        }
    }

    private func selectedTimeRow(_ window: WeeklyIntentWindowDraft) -> some View {
        let date = window.startAt.formatted(.dateTime.month(.abbreviated).day().weekday(.abbreviated)
            .locale(AppLocalization.selectedLanguage.locale))
        return ViewThatFits(in: .horizontal) {
            if !dynamicTypeSize.isAccessibilitySize {
                HStack(spacing: SideSeatTheme.spaceMD) {
                    Text(date).fixedSize()
                    Spacer(minLength: 0)
                    Text(timeRange(for: window))
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .fixedSize()
                }
            }
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                Text(date)
                Text(timeRange(for: window))
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
            }
            .fixedSize(horizontal: false, vertical: true)
        }
        .font(.subheadline)
        .foregroundStyle(SideSeatTheme.textPrimary)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("intent-selected-time-\(window.id)")
    }

    private func timeRange(for window: WeeklyIntentWindowDraft) -> String {
        let locale = AppLocalization.selectedLanguage.locale
        let start = window.startAt.formatted(.dateTime.hour().minute().locale(locale))
        let end = Calendar.current.isDate(window.startAt, inSameDayAs: window.endAt)
            ? window.endAt.formatted(.dateTime.hour().minute().locale(locale))
            : window.endAt.formatted(.dateTime.month(.abbreviated).day().hour().minute().locale(locale))
        return "\(start)–\(end)"
    }

    private var supportsFlexibleTiming: Bool {
        clientConfiguration.configuration?.isFeatureEnabled("v2FlexibleTiming") == true || intent?.timePreference != nil
    }

    private var effectiveTimingKind: String {
        guard supportsFlexibleTiming else { return "EXACT" }
        return timeIsUndecided ? "UNDECIDED" : preservedTimePreference?.kind ?? "EXACT"
    }

    private var submittedTiming: NativeIntentTimePreference? {
        guard supportsFlexibleTiming else { return nil }
        return timeIsUndecided ? NativeIntentTimePreference(kind: "UNDECIDED")
            : preservedTimePreference ?? NativeIntentTimePreference(kind: "EXACT")
    }

    private var timeRowLayout: AnyLayout {
        dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SideSeatTheme.spaceSM))
            : AnyLayout(HStackLayout(spacing: SideSeatTheme.spaceSM))
    }

    private var hasValidDetails: Bool { hasChosenTopic && inputLengthIssue == nil }

    private var inputLengthIssue: String? {
        if NativeWeeklyIntentSubmissionRules.normalizedTextLength(note) > 160 {
            return AppLocalization.string("Use up to 160 characters.")
        }
        let limit = topic == .sports ? 60 : 80
        guard NativeWeeklyIntentSubmissionRules.normalizedTextLength(activityText) > limit else { return nil }
        return AppLocalization.string(topic == .sports ? "Use up to 60 characters." : "Use up to 80 characters.")
    }

    private func save() async {
        guard hasValidDetails, hasValidTimeWindows, !isSaving else { return }
        focusedInput = nil
        isSaving = true
        defer { isSaving = false }
        let sportSelection = NativeSportInput.normalized(activityText)
        // The editor shares one description; the existing API still uses topic-specific fields.
        let saved = await onSave(
            topic, activityText, sportSelection.tag, sportSelection.otherNote ?? "",
            (intent ?? template)?.effectiveTogetherMode ?? .sameActivity, activityText, intent?.courseId,
            normalizedTimeWindows, submittedTiming, exploreVisible, note
        )
        if saved { didSave = true; TogetherDraftStorage.remove(intentionDraftKey) }
    }

    private func persistIntentionDraft() {
        guard hasLoadedDraft, !didSave else { return }
        if restoredDraft || draftSnapshot != initialDraftSnapshot { TogetherDraftStorage.write(draftSnapshot, key: intentionDraftKey) }
        else { TogetherDraftStorage.remove(intentionDraftKey) }
    }

    private var intentionDraftKey: String? {
        guard let userID = session.currentUser?.id else { return nil }
        let context: String
        if let intent { context = "edit.\(intent.id).v\(intent.version)" }
        else if let template { context = "repeat.\(template.id).v\(template.version)" }
        else if let rebookingPlan { context = "plan.\(rebookingPlan.id)" }
        else if let completedPlanDraft { context = "completed.\(completedPlanDraft.sourcePlanID)" }
        else { context = "new" }
        return "sideseat.together.draft.\(userID).intention.\(context)"
    }
    private var draftSnapshot: WeeklyIntentEditorDraft {
        WeeklyIntentEditorDraft(topic: topic, hasChosenTopic: hasChosenTopic, activityText: activityText,
            timeWindows: timeWindows, timePreference: preservedTimePreference, timeIsUndecided: timeIsUndecided,
            exploreVisible: exploreVisible, note: note)
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
        if effectiveTimingKind == "UNDECIDED" { return rebookingPlan == nil }
        if let preservedTimePreference, effectiveTimingKind == "FLEXIBLE" {
            guard let start = NativeIntentTimePreference.date(preservedTimePreference.startDate),
                  let end = NativeIntentTimePreference.date(preservedTimePreference.endDate) else { return false }
            return start <= end && start >= Calendar.current.startOfDay(for: Date())
        }
        return NativeWeeklyIntentTimeRules.hasValidExactWindows(normalizedTimeWindows)
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
        return [NativeWeeklyIntentTimeRules.defaultWindow(startingAt: Date())]
    }
}

/// Owns a temporary copy: dismissing the sheet never changes the intention form.
private struct WeeklyIntentTimePickerSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var timeWindows: [WeeklyIntentWindowDraft]
    @State private var preservedTimePreference: NativeIntentTimePreference?
    let allowsUndecided: Bool
    let onSave: ([WeeklyIntentWindowDraft], NativeIntentTimePreference?) -> Void
    let onClear: () -> Void

    init(windows: [WeeklyIntentWindowDraft], timePreference: NativeIntentTimePreference?,
         allowsUndecided: Bool,
         onSave: @escaping ([WeeklyIntentWindowDraft], NativeIntentTimePreference?) -> Void,
         onClear: @escaping () -> Void) {
        _timeWindows = State(initialValue: windows)
        _preservedTimePreference = State(initialValue: timePreference)
        self.allowsUndecided = allowsUndecided
        self.onSave = onSave
        self.onClear = onClear
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if let preference = preservedTimePreference {
                        Text(preference.summary)
                        Button("Choose a time") { preservedTimePreference = nil }
                            .accessibilityIdentifier("intent-time-replace-range")
                    } else {
                        exactTimeFields
                    }
                }
                if allowsUndecided {
                    Section {
                        Button("Not sure yet") {
                            onClear()
                            dismiss()
                        }
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .accessibilityIdentifier("intent-time-clear")
                    } footer: {
                        Text("Confirm the time together after matching.")
                    }
                }
            }
            .accessibilityIdentifier("intent-time-picker-fields")
            .scrollContentBackground(.hidden)
            .background(SideSeatTheme.bgGrouped)
            .navigationTitle(AppLocalization.string(dynamicTypeSize.isAccessibilitySize ? "Time" : "Choose a time"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", systemImage: "xmark") { dismiss() }.ssToolbarAction()
                        .accessibilityIdentifier("intent-time-picker-cancel")
                }.ssStandaloneAction()
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done", systemImage: "checkmark") {
                        onSave(timeWindows, preservedTimePreference)
                        dismiss()
                    }.ssToolbarAction()
                    .disabled(!hasValidTimeWindows)
                    .accessibilityIdentifier("intent-time-picker-done")
                }.ssStandaloneAction()
            }
        }
        .environment(\.locale, AppLocalization.selectedLanguage.locale)
        .ssFlowSheet()
    }

    private var hasValidTimeWindows: Bool {
        if let preference = preservedTimePreference {
            guard let start = NativeIntentTimePreference.date(preference.startDate),
                  let end = NativeIntentTimePreference.date(preference.endDate) else { return false }
            return start <= end && start >= Calendar.current.startOfDay(for: Date())
        }
        return NativeWeeklyIntentTimeRules.hasValidExactWindows(timeWindows.map(\.value))
    }

    private var exactTimeFields: some View {
        Group {
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
                            accessibilityLabel: AppLocalization.string("Start"),
                            accessibilityIdentifier: "intent-time-start-\(window.id)"
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
                                    window.endAt = min(max(end, minimumEnd), latestSelectableDate)
                                }
                            ),
                            range:
                                NativeWeeklyIntentTimeRules
                                .minimumEnd(after: window.startAt)...latestSelectableDate,
                            accessibilityLabel: AppLocalization.string("End"),
                            accessibilityIdentifier: "intent-time-end-\(window.id)"
                        )
                        .frame(minHeight: 44)
                        .layoutPriority(1)
                    }
                    if timeWindows.count > 1 {
                        Button("Remove time", systemImage: "minus.circle", role: .destructive) {
                            timeWindows.removeAll { $0.id == window.id }
                        }
                        .accessibilityIdentifier("intent-time-remove-\(window.id)")
                    }
                }
            }
            Button("Add another time", systemImage: "plus.circle") {
                addTimeWindow()
            }
            .accessibilityIdentifier("intent-time-add")
            .disabled(nextTimeWindow == nil || timeWindows.count >= 7)

            if !hasValidTimeWindows {
                Text("Choose future, non-overlapping times of 30 minutes to 12 hours.")
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.danger)
            }
        }
    }

    private var timeRowLayout: AnyLayout {
        dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SideSeatTheme.spaceSM))
            : AnyLayout(HStackLayout(spacing: SideSeatTheme.spaceSM))
    }

    // UIKit requires a picker bound; this is never stored as an intention deadline.
    private var latestSelectableDate: Date { .distantFuture }

    private var pickerUpperBound: Date {
        let latestStart = latestSelectableDate.addingTimeInterval(-NativeWeeklyIntentTimeRules.minimumDuration)
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

    private var nextTimeWindow: NativeWeeklyIntentTimeWindow? {
        guard timeWindows.count < 7 else { return nil }
        let latestEnd = timeWindows.map(\.endAt).max() ?? Date()
        let window = NativeWeeklyIntentTimeRules.defaultWindow(
            startingAt: max(Date(), latestEnd)
        )
        guard window.endAt <= latestSelectableDate else { return nil }
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

}


/// A deliberate profile preview, with safety actions tied to the intention being viewed.
struct TogetherPeerPreview: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    let opportunity: NativeMutualOpportunity
    @State private var showsReport = false
    @State private var confirmsBlock = false
    @State private var isWorking = false
    @State private var issue: String?
    @State private var reportSent = false

    var body: some View {
        NavigationStack {
            Group {
                if let userID = opportunity.peer.userId { PublicProfileView(userID: userID) }
                else {
                    ScrollView {
                        MutualOpportunityCard(opportunity: opportunity, isWorking: false,
                            onBookmark: {}, onMessage: {}, onOpenConversation: {}, showsActions: false)
                            .padding()
                        Text("Identity stays private until a greeting is sent.")
                            .font(.footnote).foregroundStyle(SideSeatTheme.textSecondaryStrong).padding()
                    }
                    .navigationTitle("Intention details")
                    .accessibilityIdentifier("together-private-profile")
                }
            }
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Done", systemImage: "checkmark") { dismiss() }.ssToolbarAction().accessibilityIdentifier("together-profile-done")
                    }.ssStandaloneAction()
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            Button("Report intention", systemImage: "flag") { showsReport = true }
                                .accessibilityIdentifier("together-report-intention")
                            Button("Block", systemImage: "hand.raised", role: .destructive) { confirmsBlock = true }
                                .accessibilityIdentifier("together-block-peer")
                        } label: { Image(systemName: "ellipsis.circle").frame(width: 44, height: 44) }
                        .accessibilityLabel("Safety options").accessibilityIdentifier("together-profile-safety")
                        .disabled(isWorking)
                    }
                }
                .safeAreaInset(edge: .bottom) {
                    if let issue { Text(issue).foregroundStyle(SideSeatTheme.danger).padding() }
                    else if reportSent {
                        Label("Report sent", systemImage: "checkmark.circle").padding()
                            .accessibilityIdentifier("together-report-sent")
                    }
                }
                .alert("Block this person?", isPresented: $confirmsBlock) {
                    Button("Block", role: .destructive) { Task { await block() } }
                        .accessibilityIdentifier("together-block-confirm")
                    Button("Cancel", role: .cancel) { }
                        .accessibilityIdentifier("together-block-cancel")
                } message: { Text("You won't see each other's intentions or be able to contact each other.") }
        }
        .sheet(isPresented: $showsReport) {
            ChatReportSheet(title: AppLocalization.string("Report intention")) { reason, details in
                #if DEBUG
                if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") { reportSent = true; return nil }
                #endif
                do {
                    let _: APIEnvelope<NativeReportResult> = try await session.sendAuthorized("api/v1/me/mutual-opportunities/\(opportunity.id)/safety", method: .post,
                        body: TogetherSafetyRequest(action: "REPORT", reason: reason.rawValue, details: details), idempotencyKey: UUID().uuidString)
                    reportSent = true; return nil
                } catch { return error.localizedDescription }
            }
        }
        .interactiveDismissDisabled(isWorking)
    }

    private func block() async {
        isWorking = true; issue = nil
        defer { isWorking = false }
        do {
            #if DEBUG
            if !ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
                let _: APIEnvelope<NativeConnectionBlockResult> = try await session.sendAuthorized("api/v1/me/mutual-opportunities/\(opportunity.id)/safety", method: .post,
                    body: TogetherSafetyRequest(action: "BLOCK"), idempotencyKey: UUID().uuidString)
            }
            #else
            let _: APIEnvelope<NativeConnectionBlockResult> = try await session.sendAuthorized("api/v1/me/mutual-opportunities/\(opportunity.id)/safety", method: .post,
                body: TogetherSafetyRequest(action: "BLOCK"), idempotencyKey: UUID().uuidString)
            #endif
            await HomeScheduleCache.shared.clear()
            for name in [Notification.Name.sideSeatTogetherNeedsRefresh, .sideSeatInboxNeedsRefresh, .sideSeatPlansNeedsRefresh, .sideSeatCalendarNeedsRefresh] {
                NotificationCenter.default.post(name: name, object: nil)
            }
            dismiss()
        } catch { issue = error.localizedDescription }
    }
}

private struct TogetherSafetyRequest: Encodable {
    let action: String
    var reason: String? = nil
    var details: String? = nil
}


private struct WeeklyIntentEditorDraft: Codable, Equatable {
    let topic: NativeWeeklyIntentTopic
    let hasChosenTopic: Bool
    let activityText: String
    let timeWindows: [WeeklyIntentWindowDraft]
    let timePreference: NativeIntentTimePreference?
    let timeIsUndecided: Bool
    let exploreVisible: Bool
    let note: String
}

private enum TogetherDraftStorage {
    static func read<Value: Decodable>(_ type: Value.Type, key: String?) -> Value? {
        guard let key, let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }
    static func write<Value: Encodable>(_ value: Value, key: String?) {
        guard let key, let data = try? JSONEncoder().encode(value) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }
    static func remove(_ key: String?) {
        if let key { UserDefaults.standard.removeObject(forKey: key) }
    }
}
