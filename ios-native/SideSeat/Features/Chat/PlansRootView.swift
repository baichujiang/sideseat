import SwiftUI

struct PlansRootView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    @State private var store = PlansStore()

    var body: some View {
        Group {
            if store.isLoading && store.plans.isEmpty {
                ProgressView("Loading plans")
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
                    title: "No plans waiting",
                    systemImage: "calendar",
                    description: "When someone invites you, it shows up here."
                )
            } else {
                List(store.plans) { plan in
                    Button {
                        router.navigate(to: .directChat(connectionID: plan.connectionId))
                    } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(plan.title)
                                .font(.body.weight(.semibold))
                                .foregroundStyle(.primary)
                            if let start = plan.startDate, let end = plan.endDate {
                                Text("\(start.formatted(date: .abbreviated, time: .shortened)) – \(end.formatted(date: .omitted, time: .shortened))")
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                            Text("From \(plan.proposer.displayName)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            if let location = plan.location?.trimmingCharacters(in: .whitespacesAndNewlines),
                               !location.isEmpty {
                                Text(location)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .accessibilityIdentifier("plans-row-\(plan.id)")
                }
                .listStyle(.plain)
                .accessibilityIdentifier("plans-list")
            }
        }
        .navigationTitle("Plans")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await store.load(using: session) }
        .task { await store.load(using: session) }
        .accessibilityIdentifier("plans-root")
    }
}
