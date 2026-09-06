import SwiftUI

struct ContactsView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    @State private var store = ContactsStore()

    var body: some View {
        Group {
            if (!store.hasLoaded || store.isLoading) && store.contacts.isEmpty {
                SSLoadingState("Loading contacts")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if store.contacts.isEmpty {
                SSEmptyState(
                    title: "No connections yet",
                    systemImage: "person.2",
                    description: "People appear here after you both choose to do something together."
                )
            } else {
                List {
                    Section("Connections") {
                        ForEach(store.contacts) { row in
                            Button {
                                router.navigate(to: .directChat(connectionID: row.connectionId))
                            } label: {
                                HStack(spacing: 12) {
                                    InitialAvatar(name: row.displayName)
                                        .frame(width: 40, height: 40)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(row.displayName)
                                            .font(.body.weight(.semibold))
                                            .foregroundStyle(.primary)
                                        Text("@\(row.peer.username)")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                        if let course = row.courseName, !course.isEmpty {
                                            Text(course)
                                                .font(.caption)
                                                .foregroundStyle(.secondary)
                                        }
                                    }
                                }
                            }
                            .buttonStyle(SSPressButtonStyle())
                            .accessibilityIdentifier("contact-row-\(row.connectionId)")
                        }
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
        .background(SideSeatTheme.bgGrouped)
        .navigationTitle("Contacts")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await store.load(using: session)
        }
        .accessibilityIdentifier("contacts-root")
        .overlay(alignment: .bottom) {
            if let issue = store.issue {
                Text(issue)
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.danger)
                    .padding()
            }
        }
    }

}
