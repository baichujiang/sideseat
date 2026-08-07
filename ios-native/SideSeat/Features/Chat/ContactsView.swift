import SwiftUI

struct ContactsView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    @State private var store = ContactsStore()
    @FocusState private var searchFocused: Bool

    private var trimmedQuery: String {
        store.searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var isSearchingPeople: Bool {
        trimmedQuery.count >= 2
    }

    var body: some View {
        @Bindable var store = store
        VStack(spacing: 0) {
            searchField
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(SideSeatTheme.bg)

            Divider()

            Group {
                if store.isLoading && store.contacts.isEmpty && !isSearchingPeople {
                    SSLoadingState("Loading contacts")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if isSearchingPeople {
                    searchResults
                } else if store.contacts.isEmpty {
                    SSEmptyState(
                        title: "Add friend",
                        systemImage: ChatCreationSymbol.addFriend,
                        description: "Search by username or nickname to start a chat."
                    )
                } else {
                    List {
                        Section("Close friends") {
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
                                .buttonStyle(.plain)
                                .accessibilityIdentifier("contact-row-\(row.connectionId)")
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                }
            }
        }
        .background(SideSeatTheme.bgGrouped)
        .navigationTitle("Add friend")
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: store.searchQuery) { _, _ in
            Task { await store.search(using: session) }
        }
        .task {
            await store.load(using: session)
            searchFocused = true
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

    private var searchField: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
            TextField("Username or nickname", text: $store.searchQuery)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .focused($searchFocused)
                .submitLabel(.search)
                .accessibilityIdentifier("contacts-search-field")
            if !store.searchQuery.isEmpty {
                Button {
                    store.searchQuery = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.tertiary)
                }
                .accessibilityLabel(String(localized: "Clear"))
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(SideSeatTheme.Chat.controlFill, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous))
    }

    @ViewBuilder
    private var searchResults: some View {
        if store.isSearching && store.searchHits.isEmpty {
            SSLoadingState("Searching")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if store.searchHits.isEmpty {
            SSEmptyState(
                title: "No people found",
                systemImage: "magnifyingglass",
                description: "Try another username or nickname."
            )
        } else {
            List {
                Section("Search results") {
                    ForEach(store.searchHits) { hit in
                        contactSearchRow(hit)
                    }
                }
            }
            .listStyle(.insetGrouped)
        }
    }

    @ViewBuilder
    private func contactSearchRow(_ hit: NativeContactSearchHit) -> some View {
        Button {
            Task {
                if let connectionID = hit.activeConnectionId {
                    router.navigate(to: .directChat(connectionID: connectionID))
                } else if let connectionID = await store.add(peerID: hit.id, using: session) {
                    router.navigate(to: .directChat(connectionID: connectionID))
                }
            }
        } label: {
            HStack(spacing: 12) {
                InitialAvatar(name: hit.displayName, url: hit.avatarUrl)
                    .frame(width: 40, height: 40)
                VStack(alignment: .leading, spacing: 2) {
                    Text(hit.displayName)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.primary)
                    Text("@\(hit.username)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if let school = hit.school, !school.isEmpty {
                        Text(school)
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                }
                Spacer()
                Text(hit.activeConnectionId == nil ? String(localized: "Add") : String(localized: "Open"))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.accent)
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("contact-search-\(hit.id)")
    }
}
