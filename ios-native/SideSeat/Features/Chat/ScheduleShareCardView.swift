import SwiftUI

struct ScheduleShareCardView: View {
    @Environment(SessionStore.self) private var session

    let shareURL: String
    let onOpenToken: (String) -> Void

    @State private var preview: NativeScheduleShareChatPreview?
    @State private var issue: String?
    @State private var isLoading = false

    var body: some View {
        Button {
            if let token = ScheduleShareURLParser.token(from: shareURL) {
                onOpenToken(token)
            }
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                Text(
                    preview?.expired == true
                        ? String(localized: "Schedule expired")
                        : String(localized: "Shared schedule")
                )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                if let preview {
                    Text(preview.ownerDisplayLabel)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.primary)
                    if let start = Date.sideSeatChatISO8601(preview.snapshot.rangeStart),
                       let end = Date.sideSeatChatISO8601(preview.snapshot.rangeEnd) {
                        Text("\(start.formatted(date: .abbreviated, time: .omitted)) – \(end.formatted(date: .abbreviated, time: .omitted))")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    Text(String(localized: "\(preview.snapshot.freeSlots.count) free slots"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else if isLoading {
                    ProgressView()
                        .controlSize(.small)
                } else if let issue {
                    Text(issue)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    Text("Tap to open schedule")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(12)
            .frame(maxWidth: 280, alignment: .leading)
            .background(SideSeatTheme.Chat.peerBubble, in: RoundedRectangle(cornerRadius: SideSeatTheme.Chat.bubbleRadius, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("schedule-share-card")
        .task(id: shareURL) { await loadPreview() }
    }

    private func loadPreview() async {
        guard let token = ScheduleShareURLParser.token(from: shareURL) else {
            issue = String(localized: "Schedule link unavailable")
            return
        }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            preview = NativeScheduleShareChatPreview(
                snapshot: NativeScheduleShareSnapshot(
                    ownerDisplayLabel: "Mina",
                    rangeStart: "2026-07-18T00:00:00.000Z",
                    rangeEnd: "2026-07-20T23:59:59.000Z",
                    includedDates: ["2026-07-18", "2026-07-19", "2026-07-20"],
                    expiresAt: nil,
                    allowGuestProposals: true,
                    freeSlots: [
                        NativeScheduleShareSlot(start: "2026-07-18T10:00:00.000Z", end: "2026-07-18T12:00:00.000Z")
                    ],
                    blocks: nil
                ),
                expired: false,
                ownerDisplayLabel: "Mina"
            )
            return
        }
        #endif

        isLoading = true
        issue = nil
        defer { isLoading = false }
        do {
            let path = "api/v1/schedule-shares/chat-preview/\(token.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? token)"
            let response: APIEnvelope<NativeScheduleShareChatPreview> = try await session.sendAuthorized(path)
            preview = response.data
        } catch {
            issue = String(localized: "Preview unavailable")
        }
    }
}
