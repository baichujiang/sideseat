import Combine
import SwiftUI
import UIKit

enum MVPPlanSection: String, CaseIterable, Equatable, Sendable, Identifiable {
    case waitingResponse
    case upcoming
    case ended

    static let ordered: [MVPPlanSection] = [.waitingResponse, .upcoming, .ended]

    var id: String { rawValue }

    var title: String {
        switch self {
        case .waitingResponse: AppLocalization.string("Overview")
        case .upcoming: AppLocalization.string("Upcoming")
        case .ended: AppLocalization.string("Ended")
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
    @Environment(DeepLinkRouter.self) private var deepLinkRouter
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var store = PlansStore()
    @State private var selectedSection: MVPPlanSection = .waitingResponse
    @State private var scrollPositions = PlanListScrollPositions()
    @State private var now = Date()
    @State private var showsAllIncoming = false
    @State private var showsOutgoing = false
    @State private var showsSectionPicker = false
    @State private var coordinatedPlans: [NativeTimePollList.Item] = []
    @State private var showsPlanCreation = false
    @State private var createdPlanToken: String?
    @State private var showsOpenPlanLink = false
    @State private var planLink = ""
    @State private var coordinationLoading = false
    @State private var coordinationLoaded = false
    @State private var coordinationError: String?
    @State private var repeatPlan: NativePlanRequest?
    @ScaledMetric(relativeTo: .subheadline) private var detailIconWidth: CGFloat = 18

    var body: some View {
        VStack(spacing: 0) {
            sectionPicker
                .padding(.horizontal, SideSeatTheme.screenHorizontal)
                .padding(.vertical, SideSeatTheme.spaceMD)
                .background(SideSeatTheme.bgGrouped)

            SSSectionPager(sections: MVPPlanSection.ordered, selection: $selectedSection) { section in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                        sectionContent(section)
                    }
                    .padding(.horizontal, SideSeatTheme.screenHorizontal)
                    .padding(.top, SideSeatTheme.spaceXS)
                    .padding(.bottom, SideSeatTheme.spaceXL)
                    .background(PlanListScrollCapture(positions: scrollPositions, section: section))
                }
                .accessibilityIdentifier("plans-scroll-\(section.rawValue)")
                .refreshable { await store.load(using: session); await loadCoordinatedPlans() }
            }
        }
        .background(SideSeatTheme.bgGrouped)
        .ssRootNavigationTitle("Plans")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showsPlanCreation = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel("Create a plan").accessibilityIdentifier("plans-create-unified")
            }
        }
        .sheet(isPresented: $showsPlanCreation, onDismiss: {
            if let token = createdPlanToken { createdPlanToken = nil; router.openPlan(token: token) }
            Task { await loadCoordinatedPlans() }
        }) {
            NavigationStack {
                TimePollCreateView { poll in createdPlanToken = poll.token; showsPlanCreation = false }
            }.tint(SideSeatTheme.utilityAction)
        }
        .alert("Open a poll link", isPresented: $showsOpenPlanLink) {
            TextField("Sideseat poll link", text: $planLink).textInputAutocapitalization(.never).autocorrectionDisabled()
            Button("Open") {
                if let token = TimePollLink.token(from: planLink) { coordinationError = nil; router.openPlan(token: token) }
                else { coordinationError = AppLocalization.string("Enter a Sideseat time poll link.") }
            }
            Button("Cancel", role: .cancel) {}
        }
        .onChange(of: router.path) { old, new in
            if !old.isEmpty && new.isEmpty { Task { await loadCoordinatedPlans() } }
        }
        .task { await loadCoordinatedPlans() }
        .background(PlanListReturnObserver(positions: scrollPositions))
        .task { if !store.hasLoaded { await store.load(using: session) } }
        .onAppear { now = Date(); Task { await loadCoordinatedPlans() } }
        .onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { date in
            if date.timeIntervalSince(now) >= 60 || coordinatedPlans.contains(where: {
                ($0.expiresAt ?? $0.chosenStart).map { now < $0 && $0 <= date } == true
            }) || store.plans.contains(where: { $0.status == "PENDING" && $0.startDate.map { now < $0 && $0 <= date } == true }) {
                now = date
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { _ in
            now = Date()
            Task { await loadCoordinatedPlans() }
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
        .accessibilityIdentifier("plans-root")
    }

    @ViewBuilder
    private var sectionPicker: some View {
        if dynamicTypeSize.isAccessibilitySize {
            Button { showsSectionPicker = true } label: {
                HStack(spacing: SideSeatTheme.spaceSM) {
                    Text(selectedSection.title)
                        .font(.body.weight(.semibold))
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.down")
                        .font(.subheadline.weight(.semibold))
                        .accessibilityHidden(true)
                }
                .padding(.horizontal, SideSeatTheme.spaceMD)
                .padding(.vertical, SideSeatTheme.spaceXS)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .background(SideSeatTheme.surface,
                    in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .foregroundStyle(SideSeatTheme.utilityAction)
            .accessibilityLabel(AppLocalization.string("Plan sections"))
            .accessibilityValue(selectedSection.title)
            .accessibilityHint(AppLocalization.string("Choose a section"))
            .accessibilityIdentifier("plans-section-menu")
            .sheet(isPresented: $showsSectionPicker) {
                NavigationStack {
                    List(MVPPlanSection.ordered) { section in
                        Button {
                            selectedSection = section
                            showsSectionPicker = false
                        } label: {
                            HStack(spacing: SideSeatTheme.spaceSM) {
                                Text(section.title)
                                    .font(.body.weight(section == selectedSection ? .semibold : .regular))
                                    .fixedSize(horizontal: false, vertical: true)
                                Spacer(minLength: 0)
                                if section == selectedSection {
                                    Image(systemName: "checkmark").accessibilityHidden(true)
                                }
                            }
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        }
                        .foregroundStyle(SideSeatTheme.utilityAction)
                        .accessibilityAddTraits(section == selectedSection ? .isSelected : [])
                        .accessibilityIdentifier("plans-tab-\(section.rawValue)")
                    }
                    .navigationTitle("Plans")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done") { showsSectionPicker = false }
                        }
                    }
                }
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("plans-section-picker")
                .presentationDetents([.large])
                .dynamicTypeSize(dynamicTypeSize)
            }
        } else {
            Picker(AppLocalization.string("Plans"), selection: $selectedSection) {
                ForEach(MVPPlanSection.ordered) { section in
                    Text(section.title).tag(section)
                        .accessibilityIdentifier("plans-tab-\(section.rawValue)")
                }
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("plans-segmented-control")
        }
    }

    @ViewBuilder
    private func sectionContent(_ section: MVPPlanSection) -> some View {
        if section == .waitingResponse { planActions }
        if !coordinationLoaded && coordinatedPlans.isEmpty {
            ProgressView("Loading plans").frame(maxWidth: .infinity, minHeight: 70)
        } else if section == .waitingResponse {
            coordinatedSection("Awaiting confirmations", plans: coordinated(in: .waitingResponse).filter { $0.planningPhase(at: now) == "INVITING" }, identifier: "plans-shared-invitations")
            coordinatedSection("Finding a time together", plans: coordinated(in: .waitingResponse).filter { $0.planningPhase(at: now) == "COLLECTING" }, identifier: "plans-shared-availability")
            if let next = coordinated(in: .upcoming).first {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                    HStack {
                        Text("Next meet-up").font(.headline)
                        Spacer()
                        Button("View all") { selectedSection = .upcoming }.frame(minHeight: 44)
                            .accessibilityIdentifier("plans-view-shared-upcoming")
                    }
                    coordinatedCard(next)
                }
            }
        } else {
            ForEach(coordinated(in: section)) { plan in coordinatedCard(plan) }
        }
        if let coordinationError {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                Text(coordinationError).font(.footnote).foregroundStyle(SideSeatTheme.danger)
                Button("Try again") { Task { await loadCoordinatedPlans() } }.frame(minHeight: 44)
            }
        }

        if (!store.hasLoaded || store.isLoading) && store.plans.isEmpty {
            SSLoadingState("Loading plans")
                .frame(maxWidth: .infinity, minHeight: 200)
                .accessibilityIdentifier("plans-loading")
        } else if let issue = store.issue, store.plans.isEmpty {
            ContentUnavailableView {
                Label("Plans unavailable", systemImage: "calendar.badge.exclamationmark")
            } description: { Text(issue) } actions: {
                Button("Try again") { Task { await store.load(using: session) } }
            }
            .accessibilityIdentifier("plans-load-error")
        } else {
            if let issue = store.issue {
                Label(issue, systemImage: "wifi.exclamationmark")
                    .font(.footnote).foregroundStyle(SideSeatTheme.danger)
                    .padding(SideSeatTheme.spaceMD)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(SideSeatTheme.danger.opacity(0.08),
                        in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
                    .accessibilityIdentifier("plans-issue-banner")
            }
            let visiblePlans = plans(in: section)
            if section == .waitingResponse {
                if !plans(in: .waitingResponse).isEmpty || !plans(in: .upcoming).isEmpty {
                    Text("From conversations").font(.headline).padding(.top, SideSeatTheme.spaceSM)
                    overview
                } else if coordinated(in: .waitingResponse).isEmpty && coordinated(in: .upcoming).isEmpty && coordinationLoaded && coordinationError == nil {
                    emptyState(for: .waitingResponse)
                }
            } else if visiblePlans.isEmpty { if coordinated(in: section).isEmpty { emptyState(for: section) } }
            else {
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

    private var planActions: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            Text("Make plans, all in one place").font(.title3.weight(.semibold))
            Text("Share availability, confirm a time, and keep track of what's next.")
                .font(.subheadline).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .fixedSize(horizontal: false, vertical: true)
            let layout = dynamicTypeSize.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: 10)) : AnyLayout(HStackLayout(spacing: 10))
            layout {
                Button { showsPlanCreation = true } label: {
                    Label("Create a plan", systemImage: "plus.circle.fill")
                        .font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity, minHeight: 50)
                        .foregroundStyle(SideSeatTheme.ProductAction.foreground)
                        .background(SideSeatTheme.ProductAction.fill, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
                }.buttonStyle(.plain).accessibilityIdentifier("plans-create-primary")
                Button { planLink = ""; showsOpenPlanLink = true } label: {
                    Label("Open a poll link", systemImage: "link")
                        .font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity, minHeight: 50)
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
                }.buttonStyle(.plain).accessibilityIdentifier("plans-open-link")
            }
        }.padding(.bottom, SideSeatTheme.spaceSM)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("plans-actions")
    }

    @ViewBuilder private func coordinatedSection(_ title: LocalizedStringKey, plans: [NativeTimePollList.Item], identifier: String) -> some View {
        if !plans.isEmpty {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                HStack {
                    Text(title).font(.headline)
                    Text(plans.count.formatted()).font(.caption.weight(.medium)).foregroundStyle(.secondary)
                }.accessibilityAddTraits(.isHeader)
                ForEach(plans) { plan in coordinatedCard(plan) }
            }.accessibilityElement(children: .contain).accessibilityIdentifier(identifier)
        }
    }

    private func coordinatedCard(_ plan: NativeTimePollList.Item) -> some View {
        let phase = plan.planningPhase(at: now)
        let collecting = phase == "COLLECTING"
        let needsReply = phase == "INVITING" && plan.isIncluded != false && plan.myInvitationStatus != "ACCEPTED"
        let tone = collecting ? SideSeatTheme.Availability.selectedFill : phase == "INVITING" ? SideSeatTheme.statusWarningText : phase == "CONFIRMED" ? SideSeatTheme.statusSuccessText : SideSeatTheme.textSecondaryStrong
        let action: String.LocalizationValue = collecting ? "Open availability timetable" : needsReply ? "View and confirm" : phase == "INVITING" ? "View confirmation progress" : "View plan"
        return Button { scrollPositions.capture(selectedSection); router.openPlan(token: plan.token) } label: {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                Label(plan.statusLabel(at: now), systemImage: collecting ? "calendar.badge.clock" : phase == "INVITING" ? "clock" : phase == "EXPIRED" ? "clock.badge.exclamationmark" : phase == "CANCELLED" ? "xmark.circle" : "checkmark.circle")
                    .font(.caption.weight(.semibold)).foregroundStyle(tone)
                    .padding(.horizontal, 8).padding(.vertical, 5)
                    .background(tone.opacity(0.10), in: Capsule())
                Text(plan.title).font(.headline).foregroundStyle(SideSeatTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                if let start = plan.chosenStart, let end = plan.chosenEnd {
                    Label(unifiedPlanTimeLabel(start: start, end: end, timeZone: plan.timeZone), systemImage: "calendar")
                        .font(.footnote).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                } else if let first = plan.dates.first, let last = plan.dates.last {
                    Label(timePollDateLabel(first).replacingOccurrences(of: "\n", with: " ") + (first == last ? "" : " – " + timePollDateLabel(last).replacingOccurrences(of: "\n", with: " ")), systemImage: "calendar")
                        .font(.footnote).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                }
                if collecting {
                    Text(plan.expectedCount.map { String(format: AppLocalization.string("%d of %d people filled in their availability"), plan.respondedCount ?? 0, $0) } ?? String(format: AppLocalization.string("%d people responded"), plan.respondedCount ?? 0))
                        .font(.footnote).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    if let count = plan.expectedCount, count > 0 {
                        ProgressView(value: Double(min(plan.respondedCount ?? 0, count)), total: Double(count))
                            .tint(SideSeatTheme.Availability.selectedFill).accessibilityHidden(true)
                    }
                } else if !["CANCELLED", "EXPIRED"].contains(phase) {
                    Text(String(format: AppLocalization.string("%d of %d confirmed"), plan.acceptedCount ?? 0, plan.invitedCount ?? plan.expectedCount ?? 0))
                        .font(.footnote).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                }
                HStack {
                    Text(AppLocalization.string(action)).font(.subheadline.weight(.semibold))
                    Spacer(minLength: 8)
                    Image(systemName: "arrow.right").font(.subheadline.weight(.semibold))
                }
                .foregroundStyle(needsReply ? SideSeatTheme.ProductAction.foreground : SideSeatTheme.textPrimary)
                .padding(.horizontal, needsReply ? 12 : 0).frame(minHeight: 44)
                .background(needsReply ? SideSeatTheme.ProductAction.fill : Color.clear, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
            }
            .frame(maxWidth: .infinity, alignment: .leading).padding(SideSeatTheme.spaceMD)
            .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius))
            .contentShape(Rectangle())
        }
        .buttonStyle(SSPressButtonStyle()).accessibilityIdentifier("plans-coordinated-\(plan.token)")
        .accessibilityValue(plan.statusLabel(at: now))
    }

    private func coordinated(in section: MVPPlanSection) -> [NativeTimePollList.Item] {
        coordinatedPlans.filter { plan in
            let phase = plan.planningPhase(at: now)
            return switch section {
            case .waitingResponse: ["COLLECTING", "INVITING"].contains(phase)
            case .upcoming: phase == "CONFIRMED" && plan.isIncluded != false && (plan.chosenEnd ?? .distantPast) > now
            case .ended: ["CANCELLED", "EXPIRED"].contains(phase) || (phase == "CONFIRMED" && (plan.isIncluded == false || (plan.chosenEnd ?? .distantFuture) <= now))
            }
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

    private var overview: some View {
        let waiting = plans(in: .waitingResponse)
        let incoming = waiting.filter { $0.receiver.id == currentUserID }
        let outgoing = waiting.filter { $0.proposer.id == currentUserID }
        let upcoming = plans(in: .upcoming)
        return VStack(alignment: .leading, spacing: 24) {
            if !incoming.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    overviewHeading("Awaiting my response", count: incoming.count,
                        identifier: "plans-waiting-incoming-heading", needsAttention: true)
                    ForEach(showsAllIncoming ? incoming : Array(incoming.prefix(2))) { plan in
                        planRow(plan, section: .waitingResponse)
                    }
                    if incoming.count > 2 {
                        Button(showsAllIncoming ? "Show less" : "View all invitations") {
                            showsAllIncoming.toggle()
                        }
                        .font(.subheadline.weight(.medium))
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .accessibilityIdentifier("plans-show-all-incoming")
                    }
                }
            }

            if let next = upcoming.first {
                VStack(alignment: .leading, spacing: 10) {
                    let headerLayout = dynamicTypeSize.isAccessibilitySize
                        ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
                        : AnyLayout(HStackLayout(spacing: 8))
                    headerLayout {
                        Text(next.startDate.map { $0 <= now } == true ? "In progress" : "Next meet-up")
                            .font(.headline)
                            .accessibilityAddTraits(.isHeader)
                        if !dynamicTypeSize.isAccessibilitySize { Spacer(minLength: 8) }
                        Button {
                            selectedSection = .upcoming
                        } label: {
                            HStack(spacing: 4) {
                                Text("View all")
                                Text(upcoming.count.formatted())
                                Image(systemName: "chevron.right").font(.caption.weight(.semibold))
                            }
                            .font(.subheadline)
                            .frame(minHeight: 44)
                        }
                        .accessibilityIdentifier("plans-view-upcoming")
                    }
                    planRow(next, section: .upcoming, showsFullDate: true)
                }
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("plans-next-meetup")
            } else if !waiting.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("No confirmed meet-ups yet").font(.headline)
                    Text("Once an invitation is accepted, your next meet-up appears here.")
                        .font(.footnote)
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 8)
            } else if coordinatedPlans.isEmpty {
                emptyState(for: .waitingResponse)
            }

            if !outgoing.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Button {
                        showsOutgoing.toggle()
                    } label: {
                        HStack {
                            overviewHeading("Awaiting their response", count: outgoing.count,
                                identifier: "plans-waiting-outgoing-heading")
                            Spacer(minLength: 8)
                            Image(systemName: showsOutgoing ? "chevron.up" : "chevron.down")
                                .font(.caption.weight(.semibold))
                        }
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityValue(AppLocalization.string(showsOutgoing ? "Expanded" : "Collapsed"))
                    .accessibilityIdentifier("plans-toggle-outgoing")
                    if showsOutgoing {
                        ForEach(outgoing) { plan in planRow(plan, section: .waitingResponse) }
                    }
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(MVPPlanSection.waitingResponse.accessibilityIdentifier)
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
                .padding(.horizontal, 7)
                .padding(.vertical, 3)
                .background(needsAttention ? SideSeatTheme.ControlSelection.fill : SideSeatTheme.fillTertiary,
                    in: Capsule())
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
        case .upcoming: AppLocalization.string("No upcoming plans")
        case .ended: AppLocalization.string("No ended plans")
        }
    }

    private func sectionEmptyDescription(_ section: MVPPlanSection) -> String {
        switch section {
        case .waitingResponse: AppLocalization.string("Create a plan or open a friend’s shared link to get started.")
        case .upcoming: AppLocalization.string("Accepted plans will appear here until they finish.")
        case .ended: AppLocalization.string("Completed, declined, canceled, and expired plans will appear here.")
        }
    }

    private func planRow(
        _ plan: NativePlanRequest,
        section: MVPPlanSection,
        showsFullDate: Bool = false
    ) -> some View {
        let participant = otherParticipant(for: plan)
        let showsOutcome = plan.isOutcomeEligible()
        return SSFlowCard(contentPadding: 14, contentSpacing: SideSeatTheme.spaceSM) {
            Button {
                scrollPositions.capture(selectedSection)
                router.navigate(to: MVPPlanRoute.route(for: plan))
            } label: {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                    planTitleHeader(plan, section: section)

                    planDetails(plan, section: section, showsFullDate: showsFullDate)

                    let participantLayout = dynamicTypeSize.isAccessibilitySize
                        ? AnyLayout(VStackLayout(alignment: .leading, spacing: 6))
                        : AnyLayout(HStackLayout(spacing: SideSeatTheme.spaceSM))
                    participantLayout {
                        HStack(spacing: 6) {
                            InitialAvatar(name: participant.displayName, url: participant.avatarUrl, size: 18)
                                .accessibilityHidden(true)
                            Text(plan.status == "PENDING"
                                ? String(format: AppLocalization.string(plan.receiver.id == currentUserID
                                    ? "%@ invited you" : "You invited %@"), participant.displayName)
                                : participant.displayName)
                                .font(.footnote)
                                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        if showsStatusBadge(plan, section: section) {
                            if !dynamicTypeSize.isAccessibilitySize { Spacer(minLength: 4) }
                            Label(statusLabel(for: plan, section: section), systemImage: statusIcon(for: plan, section: section))
                                .font(.caption)
                                .foregroundStyle(statusForeground(for: plan, section: section))
                                .fixedSize(horizontal: false, vertical: true)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 3)
                                .background(statusForeground(for: plan, section: section).opacity(0.08), in: Capsule())
                        }
                    }
                    if section != .ended, plan.status == "PENDING", plan.receiver.id == currentUserID {
                        HStack {
                            Text("View and respond")
                                .font(.subheadline.weight(.semibold))
                            Spacer(minLength: 8)
                            Image(systemName: "arrow.right")
                                .font(.subheadline.weight(.semibold))
                        }
                        .foregroundStyle(SideSeatTheme.ProductAction.foreground)
                        .padding(.horizontal, 14)
                        .frame(minHeight: 44)
                        .background(SideSeatTheme.ProductAction.fill,
                            in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
                        .padding(.top, 4)
                    }
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
        }
    }

    private func planTitleHeader(_ plan: NativePlanRequest, section: MVPPlanSection) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: SideSeatTheme.spaceSM) {
            Text(plan.title)
                .font(.headline)
                .foregroundStyle(section == .ended ? SideSeatTheme.textSecondaryStrong : SideSeatTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "chevron.right")
                .font(.caption.weight(.medium))
                .foregroundStyle(SideSeatTheme.textSecondary)
                .accessibilityHidden(true)
        }
    }

    private func showsStatusBadge(_ plan: NativePlanRequest, section: MVPPlanSection) -> Bool {
        section == .ended || plan.status == "ACCEPTED" || (plan.status == "PENDING" && plan.counterOfId != nil && plan.commitmentId != nil)
    }

    @ViewBuilder
    private func planDetails(_ plan: NativePlanRequest, section: MVPPlanSection, showsFullDate: Bool) -> some View {
        let location = plan.location?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        VStack(alignment: .leading, spacing: 5) {
            if let start = plan.startDate, let end = plan.endDate {
                let time = planTimeSummary(start: start, end: end, includesDay: section != .upcoming || showsFullDate)
                let relative = section == .ended ? nil
                    : PlanRelativeTime.value(status: plan.status, start: start, end: end, now: now)?.title
                Label {
                    (Text(relative.map { "\($0) · " } ?? "").fontWeight(.semibold) + Text(time))
                        .fixedSize(horizontal: false, vertical: true)
                } icon: {
                    Image(systemName: "clock").frame(width: detailIconWidth)
                }
                .foregroundStyle(section == .ended ? SideSeatTheme.textSecondaryStrong : SideSeatTheme.textPrimary)
            }
            if !location.isEmpty {
                Label {
                    Text(location).fixedSize(horizontal: false, vertical: true)
                } icon: {
                    Image(systemName: "mappin.and.ellipse").frame(width: detailIconWidth)
                }
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
            }
        }
        .font(.subheadline)
    }

    private func planDaySummary(_ date: Date) -> String {
        let calendar = Calendar.autoupdatingCurrent
        let locale = AppLocalization.selectedLanguage.locale
        if calendar.component(.year, from: date) == calendar.component(.year, from: now) {
            return date.formatted(.dateTime.month(.abbreviated).day().weekday(.abbreviated).locale(locale))
        }
        return date.formatted(.dateTime.year().month(.abbreviated).day().locale(locale))
    }

    private func planTimeSummary(start: Date, end: Date, includesDay: Bool) -> String {
        let calendar = Calendar.autoupdatingCurrent
        let locale = AppLocalization.selectedLanguage.locale
        let startTime = start.formatted(.dateTime.hour().minute().locale(locale))
        let endTime = end.formatted(.dateTime.hour().minute().locale(locale))
        if calendar.isDate(start, inSameDayAs: end) {
            let prefix = includesDay ? "\(planDaySummary(start)) · " : ""
            return "\(prefix)\(startTime)–\(endTime)"
        }
        return "\(planDaySummary(start)) \(startTime) – \(planDaySummary(end)) \(endTime)"
    }

    private func statusLabel(
        for plan: NativePlanRequest,
        section: MVPPlanSection
    ) -> String {
        if plan.status == "PENDING", (plan.startDate ?? .distantPast) <= now { return AppLocalization.string("Expired") }
        if section == .ended, plan.status == "ACCEPTED" {
            return AppLocalization.string("Ended")
        }
        if plan.status == "PENDING", plan.counterOfId != nil, plan.commitmentId != nil {
            return AppLocalization.string("Reschedule proposed")
        }
        switch plan.status {
        case "PENDING":
            return plan.receiver.id == currentUserID
                ? AppLocalization.string("Your confirmation needed")
                : AppLocalization.string("Waiting for response")
        case "ACCEPTED": return AppLocalization.string("Confirmed")
        case "DECLINED": return AppLocalization.string("Declined")
        case "COUNTER_PROPOSED": return AppLocalization.string("Superseded")
        case "CANCELED": return AppLocalization.string("Canceled")
        case "EXPIRED": return AppLocalization.string("Expired")
        case "INVALIDATED": return AppLocalization.string("Ended")
        default: return AppLocalization.string("Ended")
        }
    }

    private func statusIcon(
        for plan: NativePlanRequest,
        section: MVPPlanSection
    ) -> String {
        if plan.status == "PENDING", (plan.startDate ?? .distantPast) <= now { return "clock.badge.exclamationmark" }
        if section == .ended, plan.status == "ACCEPTED" {
            return "clock.arrow.circlepath"
        }
        if plan.status == "ACCEPTED" { return "checkmark.circle.fill" }
        if plan.status == "PENDING" {
            return plan.receiver.id == currentUserID ? "envelope.badge" : "hourglass"
        }
        switch plan.status {
        case "DECLINED": return "xmark.circle"
        case "CANCELED": return "calendar.badge.minus"
        case "EXPIRED": return "clock.badge.exclamationmark"
        default: return "clock.arrow.circlepath"
        }
    }

    private func statusForeground(
        for plan: NativePlanRequest,
        section: MVPPlanSection
    ) -> Color {
        if section == .ended { return SideSeatTheme.textSecondaryStrong }
        if plan.status == "ACCEPTED" { return SideSeatTheme.statusSuccessText }
        if section != .ended, plan.status == "PENDING", plan.receiver.id == currentUserID {
            return SideSeatTheme.statusWarningText
        }
        if plan.status == "DECLINED" || plan.status == "CANCELED" {
            return SideSeatTheme.statusDangerText
        }
        return SideSeatTheme.textSecondaryStrong
    }

    private func otherParticipant(for plan: NativePlanRequest) -> NativePlanAuthor {
        plan.proposer.id == currentUserID ? plan.receiver : plan.proposer
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
