import SwiftUI

struct PlansRootView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
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
                    description: "Accepted plans and invitations will appear here."
                )
            } else {
                List {
                    if !needsResponse.isEmpty {
                        Section("Needs your response") {
                            ForEach(needsResponse) { plan in
                                planRow(plan)
                            }
                        }
                    }

                    if !waitingForResponse.isEmpty {
                        Section("Waiting for response") {
                            ForEach(waitingForResponse) { plan in
                                planRow(plan)
                            }
                        }
                    }

                    if !upcoming.isEmpty {
                        Section("Upcoming") {
                            ForEach(upcoming) { plan in
                                planRow(plan)
                            }
                        }
                    }
                }
                .listStyle(.plain)
                .accessibilityIdentifier("plans-list")
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

    private var needsResponse: [NativePlanRequest] {
        store.plans.filter { $0.isPending && $0.receiver.id == currentUserID }
    }

    private var waitingForResponse: [NativePlanRequest] {
        store.plans.filter { $0.isPending && $0.proposer.id == currentUserID }
    }

    private var upcoming: [NativePlanRequest] {
        store.plans.filter(\.isAccepted)
    }

    private func planRow(_ plan: NativePlanRequest) -> some View {
        Button {
            router.navigate(to: .directChat(connectionID: plan.connectionId))
        } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: plan.isAccepted ? "calendar.badge.checkmark" : "calendar.badge.clock")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(plan.isAccepted ? SideSeatTheme.success : SideSeatTheme.warning)
                    .frame(width: 34, height: 34)
                    .background(
                        (plan.isAccepted ? SideSeatTheme.success : SideSeatTheme.warning).opacity(0.12),
                        in: Circle()
                    )

                VStack(alignment: .leading, spacing: 5) {
                    Text(plan.title)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.primary)

                    if let start = plan.startDate, let end = plan.endDate {
                        Text("\(start.formatted(date: .abbreviated, time: .shortened)) – \(end.formatted(date: .omitted, time: .shortened))")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }

                    Label(otherParticipant(for: plan).displayName, systemImage: "person")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    if let location = plan.location?.trimmingCharacters(in: .whitespacesAndNewlines),
                       !location.isEmpty {
                        Label(location, systemImage: "mappin.and.ellipse")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Spacer(minLength: 4)
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
                    .padding(.top, 10)
            }
            .padding(.vertical, 5)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("plans-row-\(plan.id)")
    }

    private func otherParticipant(for plan: NativePlanRequest) -> NativePlanAuthor {
        plan.proposer.id == currentUserID ? plan.receiver : plan.proposer
    }
}
