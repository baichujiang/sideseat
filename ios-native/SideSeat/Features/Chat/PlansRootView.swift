import SwiftUI

struct PlansRootView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var store = PlansStore()
    @State private var v2Store = ActionToPlanV2Store.shared
    @State private var smallGroupStore = SmallGroupPilotStore()

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
                    description: "Accepted plans and invitations will appear here."
                )
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: SideSeatTheme.spaceXL) {
                        if !dynamicTypeSize.isAccessibilitySize {
                            plansOverview
                        }

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

                        if !smallGroupStore.opportunities.isEmpty {
                            smallGroupSection
                        }

                        if !needsResponse.isEmpty {
                            planSection(
                                title: "Needs your response",
                                systemImage: "envelope.badge",
                                plans: needsResponse,
                                identifier: "plans-section-needs-response"
                            )
                        }

                        if !waitingForResponse.isEmpty {
                            planSection(
                                title: "Waiting for response",
                                systemImage: "hourglass",
                                plans: waitingForResponse,
                                identifier: "plans-section-waiting"
                            )
                        }

                        if !upcoming.isEmpty {
                            planSection(
                                title: "Upcoming",
                                systemImage: "calendar.badge.checkmark",
                                plans: upcoming,
                                identifier: "plans-section-upcoming"
                            )
                        }

                        if !needsOutcome.isEmpty {
                            outcomeSection
                        }
                    }
                    .padding(.horizontal, SideSeatTheme.screenHorizontal)
                    .padding(.top, SideSeatTheme.spaceSM)
                    .padding(.bottom, 112)
                }
                .background(SideSeatTheme.bgGrouped)
            }
        }
        .navigationTitle("Plans")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await store.load(using: session) }
        .task {
            async let planLoad: Void = store.load(using: session)
            await v2Store.loadAssignment(using: session)
            if v2Store.assignment?.features["v2SmallGroupPilot"] == true {
                await smallGroupStore.load(using: session)
            }
            await planLoad
        }
        .onReceive(NotificationCenter.default.publisher(for: .sideSeatPlansNeedsRefresh)) { _ in
            Task { await store.load(using: session) }
        }
        .accessibilityIdentifier("plans-root")
    }

    private var currentUserID: String {
        session.currentUser?.id ?? ""
    }

    private var needsResponse: [NativePlanRequest] {
        store.plans.filter { $0.isPending && $0.receiver.id == currentUserID }
    }

    private var waitingForResponse: [NativePlanRequest] {
        store.plans.filter { $0.isPending && $0.proposer.id == currentUserID }
    }

    private var upcoming: [NativePlanRequest] {
        store.plans.filter { $0.isAccepted && ($0.endDate ?? .distantFuture) > Date() }
    }

    private var needsOutcome: [NativePlanRequest] {
        store.plans.filter {
            $0.isAccepted && ($0.endDate ?? .distantFuture) <= Date() && $0.viewerOutcome == nil
        }
    }

    private var smallGroupSection: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            Label("Small group pilot", systemImage: "person.3.fill")
                .font(.headline)
                .foregroundStyle(SideSeatTheme.textPrimary)
            ForEach(smallGroupStore.opportunities) { opportunity in
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                    Text(opportunity.title).font(.headline)
                    if let description = opportunity.description, !description.isEmpty {
                        Text(description).font(.footnote).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    }
                    Label(opportunity.limitedSignals.sharedLanguages.joined(separator: " · "), systemImage: "character.bubble")
                        .font(.footnote)
                    if let groupChatID = opportunity.groupChatId {
                        Button("Open group chat") { router.navigate(to: .groupChat(groupChatID: groupChatID)) }
                            .buttonStyle(.borderedProminent)
                    } else {
                        HStack {
                            Button("I'm interested") {
                                Task {
                                    if let groupChatID = await smallGroupStore.respond("INTERESTED", to: opportunity, using: session) {
                                        router.navigate(to: .groupChat(groupChatID: groupChatID))
                                    }
                                }
                            }
                            .buttonStyle(.borderedProminent)
                            Button("Not this time") {
                                Task { _ = await smallGroupStore.respond("DECLINED", to: opportunity, using: session) }
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                }
                .padding(SideSeatTheme.spaceLG)
                .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius))
                .accessibilityIdentifier("small-group-opportunity-\(opportunity.id)")
            }
        }
    }

    private var outcomeSection: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            Label("Did it happen?", systemImage: "checkmark.bubble")
                .font(.headline)
                .foregroundStyle(SideSeatTheme.textPrimary)
            ForEach(needsOutcome) { plan in
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                    Text(plan.title).font(.headline)
                    Text("A quick private response helps evaluate whether SideSeat creates real plans.")
                        .font(.footnote)
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    ViewThatFits(in: .horizontal) {
                        HStack { outcomeButtons(plan) }
                        VStack { outcomeButtons(plan) }
                    }
                }
                .padding(SideSeatTheme.spaceLG)
                .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius))
                .accessibilityIdentifier("plan-outcome-\(plan.id)")
            }
        }
    }

    @ViewBuilder
    private func outcomeButtons(_ plan: NativePlanRequest) -> some View {
        Button("Happened") { Task { await store.recordOutcome("OCCURRED", for: plan.id, using: session) } }
            .buttonStyle(.borderedProminent)
        Button("Didn't happen") { Task { await store.recordOutcome("DID_NOT_OCCUR", for: plan.id, using: session) } }
            .buttonStyle(.bordered)
        Button("Skip") { Task { await store.recordOutcome("PREFER_NOT_TO_SAY", for: plan.id, using: session) } }
            .buttonStyle(.plain)

    }

    @ViewBuilder
    private var plansOverview: some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
                    overviewIcon
                    Text("Review invitations and schedule updates")
                        .font(.headline)
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("plans-overview")
                }
                responseCountSummary
            }
            .plansOverviewCard()
        } else {
            HStack(spacing: SideSeatTheme.spaceMD) {
                overviewIcon
                Text("Review invitations and schedule updates")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("plans-overview")
                Spacer(minLength: SideSeatTheme.spaceSM)
                responseCountSummary
            }
            .plansOverviewCard()
        }
    }

    private var overviewIcon: some View {
        Image(systemName: "calendar.badge.clock")
            .symbolRenderingMode(.hierarchical)
            .font(.system(size: 19, weight: .semibold))
            .foregroundStyle(SideSeatTheme.HubTint.plans)
            .frame(width: 44, height: 44)
            .background(
                SideSeatTheme.HubTint.plans.opacity(0.12),
                in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
            )
            .accessibilityHidden(true)
    }

    private var responseCountSummary: some View {
        HStack(alignment: .firstTextBaseline, spacing: SideSeatTheme.spaceSM) {
            Text("\(needsResponse.count)")
                .font(.title2.weight(.bold))
                .foregroundStyle(SideSeatTheme.statusWarningText)
                .accessibilityIdentifier("plans-needs-response-count")
            Text("Needs your response")
                .font(.caption.weight(.semibold))
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func planSection(
        title: LocalizedStringKey,
        systemImage: String,
        plans: [NativePlanRequest],
        identifier: String
    ) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            HStack(spacing: SideSeatTheme.spaceSM) {
                Image(systemName: systemImage)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(sectionTint(for: plans))
                    .accessibilityHidden(true)
                Text(title)
                    .font(.headline)
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier(identifier)
                    .accessibilityValue("\(plans.count)")
                Spacer(minLength: SideSeatTheme.spaceSM)
                Text("\(plans.count)")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(sectionTint(for: plans))
                    .padding(.horizontal, SideSeatTheme.spaceSM)
                    .frame(minWidth: 28, minHeight: 28)
                    .background(sectionFill(for: plans), in: Capsule())
                    .accessibilityHidden(true)
            }

            ForEach(plans) { plan in
                planRow(plan)
            }
        }
    }

    private func planRow(_ plan: NativePlanRequest) -> some View {
        Button {
            router.navigate(
                to: .directChat(
                    connectionID: plan.connectionId,
                    focus: .plan(id: plan.id)
                )
            )
        } label: {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                    HStack(alignment: .firstTextBaseline, spacing: SideSeatTheme.spaceSM) {
                        Text(plan.title)
                            .font(.headline)
                            .foregroundStyle(SideSeatTheme.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)

                        Spacer(minLength: SideSeatTheme.spaceSM)

                        if !dynamicTypeSize.isAccessibilitySize {
                            Image(systemName: "chevron.right")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                                .accessibilityHidden(true)
                        }
                    }

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
                }

                if let note = plan.message?.trimmingCharacters(in: .whitespacesAndNewlines),
                   !note.isEmpty {
                    Label(note, systemImage: "text.quote")
                        .font(.footnote)
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 3)
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
                            .fixedSize(horizontal: false, vertical: true)
                        Text("Open chat")
                            .font(.caption)
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "bubble.left.and.bubble.right")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.HubTint.plans)
                        .frame(width: 36, height: 36)
                        .background(
                            SideSeatTheme.HubTint.plans.opacity(0.12),
                            in: Circle()
                        )
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
        .accessibilityValue(Text(statusTitle(for: plan)))
        .accessibilityHint("Open chat")
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
            Label {
                Text(
                    "\(start.formatted(date: .abbreviated, time: .shortened)) – \(end.formatted(date: .abbreviated, time: .shortened))"
                )
            } icon: {
                Image(systemName: "calendar")
            }
            .font(.footnote)
            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func statusTitle(for plan: NativePlanRequest) -> LocalizedStringKey {
        if plan.isAccepted { return "Upcoming" }
        if plan.receiver.id == currentUserID { return "Needs your response" }
        return "Waiting for response"
    }

    private func statusForeground(for plan: NativePlanRequest) -> Color {
        if plan.isAccepted { return SideSeatTheme.statusSuccessText }
        if plan.receiver.id == currentUserID { return SideSeatTheme.statusWarningText }
        return SideSeatTheme.textSecondaryStrong
    }

    private func statusFill(for plan: NativePlanRequest) -> Color {
        if plan.isAccepted { return SideSeatTheme.success.opacity(0.12) }
        if plan.receiver.id == currentUserID { return SideSeatTheme.warning.opacity(0.14) }
        return SideSeatTheme.fillTertiary
    }

    private func sectionTint(for plans: [NativePlanRequest]) -> Color {
        guard let plan = plans.first else { return SideSeatTheme.textSecondaryStrong }
        return statusForeground(for: plan)
    }

    private func sectionFill(for plans: [NativePlanRequest]) -> Color {
        guard let plan = plans.first else { return SideSeatTheme.fillTertiary }
        return statusFill(for: plan)
    }

    private func otherParticipant(for plan: NativePlanRequest) -> NativePlanAuthor {
        plan.proposer.id == currentUserID ? plan.receiver : plan.proposer
    }
}

private extension View {
    func plansOverviewCard() -> some View {
        padding(SideSeatTheme.spaceLG)
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
