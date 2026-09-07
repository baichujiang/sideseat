import SwiftUI

enum MVPPlanSection: String, CaseIterable, Equatable, Sendable {
    case needsResponse
    case upcoming
    case proposed
    case pastEnded

    static let ordered: [MVPPlanSection] = [
        .needsResponse,
        .upcoming,
        .proposed,
        .pastEnded,
    ]

    var title: String {
        switch self {
        case .needsResponse: "Needs your response"
        case .upcoming: "Upcoming"
        case .proposed: "Proposed"
        case .pastEnded: "Past & Ended"
        }
    }

    var systemImage: String {
        switch self {
        case .needsResponse: "envelope.badge"
        case .upcoming: "calendar.badge.checkmark"
        case .proposed: "hourglass"
        case .pastEnded: "clock.arrow.circlepath"
        }
    }

    var accessibilityIdentifier: String {
        switch self {
        case .needsResponse: "plans-section-needs-response"
        case .upcoming: "plans-section-upcoming"
        case .proposed: "plans-section-proposed"
        case .pastEnded: "plans-section-past-ended"
        }
    }

    static func classify(
        _ plan: NativePlanRequest,
        currentUserID: String,
        now: Date
    ) -> MVPPlanSection {
        if plan.status == "PENDING", plan.receiver.id == currentUserID {
            return .needsResponse
        }
        if plan.status == "ACCEPTED", (plan.endDate ?? .distantFuture) > now {
            return .upcoming
        }
        if plan.status == "PENDING" {
            return .proposed
        }
        return .pastEnded
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

    var body: some View {
        Group {
            if (!store.hasLoaded || store.isLoading) && store.plans.isEmpty {
                SSLoadingState("Loading plans")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let issue = store.issue, store.plans.isEmpty {
                ContentUnavailableView {
                    Label("Plans unavailable", systemImage: "calendar.badge.exclamationmark")
                } description: {
                    Text(issue)
                } actions: {
                    Button("Try again") { Task { await store.load(using: session) } }
                }
            } else if store.plans.isEmpty {
                SSEmptyState(
                    title: "No plans yet",
                    systemImage: "calendar",
                    description: "Proposed and confirmed Plans will appear here."
                )
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: SideSeatTheme.spaceXL) {
                        if let issue = store.issue {
                            Label(issue, systemImage: "wifi.exclamationmark")
                                .font(.footnote)
                                .foregroundStyle(SideSeatTheme.danger)
                                .padding(SideSeatTheme.spaceMD)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(
                                    SideSeatTheme.danger.opacity(0.08),
                                    in: RoundedRectangle(
                                        cornerRadius: SideSeatTheme.controlRadius,
                                        style: .continuous
                                    )
                                )
                                .accessibilityIdentifier("plans-issue-banner")
                        }

                        ForEach(MVPPlanSection.ordered, id: \.self) { section in
                            let plans = plans(in: section)
                            if !plans.isEmpty {
                                planSection(section, plans: plans)
                            }
                        }
                    }
                    .padding(.horizontal, SideSeatTheme.screenHorizontal)
                    .padding(.top, SideSeatTheme.spaceLG)
                    .padding(.bottom, 112)
                }
                .background(SideSeatTheme.bgGrouped)
            }
        }
        .navigationTitle("Plans")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await store.load(using: session) }
        .task { await store.load(using: session) }
        .onReceive(NotificationCenter.default.publisher(for: .sideSeatPlansNeedsRefresh)) { _ in
            Task { await store.load(using: session) }
        }
        .accessibilityIdentifier("plans-root")
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
        case .pastEnded:
            return filtered.sorted {
                ($0.endDate ?? .distantPast) > ($1.endDate ?? .distantPast)
            }
        case .needsResponse, .upcoming, .proposed:
            return filtered.sorted {
                ($0.startDate ?? .distantFuture) < ($1.startDate ?? .distantFuture)
            }
        }
    }

    private func planSection(
        _ section: MVPPlanSection,
        plans: [NativePlanRequest]
    ) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            SSProductSectionHeader(title: section.title)
                .accessibilityIdentifier(section.accessibilityIdentifier)
                .accessibilityValue("\(plans.count)")

            ForEach(plans) { plan in
                planRow(plan, section: section)
            }
        }
    }

    private func planRow(
        _ plan: NativePlanRequest,
        section: MVPPlanSection
    ) -> some View {
        VStack(spacing: SideSeatTheme.spaceSM) {
            Button {
                router.navigate(to: MVPPlanRoute.route(for: plan))
            } label: {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                HStack(alignment: .firstTextBaseline, spacing: SideSeatTheme.spaceSM) {
                    Label(statusLabel(for: plan, section: section), systemImage: statusIcon(for: plan, section: section))
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(statusForeground(for: plan, section: section))

                    Spacer(minLength: SideSeatTheme.spaceSM)

                    if !dynamicTypeSize.isAccessibilitySize {
                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                            .accessibilityHidden(true)
                    }
                }

                Text(plan.title)
                    .font(.headline)
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)

                if let start = plan.startDate, let end = plan.endDate {
                    planDateDetails(start: start, end: end)
                }

                if let location = plan.location?.trimmingCharacters(in: .whitespacesAndNewlines),
                   !location.isEmpty {
                    Label(location, systemImage: "mappin.and.ellipse")
                        .font(.footnote)
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if plan.counterOfId != nil, plan.commitmentId != nil, plan.status == "PENDING" {
                    Label(
                        "Your confirmed Plan stays in place until this new time is accepted.",
                        systemImage: "calendar.badge.clock"
                    )
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(SideSeatTheme.spaceMD)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        SideSeatTheme.fillTertiary,
                        in: RoundedRectangle(
                            cornerRadius: SideSeatTheme.controlRadius,
                            style: .continuous
                        )
                    )
                    .accessibilityIdentifier("plans-reschedule-keeps-confirmed-\(plan.id)")
                }

                if let note = plan.message?.trimmingCharacters(in: .whitespacesAndNewlines),
                   !note.isEmpty {
                    Text(note)
                        .font(.footnote)
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 3)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Divider()

                HStack(spacing: SideSeatTheme.spaceMD) {
                    let participant = otherParticipant(for: plan)
                    InitialAvatar(
                        name: participant.displayName,
                        url: participant.avatarUrl,
                        size: 36
                    )
                    VStack(alignment: .leading, spacing: 2) {
                        Text(participant.displayName)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(SideSeatTheme.textPrimary)
                        Text("Manage in conversation")
                            .font(.caption)
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "bubble.left.and.bubble.right")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.HubTint.plans)
                        .frame(width: 36, height: 36)
                        .background(SideSeatTheme.HubTint.plans.opacity(0.12), in: Circle())
                        .accessibilityHidden(true)
                }
                }
                .padding(SideSeatTheme.spaceLG)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    SideSeatTheme.surface,
                    in: RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius, style: .continuous)
                )
                .overlay {
                    RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius, style: .continuous)
                        .strokeBorder(SideSeatTheme.separator.opacity(0.65), lineWidth: 0.5)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(SSPressButtonStyle())
            .accessibilityIdentifier("plans-row-\(plan.id)")
            .accessibilityValue(statusLabel(for: plan, section: section))
            .accessibilityHint("Open Plan in conversation")

            if plan.isOutcomeEligible() {
                PlanOutcomePromptView(
                    plan: plan,
                    isSubmitting: store.mutatingOutcomeID == plan.id
                ) { value in
                    Task {
                        await store.recordOutcome(value, for: plan.id, using: session)
                    }
                }
                .padding(SideSeatTheme.spaceLG)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    SideSeatTheme.surface,
                    in: RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius, style: .continuous)
                )
                .overlay {
                    RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius, style: .continuous)
                        .strokeBorder(SideSeatTheme.separator.opacity(0.65), lineWidth: 0.5)
                }
            }
        }
    }

    @ViewBuilder
    private func planDateDetails(start: Date, end: Date) -> some View {
        let calendar = Calendar.autoupdatingCurrent
        if calendar.isDate(start, inSameDayAs: end) {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                Label(
                    start.formatted(date: .abbreviated, time: .omitted),
                    systemImage: "calendar"
                )
                Label(
                    "\(start.formatted(date: .omitted, time: .shortened)) – \(end.formatted(date: .omitted, time: .shortened))",
                    systemImage: "clock"
                )
            }
            .font(.footnote)
            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
        } else {
            Label(
                "\(start.formatted(date: .abbreviated, time: .shortened)) – \(end.formatted(date: .abbreviated, time: .shortened))",
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
        if plan.status == "PENDING", plan.counterOfId != nil, plan.commitmentId != nil {
            return AppLocalization.string("Reschedule proposed")
        }
        switch plan.status {
        case "PENDING":
            return section == .needsResponse
                ? AppLocalization.string("Needs your response")
                : AppLocalization.string("Proposed")
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
        if plan.status == "ACCEPTED" { return "checkmark.circle.fill" }
        if plan.status == "PENDING" {
            return section == .needsResponse ? "envelope.badge" : "hourglass"
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
        if plan.status == "ACCEPTED" { return SideSeatTheme.statusSuccessText }
        if plan.status == "PENDING", section == .needsResponse {
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
