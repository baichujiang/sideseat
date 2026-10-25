import Combine
import SwiftUI
import UIKit

enum MVPPlanSection: String, CaseIterable, Equatable, Sendable, Identifiable {
    case waitingResponse
    case upcoming
    case ended

    static let ordered: [MVPPlanSection] = [.waitingResponse, .upcoming]

    var id: String { rawValue }

    var title: String {
        switch self {
        case .waitingResponse: AppLocalization.string("Planning")
        case .upcoming: AppLocalization.string("Confirmed plans")
        case .ended: AppLocalization.string("Past")
        }
    }

    var systemImage: String {
        switch self {
        case .waitingResponse: "bubble.left.and.exclamationmark.bubble.right"
        case .upcoming: "calendar.badge.checkmark"
        case .ended: "clock.arrow.circlepath"
        }
    }

    var accessibilityIdentifier: String {
        switch self {
        case .waitingResponse: "plans-section-waiting-response"
        case .upcoming: "plans-section-upcoming"
        case .ended: "plans-section-ended"
        }
    }

    static func classify(
        _ plan: NativePlanRequest,
        currentUserID: String,
        now: Date
    ) -> MVPPlanSection {
        if plan.status == "PENDING", (plan.startDate ?? .distantPast) > now {
            return .waitingResponse
        }
        if plan.status == "ACCEPTED", (plan.endDate ?? .distantFuture) > now {
            return .upcoming
        }
        return .ended
    }
}

enum MVPPlanRoute {
    static func route(for plan: NativePlanRequest) -> AppRoute {
        AppRoute.plan(
            connectionID: plan.connectionId,
            commitmentID: plan.commitmentId ?? plan.id,
            revisionID: plan.id
        )
    }
}

