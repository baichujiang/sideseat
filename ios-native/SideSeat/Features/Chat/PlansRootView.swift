import SwiftUI

enum MVPPlanSection: String, CaseIterable, Equatable, Sendable, Identifiable {
    case waitingResponse
    case upcoming
    case ended

    static let ordered: [MVPPlanSection] = [.waitingResponse, .upcoming, .ended]

    var id: String { rawValue }

    var title: String {
        switch self {
        case .waitingResponse: AppLocalization.string("Waiting")
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
        if plan.status == "PENDING" {
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
                }
                .accessibilityIdentifier("plans-scroll-\(section.rawValue)")
                .refreshable { await store.load(using: session) }
            }
        }
        .background(SideSeatTheme.bgGrouped)
        .ssRootNavigationTitle("Plans")
        .task { if !store.hasLoaded { await store.load(using: session) } }
        .onReceive(NotificationCenter.default.publisher(for: .sideSeatPlansNeedsRefresh)) { _ in
            Task { await store.load(using: session) }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("plans-root")
    }

    @ViewBuilder
    private var sectionPicker: some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(spacing: SideSeatTheme.spaceXS) {
                ForEach(MVPPlanSection.ordered) { section in
                    Button { selectedSection = section } label: {
                        HStack {
                            Text(section.title).font(.body.weight(.semibold))
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: SideSeatTheme.spaceSM)
                            if section == selectedSection { Image(systemName: "checkmark").accessibilityHidden(true) }
                        }
                        .padding(.horizontal, SideSeatTheme.spaceMD)
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .background(selectedSection == section ? SideSeatTheme.surface : Color.clear,
                            in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(section == selectedSection ? .isSelected : [])
                    .accessibilityIdentifier("plans-tab-\(section.rawValue)")
                }
            }
            .accessibilityElement(children: .contain)
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
            if visiblePlans.isEmpty { emptyState(for: section) }
            else {
                LazyVStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                    ForEach(visiblePlans) { plan in planRow(plan, section: section) }
                }
                .accessibilityIdentifier(section.accessibilityIdentifier)
                .accessibilityValue("\(visiblePlans.count)")
            }
        }
    }

    private var currentUserID: String {
        session.currentUser?.id ?? ""
    }

    private func plans(in section: MVPPlanSection) -> [NativePlanRequest] {
        let now = Date()
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
        .accessibilityIdentifier("plans-empty-\(section.rawValue)")
    }

    private func sectionEmptyTitle(_ section: MVPPlanSection) -> String {
        switch section {
        case .waitingResponse: AppLocalization.string("No plans waiting for a response")
        case .upcoming: AppLocalization.string("No upcoming plans")
        case .ended: AppLocalization.string("No ended plans")
        }
    }

    private func sectionEmptyDescription(_ section: MVPPlanSection) -> String {
        switch section {
        case .waitingResponse: AppLocalization.string("New proposals and time changes will appear here until someone responds.")
        case .upcoming: AppLocalization.string("Accepted plans will appear here until they finish.")
        case .ended: AppLocalization.string("Completed, declined, canceled, and expired plans will appear here.")
        }
    }

    private func planRow(
        _ plan: NativePlanRequest,
        section: MVPPlanSection
    ) -> some View {
        SSFlowCard {
            Button {
                router.navigate(to: MVPPlanRoute.route(for: plan))
            } label: {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                    HStack(alignment: .top, spacing: SideSeatTheme.spaceSM) {
                        SSFlowCardHeader(
                            title: plan.title,
                            subtitle: statusLabel(for: plan, section: section),
                            systemImage: statusIcon(for: plan, section: section),
                            tint: statusForeground(for: plan, section: section)
                        )
                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(SideSeatTheme.textSecondary)
                            .padding(.top, SideSeatTheme.spaceMD)
                            .accessibilityHidden(true)
                    }

                    if let start = plan.startDate, let end = plan.endDate {
                        planDateDetails(start: start, end: end)
                    }
                    if let location = plan.location?.trimmingCharacters(in: .whitespacesAndNewlines),
                        !location.isEmpty
                    {
                        Label(location, systemImage: "mappin.and.ellipse")
                            .font(.footnote)
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    if plan.counterOfId != nil, plan.commitmentId != nil, plan.status == "PENDING" {
                        SSFlowNotice(
                            text: AppLocalization.string(
                                "Your confirmed Plan stays in place until this new time is accepted."),
                            systemImage: "calendar.badge.clock"
                        )
                        .accessibilityIdentifier("plans-reschedule-keeps-confirmed-\(plan.id)")
                    }

                    HStack(spacing: SideSeatTheme.spaceSM) {
                        let participant = otherParticipant(for: plan)
                        InitialAvatar(name: participant.displayName, url: participant.avatarUrl, size: 32)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(participant.displayName)
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(SideSeatTheme.textPrimary)
                            Text("Manage in conversation")
                                .font(.caption)
                                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "bubble.left.and.bubble.right")
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                            .accessibilityHidden(true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(SSPressButtonStyle())
            .accessibilityIdentifier("plans-row-\(plan.id)")
            .accessibilityValue(statusLabel(for: plan, section: section))
            .accessibilityHint("Open Plan in conversation")

            if plan.isOutcomeEligible() {
                Divider()
                PlanOutcomePromptView(
                    plan: plan,
                    isSubmitting: store.mutatingOutcomeID == plan.id
                ) { value in
                    Task {
                        await store.recordOutcome(value, for: plan.id, using: session)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func planDateDetails(start: Date, end: Date) -> some View {
        let calendar = Calendar.autoupdatingCurrent
        let locale = AppLocalization.selectedLanguage.locale
        if calendar.isDate(start, inSameDayAs: end) {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                Label(
                    start.formatted(.dateTime.year().month(.abbreviated).day().locale(locale)),
                    systemImage: "calendar"
                )
                Label(
                    "\(start.formatted(.dateTime.hour().minute().locale(locale))) – \(end.formatted(.dateTime.hour().minute().locale(locale)))",
                    systemImage: "clock"
                )
            }
            .font(.footnote)
            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
        } else {
            Label(
                "\(start.formatted(.dateTime.year().month(.abbreviated).day().hour().minute().locale(locale))) – \(end.formatted(.dateTime.year().month(.abbreviated).day().hour().minute().locale(locale)))",
                systemImage: "calendar"
            )
            .font(.footnote)
            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func statusLabel(
        for plan: NativePlanRequest,
        section: MVPPlanSection
    ) -> String {
        if section == .ended, plan.status == "ACCEPTED" {
            return AppLocalization.string(plan.viewerOutcome == nil ? "Private response" : "Ended")
        }
        if plan.status == "PENDING", plan.counterOfId != nil, plan.commitmentId != nil {
            return AppLocalization.string("Reschedule proposed")
        }
        switch plan.status {
        case "PENDING":
            return plan.receiver.id == currentUserID
                ? AppLocalization.string("Needs your response")
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
        if section == .ended, plan.status == "ACCEPTED" {
            return plan.viewerOutcome == nil ? "lock" : "clock.arrow.circlepath"
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
        if plan.status == "PENDING", plan.receiver.id == currentUserID {
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
