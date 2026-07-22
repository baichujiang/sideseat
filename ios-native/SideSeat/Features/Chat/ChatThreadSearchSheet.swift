import SwiftUI

struct ChatThreadSearchSheet: View {
    let title: String
    let rows: [ChatThreadSearchRow]
    var onSelect: ((String) -> Void)?
    @State private var query = ""
    @Environment(\.dismiss) private var dismiss

    private var filtered: [ChatThreadSearchRow] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !needle.isEmpty else { return rows }
        return rows.filter { $0.matches(query: needle) }
    }

    var body: some View {
        NavigationStack {
            List {
                if filtered.isEmpty {
                    SSEmptyState(
                        title: "No matches",
                        systemImage: "magnifyingglass",
                        description: "Try a different word from the conversation."
                    )
                    .accessibilityIdentifier("thread-search-empty")
                } else {
                    ForEach(filtered) { row in
                        Button {
                            if let onSelect {
                                onSelect(row.id)
                            } else {
                                dismiss()
                            }
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(row.senderName)
                                        .font(.subheadline.weight(.semibold))
                                    Spacer()
                                    if let date = row.createdAt {
                                        Text(InboxActivityFormatting.label(for: date))
                                            .font(.caption2)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                                Text(row.preview)
                                    .font(.body)
                                    .foregroundStyle(.primary)
                                    .multilineTextAlignment(.leading)
                            }
                            .padding(.vertical, 2)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("thread-search-row-\(row.id)")
                    }
                }
            }
            .listStyle(.plain)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search loaded messages")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                        .accessibilityIdentifier("thread-search-done")
                }
            }
            .accessibilityIdentifier("thread-search-sheet")
        }
    }
}

struct ChatThreadSearchRow: Identifiable, Hashable, Sendable {
    let id: String
    let senderName: String
    let preview: String
    let createdAt: Date?
    let haystack: String

    func matches(query: String) -> Bool {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if needle.isEmpty { return true }
        return haystack.contains(needle)
    }

    static func from(_ message: NativeDirectMessage) -> ChatThreadSearchRow {
        let preview: String
        if message.isDeleted {
            preview = String(localized: "Message deleted")
        } else {
            switch message.type {
            case "IMAGE": preview = message.body?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty ?? String(localized: "Photo")
            case "LOCATION": preview = message.location?.name?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty ?? String(localized: "Location")
            case "SCHEDULE_SHARE_CARD": preview = String(localized: "Shared schedule")
            case "AVAILABILITY_CARD": preview = String(localized: "Shared availability")
            case "PLAN_REQUEST_CARD": preview = String(localized: "Plan invite")
            case "PLAN_CONFIRMED_CARD": preview = String(localized: "Plan confirmed")
            default: preview = message.body?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty ?? String(localized: "Message")
            }
        }
        var parts = [message.sender.displayName, message.sender.username, preview]
        if let body = message.body { parts.append(body) }
        return ChatThreadSearchRow(
            id: message.id,
            senderName: message.sender.displayName,
            preview: preview,
            createdAt: message.createdDate,
            haystack: parts.joined(separator: " ").lowercased()
        )
    }

    static func from(_ message: NativeCommunityMessage) -> ChatThreadSearchRow {
        let preview = message.isDeleted
            ? String(localized: "Message deleted")
            : (message.body?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty ?? String(localized: "Message"))
        var parts = [message.sender.displayName, message.sender.username, preview]
        if let body = message.body { parts.append(body) }
        return ChatThreadSearchRow(
            id: message.id,
            senderName: message.sender.displayName,
            preview: preview,
            createdAt: message.createdDate,
            haystack: parts.joined(separator: " ").lowercased()
        )
    }
}

private extension String {
    var nilIfEmpty: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