struct PlansRootView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var store = PlansStore()
    @State private var selectedSection: MVPPlanSection = .waitingResponse
    @State private var scrollPositions = PlanListScrollPositions()
    @State private var now = Date()
    @State private var coordinatedPlans: [NativeTimePollList.Item] = []
    @State private var showsAllWaiting = false
    @State private var waitingScrollID: String?
    @State private var showsPlanCreation = false
    @State private var createdPlanToken: String?
    @State private var coordinationLoading = false
    @State private var coordinationLoaded = false
    @State private var coordinationError: String?
    @State private var repeatPlan: NativePlanRequest?
    private let isHistory: Bool

    init(isHistory: Bool = false) {
        self.isHistory = isHistory
        _selectedSection = State(initialValue: isHistory ? .ended : .waitingResponse)
    }

    private var hasPlans: Bool { !coordinatedPlans.isEmpty || !store.plans.isEmpty }
    private var initiallyLoading: Bool { !hasPlans && (!coordinationLoaded || !store.hasLoaded) }

    var body: some View {
        Group {
            if isHistory {
                sectionScroll(.ended)
                    .navigationTitle("Plan history")
                    .navigationBarTitleDisplayMode(.inline)
            } else {
                VStack(spacing: 0) {
                    sectionPicker
                        .padding(.horizontal, SideSeatTheme.screenHorizontal)
                    SSSectionPager(sections: MVPPlanSection.ordered, selection: $selectedSection) { section in
                        sectionScroll(section)
                    }
                }
                .background(SideSeatTheme.bgGrouped)
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    HStack {
                        Spacer(minLength: 0)
                        createPlanButton
                    }
                    .padding(.horizontal, SideSeatTheme.screenHorizontal)
                    .padding(.vertical, SideSeatTheme.spaceMD)
                    .background(SideSeatTheme.bgGrouped)
                }
                .ssRootNavigationTitle("Plans")
            }
        }
        .background(SideSeatTheme.bgGrouped)
        .toolbar(.visible, for: .navigationBar)
        .toolbar {
            if !isHistory {
                ToolbarItem(placement: .topBarLeading) {
                    Button { router.navigate(to: .planHistory) } label: {
                        Label("Plan history", systemImage: "clock.arrow.circlepath")
                            .labelStyle(.iconOnly)
                    }
                    .buttonStyle(SSActionButtonStyle(horizontalPadding: 12, size: .toolbar))
                    .accessibilityIdentifier("plans-history")
                }.ssStandaloneAction()
            }
        }
        .sheet(isPresented: $showsPlanCreation, onDismiss: {
            if let token = createdPlanToken { createdPlanToken = nil; selectedSection = .waitingResponse; router.openPlan(token: token) }
            Task { await loadCoordinatedPlans() }
        }) {
            NavigationStack {
                TimePollCreateView { poll in createdPlanToken = poll.token; showsPlanCreation = false }
            }.tint(SideSeatTheme.utilityAction).dynamicTypeSize(dynamicTypeSize)
        }
        .onChange(of: router.path) { old, new in
            if !old.isEmpty && new.isEmpty { Task { await loadCoordinatedPlans() } }
        }
        .task { await loadCoordinatedPlans() }
        .background(PlanListReturnObserver(positions: scrollPositions))
        .task { if !store.hasLoaded { await store.load(using: session) } }
        .onAppear { now = Date() }
        .onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { date in
            if date.timeIntervalSince(now) >= 60 || coordinatedPlans.contains(where: {
                ($0.expiresAt ?? $0.chosenStart).map { now < $0 && $0 <= date } == true
            }) || store.plans.contains(where: { $0.status == "PENDING" && $0.startDate.map { now < $0 && $0 <= date } == true }) {
                now = date
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { _ in
            now = Date()
            Task { await store.load(using: session); await loadCoordinatedPlans() }
        }
        .onReceive(NotificationCenter.default.publisher(for: .sideSeatPlansNeedsRefresh)) { _ in
            Task { await store.load(using: session); await loadCoordinatedPlans() }
        }
        .sheet(item: $repeatPlan) { plan in
            PlanCreateSheet(target: .legacyConnection(connectionID: plan.connectionId),
                            recipientName: otherParticipant(for: plan).displayName,
                            draft: NativePlanDraft(repeating: plan)) { result in
                NotificationCenter.default.post(name: .sideSeatPlansNeedsRefresh, object: nil)
                NotificationCenter.default.post(name: .sideSeatInboxNeedsRefresh, object: nil)
                router.navigate(to: .directChat(connectionID: result.connectionID, focus: result.focus))
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(isHistory ? "plans-history-root" : "plans-root")
    }

    private var createPlanButton: some View {
        Button { showsPlanCreation = true } label: {
            Label("Start a plan", systemImage: "plus")
                .font(.body.weight(.semibold))
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, SideSeatTheme.spaceLG)
                .padding(.vertical, SideSeatTheme.spaceMD)
                .frame(minHeight: 48)
                .foregroundStyle(SideSeatTheme.ProductAction.foreground)
                .background(SideSeatTheme.ProductAction.fill, in: Capsule())
                .contentShape(Capsule())
                .shadow(color: .black.opacity(0.06), radius: 8, y: 4)
        }
        .buttonStyle(SSPressButtonStyle())
        .accessibilityLabel(AppLocalization.string("Start a plan"))
        .accessibilityIdentifier(hasPlans || initiallyLoading ? "plans-create-unified" : "plans-create-primary")
    }

    private var sectionPicker: some View {
        SSRootTabs(items: MVPPlanSection.ordered.map { section in
            SSRootTabItem(id: section, title: LocalizedStringKey(section.title),
                accessibilityID: "plans-tab-\(section.rawValue)")
        }, selection: $selectedSection)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(AppLocalization.string("Plans"))
        .accessibilityIdentifier("plans-segmented-control")
    }

    private func sectionScroll(_ section: MVPPlanSection) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                sectionContent(section)
            }
            .padding(.horizontal, SideSeatTheme.screenHorizontal)
            .padding(.top, SideSeatTheme.spaceMD)
            .padding(.bottom, SideSeatTheme.spaceXL)
            .background(PlanListScrollCapture(positions: scrollPositions, section: section))
        }
        .accessibilityIdentifier("plans-scroll-\(section.rawValue)")
        .refreshable { await store.load(using: session); await loadCoordinatedPlans() }
    }

    @ViewBuilder
    private func sectionContent(_ section: MVPPlanSection) -> some View {
        if initiallyLoading {
            SSLoadingState("Loading plans")
                .frame(maxWidth: .infinity, minHeight: 200)
                .accessibilityIdentifier("plans-loading")
        } else {
            if let coordinationError {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                    Text(coordinationError).font(.footnote).foregroundStyle(SideSeatTheme.danger)
                    Button("Try again") { Task { await loadCoordinatedPlans() } }.frame(minHeight: 44)
                }
            }
            if let issue = store.issue {
                if hasPlans {
                    Label(issue, systemImage: "wifi.exclamationmark")
                        .font(.footnote).foregroundStyle(SideSeatTheme.danger)
                        .padding(SideSeatTheme.spaceMD)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(SideSeatTheme.danger.opacity(0.08),
                            in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
                        .accessibilityIdentifier("plans-issue-banner")
                } else {
                    ContentUnavailableView {
                        Label("Plans unavailable", systemImage: "calendar.badge.exclamationmark")
                    } description: { Text(issue) } actions: {
                        Button("Try again") { Task { await store.load(using: session) } }
                    }
                    .accessibilityIdentifier("plans-load-error")
                }
            }
            let visiblePlans = plans(in: section)
            if section == .waitingResponse {
                actionOverview
            } else {
                ForEach(coordinated(in: section)) { plan in
                    if section == .upcoming { coordinatedOverview(plan, style: .meetup) }
                    else { coordinatedCard(plan) }
                }
                if visiblePlans.isEmpty {
                    if coordinated(in: section).isEmpty, coordinationLoaded, store.hasLoaded,
                       coordinationError == nil, store.issue == nil {
                        emptyState(for: section)
                    }
                } else {
                    LazyVStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                        if section == .upcoming {
                            upcomingPlanGroups(visiblePlans)
                        } else {
                            ForEach(visiblePlans) { plan in planRow(plan, section: section) }
                        }
                    }
                    .accessibilityIdentifier(section.accessibilityIdentifier)
                    .accessibilityValue("\(visiblePlans.count)")
                }
            }
        }
    }

    private var actionOverview: some View {
        let manual = coordinated(in: .waitingResponse)
        let needs = manual.filter { $0.nextStep(at: now).needsYou }.sorted {
            ($0.nextStep(at: now) == .confirm ? 0 : 1) < ($1.nextStep(at: now) == .confirm ? 0 : 1)
        }
        let waiting = manual.filter { !$0.nextStep(at: now).needsYou }
        let incoming = plans(in: .waitingResponse).filter { $0.receiver.id == currentUserID }
        let outgoing = plans(in: .waitingResponse).filter { $0.proposer.id == currentUserID }
        return VStack(alignment: .leading, spacing: SideSeatTheme.spaceLG) {
            if !needs.isEmpty || !incoming.isEmpty {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                    overviewHeading("Your next steps", count: needs.count + incoming.count,
                        identifier: "plans-waiting-incoming-heading", needsAttention: true)
                    VStack(spacing: SideSeatTheme.spaceSM) {
                        ForEach(needs) { plan in coordinatedOverview(plan) }
                        ForEach(incoming) { plan in conversationOverview(plan) }
                    }
                }.accessibilityElement(children: .contain).accessibilityIdentifier("plans-needs-you")
            }
            if !waiting.isEmpty || !outgoing.isEmpty {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                    HStack {
                        overviewHeading("Waiting for others", count: waiting.count + outgoing.count,
                            identifier: "plans-waiting-outgoing-heading")
                        Spacer(minLength: SideSeatTheme.spaceSM)
                        if !dynamicTypeSize.isAccessibilitySize {
                            Button(showsAllWaiting ? "Show fewer plans" : "View all") { showsAllWaiting.toggle() }
                                .font(.footnote.weight(.medium)).frame(minHeight: 44)
                                .accessibilityIdentifier("plans-toggle-outgoing")
                                .accessibilityValue(AppLocalization.string(showsAllWaiting ? "Expanded" : "Collapsed"))
                        }
                    }
                    if showsAllWaiting || dynamicTypeSize.isAccessibilitySize {
                        VStack(spacing: SideSeatTheme.spaceSM) {
                            ForEach(waiting) { plan in coordinatedOverview(plan, style: .waiting) }
                            ForEach(outgoing) { plan in conversationOverview(plan, style: .waiting) }
                        }.accessibilityElement(children: .contain)
                            .accessibilityIdentifier("plans-waiting-expanded")
                    } else {
                        ScrollView(.horizontal) {
                            HStack(alignment: .top, spacing: SideSeatTheme.spaceSM) {
                                ForEach(waiting) { plan in
                                    coordinatedOverview(plan, style: .waiting)
                                    .containerRelativeFrame(.horizontal) { width, _ in
                                        waiting.count + outgoing.count == 1 ? width : min(300, width * 0.78)
                                    }
                                    .id("shared-" + plan.token)
                                }
                                ForEach(outgoing) { plan in
                                    conversationOverview(plan, style: .waiting)
                                    .containerRelativeFrame(.horizontal) { width, _ in
                                        waiting.count + outgoing.count == 1 ? width : min(300, width * 0.78)
                                    }
                                    .id("chat-" + plan.id)
                                }
                            }.scrollTargetLayout()
                        }
                        .scrollIndicators(.hidden)
                        .scrollTargetBehavior(.viewAligned)
                        .scrollPosition(id: $waitingScrollID, anchor: .leading)
                        .overlay {
                            if waiting.count + outgoing.count > 1 {
                                SSPageSwipeExclusion().allowsHitTesting(false)
                            }
                        }
                        .accessibilityIdentifier("plans-waiting-rail")
                        .accessibilityHint("Swipe to see more plans")
                    }
                }.accessibilityElement(children: .contain).accessibilityIdentifier("plans-waiting-others")
            }
            if manual.isEmpty && incoming.isEmpty && outgoing.isEmpty,
               coordinationLoaded, store.hasLoaded, coordinationError == nil, store.issue == nil {
                Text("No plans in progress")
                    .font(.subheadline).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .frame(maxWidth: .infinity).padding(.vertical, SideSeatTheme.spaceXL)
                    .accessibilityIdentifier("plans-empty-waitingResponse")
            }
        }
    }

    private func coordinatedOverview(_ plan: NativeTimePollList.Item,
                                     style: PlanOverviewStyle = .task) -> some View {
        let phase = plan.planningPhase(at: now)
        let progress: String? = switch phase {
        case "COLLECTING": plan.activitySelection?.isOpen == true
            ? String(format: AppLocalization.string("%d activity ideas"), plan.activitySelection?.ideaCount ?? 0)
            : String(format: AppLocalization.string("%d people responded"), plan.respondedCount ?? 0)
        case "INVITING": String(format: AppLocalization.string("%d of %d confirmed"), plan.acceptedCount ?? 0, plan.confirmationTarget)
        default: nil
        }
        return Button {
            scrollPositions.capture(selectedSection)
            router.openPlan(token: plan.token)
        } label: {
            PlanOverviewLabel(title: plan.title, presentation: plan.presentation(at: now), style: style,
                start: plan.chosenStart, end: plan.chosenEnd, timeZone: plan.timeZone,
                candidateDates: plan.dates, now: now,
                context: plan.isOwner == true ? AppLocalization.string("Organized by you")
                    : plan.organizer.map { String(format: AppLocalization.string(phase == "INVITING" ? "%@ invited you" : "%@ is organizing"), $0.displayName) }
                        ?? AppLocalization.string("Shared plan"),
                progress: progress, people: (plan.isOwner == true ? [] : plan.organizer.map { [$0] } ?? []) + (plan.peoplePreview ?? []))
        }
        .buttonStyle(SSPressButtonStyle())
        .accessibilityIdentifier("plans-coordinated-\(plan.token)")
        .accessibilityValue(plan.presentation(at: now).cardStatusTitle)
    }

    private func conversationOverview(_ plan: NativePlanRequest,
                                      style: PlanOverviewStyle = .task) -> some View {
        let participant = otherParticipant(for: plan)
        let context = plan.status == "PENDING"
            ? String(format: AppLocalization.string(plan.receiver.id == currentUserID
                ? "%@ invited you" : "You invited %@"), participant.displayName)
            : participant.displayName
        return Button {
            scrollPositions.capture(selectedSection)
            router.navigate(to: MVPPlanRoute.route(for: plan))
        } label: {
            PlanOverviewLabel(title: plan.title,
                presentation: PlanPresentation.conversation(plan, viewerID: currentUserID, now: now), style: style,
                start: plan.startDate, end: plan.endDate, now: now, location: plan.location, context: context,
                waitingFor: plan.status == "PENDING" && plan.proposer.id == currentUserID ? participant.displayName : nil,
                people: [.init(displayName: participant.displayName, avatarUrl: participant.avatarUrl)])
        }
        .buttonStyle(SSPressButtonStyle())
        .accessibilityIdentifier("plans-row-\(plan.id)")
        .accessibilityValue(PlanPresentation.conversation(plan, viewerID: currentUserID, now: now).cardStatusTitle)
        .accessibilityHint("Open Plan in conversation")
    }

    private func coordinatedCard(_ plan: NativeTimePollList.Item) -> some View {
        let phase = plan.planningPhase(at: now)
        let presentation = plan.presentation(at: now)
        return Button { scrollPositions.capture(selectedSection); router.navigate(to: .timePoll(token: plan.token)) } label: {
            SSFlowCard {
                PlanCardHeading(title: plan.title, presentation: presentation,
                    context: AppLocalization.string(plan.isOwner == true ? "Organized by you" : "Shared plan"))
                if let start = plan.chosenStart, let end = plan.chosenEnd {
                    PlanCardSchedule(start: start, end: end, timeZone: plan.timeZone)
                } else if let first = plan.dates.first, let last = plan.dates.last {
                    VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                        Text("Candidate dates").font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        Label(timePollDateLabel(first).replacingOccurrences(of: "\n", with: " ")
                              + (first == last ? "" : " – " + timePollDateLabel(last).replacingOccurrences(of: "\n", with: " ")),
                              systemImage: "calendar")
                            .font(.subheadline.weight(.medium)).fixedSize(horizontal: false, vertical: true)
                        Text(plan.timeZone).font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    }.foregroundStyle(SideSeatTheme.textPrimary)
                }
                if ["COLLECTING", "INVITING"].contains(phase) {
                    Divider()
                    PlanCardProgress(title: phase == "COLLECTING"
                        ? String(format: AppLocalization.string("%d people responded"), plan.respondedCount ?? 0)
                        : String(format: AppLocalization.string("%d of %d confirmed"), plan.acceptedCount ?? 0, plan.confirmationTarget),
                        confirmed: phase == "INVITING" ? plan.acceptedCount ?? 0 : nil,
                        target: phase == "INVITING" ? plan.confirmationTarget : nil)
                }
                PlanCardActionFooter(presentation: presentation)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(SSPressButtonStyle()).accessibilityIdentifier("plans-coordinated-\(plan.token)")
        .accessibilityValue(plan.statusLabel(at: now))
    }

    private func coordinated(in section: MVPPlanSection) -> [NativeTimePollList.Item] {
        coordinatedPlans.filter { plan in
            let phase = plan.planningPhase(at: now)
            return switch section {
            case .waitingResponse: ["COLLECTING", "INVITING"].contains(phase) || (phase == "CONFIRMED" && plan.nextStep(at: now) == .confirm)
            case .upcoming: phase == "CONFIRMED" && (plan.isOwner == true || plan.myInvitationStatus == "ACCEPTED") && (plan.chosenEnd ?? .distantPast) > now
            case .ended: ["CANCELLED", "EXPIRED"].contains(phase) || (phase == "CONFIRMED" && ((plan.nextStep(at: now) != .confirm && plan.myInvitationStatus != "ACCEPTED" && plan.isOwner != true) || (plan.chosenEnd ?? .distantFuture) <= now))
            }
        }.sorted {
            section == .upcoming
                ? ($0.chosenStart ?? .distantFuture) < ($1.chosenStart ?? .distantFuture)
                : $0.updatedAt > $1.updatedAt
        }
    }
    private func loadCoordinatedPlans() async {
        guard !coordinationLoading else { return }
        coordinationLoading = true
        defer { coordinationLoading = false; coordinationLoaded = true }
        let generation = session.authorizationGeneration
        do {
            let result: APIEnvelope<NativeTimePollList> = try await session.sendAuthorized("/api/v1/time-polls")
            guard generation == session.authorizationGeneration else { return }
            coordinatedPlans = result.data.polls; coordinationError = nil
        } catch { coordinationError = error.localizedDescription }
    }

    private func overviewHeading(_ title: LocalizedStringKey, count: Int, identifier: String,
                                 needsAttention: Bool = false) -> some View {
        HStack(spacing: 8) {
            Text(title)
                .font(.headline)
                .foregroundStyle(needsAttention ? SideSeatTheme.textPrimary : SideSeatTheme.textSecondaryStrong)
            Text(count.formatted())
                .font(.caption.weight(.semibold))
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)

        }
        .accessibilityElement(children: .combine)
        .accessibilityValue(count.formatted())
        .accessibilityAddTraits(.isHeader)
        .accessibilityIdentifier(identifier)
    }

    private func upcomingPlanGroups(_ plans: [NativePlanRequest]) -> some View {
        let calendar = Calendar.autoupdatingCurrent
        let groups = Dictionary(grouping: plans) { plan in
            plan.startDate.map { calendar.startOfDay(for: $0) } ?? .distantFuture
        }
        return ForEach(groups.keys.sorted(), id: \.self) { day in
            Section {
                ForEach(groups[day] ?? []) { plan in planRow(plan, section: .upcoming) }
            } header: {
                Text(day == .distantFuture ? MVPPlanSection.upcoming.title : planDaySummary(day))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .padding(.top, day == groups.keys.min() ? 0 : 12)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("plans-date-heading-\(day.timeIntervalSince1970)")
            }
        }
    }

    private var currentUserID: String {
        session.currentUser?.id ?? ""
    }

    private func plans(in section: MVPPlanSection) -> [NativePlanRequest] {
        let filtered = store.plans.filter {
            MVPPlanSection.classify($0, currentUserID: currentUserID, now: now) == section
        }
        switch section {
        case .ended:
            return filtered.sorted {
                ($0.endDate ?? .distantPast) > ($1.endDate ?? .distantPast)
            }
        case .waitingResponse, .upcoming:
            return filtered.sorted {
                ($0.startDate ?? .distantFuture) < ($1.startDate ?? .distantFuture)
            }
        }
    }

    private func emptyState(for section: MVPPlanSection) -> some View {
        VStack(spacing: SideSeatTheme.spaceSM) {
            Image(systemName: section.systemImage)
                .font(.title2)
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
            Text(sectionEmptyTitle(section))
                .font(.headline)
            Text(sectionEmptyDescription(section))
                .font(.footnote)
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .multilineTextAlignment(.center)

        }
        .frame(maxWidth: .infinity, minHeight: 180)
        .padding(.horizontal, SideSeatTheme.spaceLG)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("plans-empty-\(section.rawValue)")
    }

    private func sectionEmptyTitle(_ section: MVPPlanSection) -> String {
        switch section {
        case .waitingResponse: AppLocalization.string("No current plans")
        case .upcoming: AppLocalization.string("No confirmed plans")
        case .ended: AppLocalization.string("No ended plans")
        }
    }

    private func sectionEmptyDescription(_ section: MVPPlanSection) -> String {
        switch section {
        case .waitingResponse: AppLocalization.string("Plans you create and invitations you receive appear here.")
        case .upcoming: AppLocalization.string("Your confirmed plans will appear here until they finish.")
        case .ended: AppLocalization.string("Completed, declined, canceled, and expired plans will appear here.")
        }
    }

    private func planRow(
        _ plan: NativePlanRequest,
        section: MVPPlanSection,
        showsFullDate: Bool = false
    ) -> some View {
        if section == .upcoming { return AnyView(conversationOverview(plan, style: .meetup)) }
        let participant = otherParticipant(for: plan)
        let showsOutcome = plan.isOutcomeEligible()
        let presentation = PlanPresentation.conversation(plan, viewerID: currentUserID, now: now)
        return AnyView(SSFlowCard(contentSpacing: SideSeatTheme.spaceMD) {
            Button {
                scrollPositions.capture(selectedSection)
                router.navigate(to: MVPPlanRoute.route(for: plan))
            } label: {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                    PlanCardHeading(title: plan.title, presentation: presentation)
                    if let start = plan.startDate, let end = plan.endDate {
                        PlanCardSchedule(start: start, end: end, location: plan.location,
                            relative: section == .ended ? nil : PlanRelativeTime.value(status: plan.status, start: start, end: end, now: now)?.title)
                    }
                    HStack(spacing: SideSeatTheme.spaceSM) {
                        InitialAvatar(name: participant.displayName, url: participant.avatarUrl, size: 24).accessibilityHidden(true)
                        Text(plan.status == "PENDING"
                            ? String(format: AppLocalization.string(plan.receiver.id == currentUserID
                                ? "%@ invited you" : "You invited %@"), participant.displayName)
                            : participant.displayName)
                            .font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    PlanCardActionFooter(presentation: presentation)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(SSPressButtonStyle())
            .accessibilityIdentifier("plans-row-\(plan.id)")
            .accessibilityValue(statusLabel(for: plan, section: section))
            .accessibilityHint("Open Plan in conversation")

            if showsOutcome {
                Divider()
                PlanOutcomePromptView(
                    plan: plan,
                    isSubmitting: store.mutatingOutcomeID == plan.id,
                    showsSavedQuestion: false
                ) { value in
                    Task { await store.recordOutcome(value, for: plan.id, using: session) }
                }
                PlanContinuationActions(plan: plan, currentUserID: currentUserID,
                                        isDisabled: store.mutatingOutcomeID == plan.id) {
                    scrollPositions.capture(selectedSection)
                    repeatPlan = plan
                }
            }
        })
    }

    private func planDaySummary(_ date: Date) -> String {
        let calendar = Calendar.autoupdatingCurrent
        let locale = AppLocalization.selectedLanguage.locale
        if calendar.component(.year, from: date) == calendar.component(.year, from: now) {
            return date.formatted(.dateTime.month(.abbreviated).day().weekday(.abbreviated).locale(locale))
        }
        return date.formatted(.dateTime.year().month(.abbreviated).day().locale(locale))
    }

    private func statusLabel(
        for plan: NativePlanRequest,
        section: MVPPlanSection
    ) -> String {
        PlanPresentation.conversation(plan, viewerID: currentUserID, now: now).status.title
    }

    private func otherParticipant(for plan: NativePlanRequest) -> NativePlanAuthor {
        plan.proposer.id == currentUserID ? plan.receiver : plan.proposer
    }
}

private enum PlanOverviewStyle { case task, waiting, meetup }

/// Lightweight overview only. Opening a row always leads to the existing review/detail flow.
private struct PlanOverviewLabel: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    let title: String
    let presentation: PlanPresentation
    let style: PlanOverviewStyle
    let start: Date?
    let end: Date?
    var timeZone = TimeZone.current.identifier
    var candidateDates: [String] = []
    var now = Date()
    var location: String? = nil
    let context: String
    var progress: String? = nil
    var waitingFor: String? = nil
    var people: [NativeTimePollList.Person] = []

    private var timing: PlanOverviewTiming {
        .init(start: start, end: end, candidateDates: candidateDates, timeZone: timeZone,
              now: now, locale: AppLocalization.selectedLanguage.locale)
    }
    private var stackedSchedule: Bool { typeSize >= .xxLarge }
    private var secondary: Color { SideSeatTheme.textSecondaryStrong }
    private var displayDate: String? { start != nil || !candidateDates.isEmpty ? timing.dateText : nil }
    private var displayTime: String { timing.clockText ?? AppLocalization.string("Time to be decided") }

    var body: some View {
        SSFlowCard(contentPadding: SideSeatTheme.spaceLG, contentSpacing: 0) {
            let layout = stackedSchedule
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: SideSeatTheme.spaceSM))
                : AnyLayout(HStackLayout(alignment: .top, spacing: SideSeatTheme.spaceLG))
            layout {
                schedule
                    .frame(width: stackedSchedule ? nil : 112, alignment: .leading)
                information
            }
        }
        .foregroundStyle(SideSeatTheme.textPrimary)
        .contentShape(RoundedRectangle(cornerRadius: SideSeatTheme.Together.cardRadius))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel([presentation.cardStatusTitle, title, displayDate, displayTime,
            timing.zoneText, style == .waiting ? waitingSummary : context, progress, location,
            presentation.cardActionTitle].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", "))
        .accessibilityHint(style == .meetup ? presentation.cardActionTitle : "")
    }

    private var information: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                activityTitle(style == .waiting ? .subheadline : .headline)
                status
                if let location, !location.isEmpty {
                    Text(location).font(.caption).foregroundStyle(secondary)
                        .lineLimit(typeSize.isAccessibilitySize ? nil : 2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: SideSeatTheme.spaceSM) {
                peopleSummary
                if !typeSize.isAccessibilitySize {
                    Spacer(minLength: 0)
                    chevron
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var peopleSummary: some View {
        PlanHomePeople(people: people, text: progress ?? context)
            .lineLimit(typeSize.isAccessibilitySize ? nil : 1)
    }

    private var waitingSummary: String {
        if let waitingFor {
            return String(format: AppLocalization.string("Waiting for %@ to confirm"), waitingFor)
        }
        return [presentation.cardStatusTitle, progress].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
    }

    private var status: some View {
        HStack(alignment: .firstTextBaseline, spacing: SideSeatTheme.spaceXS) {
            Circle().fill(secondary.opacity(0.6)).frame(width: 5, height: 5)
                .accessibilityHidden(true)
            Text(waitingFor == nil ? presentation.cardStatusTitle : waitingSummary)
                .font(.caption).fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(secondary)
    }

    private var chevron: some View {
        Image(systemName: "chevron.right").font(.caption2.weight(.semibold)).foregroundStyle(secondary)
            .accessibilityHidden(true)
    }

    private func activityTitle(_ font: Font) -> some View {
        Text(title).font(font.weight(.semibold))
            .lineLimit(typeSize.isAccessibilitySize ? nil : 2)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityLabel(title)
    }

    private var schedule: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
            if let start {
                Text(timing.datePart(start, template: "MMMd"))
                    .font(.title3.weight(.bold))
                    .fixedSize(horizontal: false, vertical: true)
                Text(timing.dayContext(start)).font(.caption2).foregroundStyle(secondary)
                if let end {
                    if timing.crossesDay {
                        clock(start)
                        HStack(alignment: .top, spacing: SideSeatTheme.spaceXS) {
                            Image(systemName: "arrow.down").font(.caption2)
                                .foregroundStyle(secondary).accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(timing.dateLabel(end, weekday: false))
                                    .font(.caption.weight(.semibold)).foregroundStyle(secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                                clock(end)
                            }
                        }
                    } else {
                        ViewThatFits(in: .horizontal) {
                            Text(displayTime).font(.footnote.weight(.semibold)).monospacedDigit()
                                .fixedSize()
                            VStack(alignment: .leading, spacing: 2) {
                                clock(start)
                                Text("– " + timing.datePart(end, template: "jmm"))
                                    .font(.footnote.weight(.semibold)).monospacedDigit()
                            }
                        }
                    }
                } else {
                    Text(displayTime).font(.caption).foregroundStyle(secondary)
                }
            } else {
                let dates = timing.candidateDays
                if let range = timing.candidateRangeText {
                    if let context = timing.candidateRangeContext {
                        Text(context).font(.caption2).foregroundStyle(secondary)
                    }
                    ViewThatFits(in: .horizontal) {
                        Text(range).font(.title3.weight(.bold)).fixedSize()
                        VStack(alignment: .leading, spacing: 2) {
                            if let first = dates.first, let last = dates.last {
                                candidateDate(first)
                                if first != last { candidateDate(last, isEnd: true) }
                            }
                        }
                        .font(.footnote.weight(.semibold))
                        .fixedSize(horizontal: false, vertical: true)
                    }
                }
                if dates.count > 1 {
                    let count = String(format: AppLocalization.string("%d dates"), dates.count)
                    ViewThatFits(in: .horizontal) {
                        Text(count + " · " + displayTime).fixedSize()
                        VStack(alignment: .leading, spacing: 2) {
                            Text(count)
                            Text(displayTime)
                        }
                    }
                    .font(.caption2).foregroundStyle(secondary)
                } else {
                    Text(displayTime).font(.caption).foregroundStyle(secondary)
                }
            }
            zone
        }
    }

    private func candidateDate(_ date: Date, isEnd: Bool = false) -> some View {
        let prefix = isEnd ? "– " : ""
        return ViewThatFits(in: .horizontal) {
            Text(prefix + timing.dateLabel(date, weekday: false)).fixedSize()
            VStack(alignment: .leading, spacing: 2) {
                Text(timing.datePart(date, template: "y")).font(.caption2).foregroundStyle(secondary)
                Text(prefix + timing.datePart(date, template: "MMMd"))
            }
        }
    }

    private func clock(_ date: Date) -> some View {
        Text(timing.datePart(date, template: "jmm"))
            .font(.footnote.weight(.semibold)).monospacedDigit()
            .fixedSize(horizontal: false, vertical: true)
    }
    @ViewBuilder private var zone: some View {
        if let name = timing.zoneText {
            Text(name).font(.caption).foregroundStyle(secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

// Preserve the exact list offset across chat's tab-bar visibility transition.
@MainActor
private final class PlanListScrollPositions {
    final class Reference {
        weak var view: UIScrollView?
        init(_ view: UIScrollView) { self.view = view }
    }
    var views: [MVPPlanSection: Reference] = [:]
    private var pending: (reference: Reference, offset: CGPoint)?

    func capture(_ section: MVPPlanSection) {
        guard let reference = views[section], let scroll = reference.view else { return }
        pending = (reference, scroll.contentOffset)
    }

    func restore() {
        guard let pending, let scroll = pending.reference.view else { return }
        self.pending = nil
        scroll.setContentOffset(pending.offset, animated: false)
    }
}

private struct PlanListScrollCapture: UIViewRepresentable {
    let positions: PlanListScrollPositions
    let section: MVPPlanSection

    func makeUIView(context: Context) -> CaptureView { CaptureView() }
    func updateUIView(_ view: CaptureView, context: Context) {
        view.register = { positions.views[section] = .init($0) }
        view.setNeedsLayout()
    }

    final class CaptureView: UIView {
        var register: ((UIScrollView) -> Void)?
        override func layoutSubviews() {
            super.layoutSubviews()
            var ancestor = superview
            while let view = ancestor {
                if let scroll = view as? UIScrollView {
                    register?(scroll)
                    return
                }
                ancestor = view.superview
            }
        }
    }
}

private struct PlanListReturnObserver: UIViewControllerRepresentable {
    let positions: PlanListScrollPositions
    func makeUIViewController(context: Context) -> ReturnController { ReturnController() }
    func updateUIViewController(_ controller: ReturnController, context: Context) {
        controller.onReturn = { positions.restore() }
    }
    final class ReturnController: UIViewController {
        var onReturn: (() -> Void)?
        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            onReturn?()
        }
    }
}
