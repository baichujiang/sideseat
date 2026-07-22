import SwiftUI

struct NativeScheduleShareOwnerPreviewPayload: Decodable, Sendable {
    let snapshot: NativeScheduleShareSnapshot
}

struct ScheduleShareComposeSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    let connectionID: String
    let onSent: () -> Void

    @State private var preview: NativeScheduleShareSnapshot?
    @State private var isLoading = false
    @State private var isSending = false
    @State private var issue: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Preview") {
                    if isLoading {
                        ProgressView("Loading your schedule")
                    } else if let preview {
                        Text(preview.ownerDisplayLabel)
                            .font(.body.weight(.semibold))
                        if let start = Date.sideSeatChatISO8601(preview.rangeStart),
                           let end = Date.sideSeatChatISO8601(preview.rangeEnd) {
                            Text("\(start.formatted(date: .abbreviated, time: .omitted)) – \(end.formatted(date: .abbreviated, time: .omitted))")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                        Text("\(preview.freeSlots.count) free slots in the default window")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        Text("SideSeat will share the next few days with free/busy detail, same as the web defaults.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else {
                        Text(issue ?? String(localized: "Preview unavailable"))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }

                if let issue, preview != nil {
                    Section {
                        Text(issue)
                            .font(.footnote)
                            .foregroundStyle(SideSeatTheme.danger)
                    }
                }
            }
            .navigationTitle("Share schedule")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Send") {
                        Task { await send() }
                    }
                    .disabled(isSending || preview == nil)
                    .accessibilityIdentifier("schedule-share-send")
                }
            }
            .task { await loadPreview() }
            .accessibilityIdentifier("schedule-share-compose")
        }
    }

    private func loadPreview() async {
        isLoading = true
        issue = nil
        defer { isLoading = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            preview = NativeScheduleShareSnapshot(
                ownerDisplayLabel: "You",
                rangeStart: "2026-07-18T00:00:00.000Z",
                rangeEnd: "2026-07-20T23:59:59.000Z",
                includedDates: ["2026-07-18", "2026-07-19", "2026-07-20"],
                expiresAt: nil,
                allowGuestProposals: true,
                freeSlots: [
                    NativeScheduleShareSlot(start: "2026-07-18T10:00:00.000Z", end: "2026-07-18T12:00:00.000Z")
                ],
                blocks: nil
            )
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativeScheduleShareOwnerPreviewPayload> = try await session.sendAuthorized(
                "api/v1/schedule-shares/owner-preview"
            )
            preview = response.data.snapshot
        } catch {
            issue = error.localizedDescription
        }
    }

    private func send() async {
        isSending = true
        issue = nil
        defer { isSending = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            onSent()
            dismiss()
            return
        }
        #endif

        do {
            struct EmptyBody: Encodable, Sendable {}
            let _: APIEnvelope<NativeScheduleShareCreatePayload> = try await session.sendAuthorized(
                "api/v1/connections/\(connectionID)/schedule-shares",
                method: .post,
                body: EmptyBody(),
                idempotencyKey: UUID().uuidString
            )
            onSent()
            dismiss()
        } catch {
            issue = error.localizedDescription
        }
    }
}
