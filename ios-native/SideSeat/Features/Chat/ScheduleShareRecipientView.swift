import SwiftUI

@MainActor
@Observable
final class ScheduleShareRecipientStore {
    private(set) var snapshot: NativeScheduleShareSnapshot?
    private(set) var proposal: NativeScheduleShareViewerProposal?
    private(set) var allowGuestProposals = false
    private(set) var isLoading = false
    private(set) var isSubmitting = false
    private(set) var issue: String?

    func load(token: String, using session: SessionStore) async {
        isLoading = true
        issue = nil
        defer { isLoading = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            snapshot = NativeScheduleShareSnapshot(
                ownerDisplayLabel: "Mina",
                rangeStart: "2026-07-18T00:00:00.000Z",
                rangeEnd: "2026-07-20T23:59:59.000Z",
                includedDates: ["2026-07-18", "2026-07-19", "2026-07-20"],
                expiresAt: nil,
                allowGuestProposals: true,
                freeSlots: [
                    NativeScheduleShareSlot(start: "2026-07-18T10:00:00.000Z", end: "2026-07-18T11:00:00.000Z"),
                    NativeScheduleShareSlot(start: "2026-07-19T14:00:00.000Z", end: "2026-07-19T15:00:00.000Z")
                ],
                blocks: [
                    NativeScheduleShareBlock(
                        kind: "busy_anonymous",
                        start: "2026-07-18T12:00:00.000Z",
                        end: "2026-07-18T13:00:00.000Z",
                        title: nil,
                        location: nil
                    )
                ]
            )
            allowGuestProposals = true
            proposal = nil
            return
        }
        #endif

        do {
            let encoded = token.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? token
            let response: APIEnvelope<NativeScheduleShareRecipientPayload> = try await session.sendAuthorized(
                "api/v1/schedule-shares/recipient/\(encoded)"
            )
            snapshot = response.data.snapshot
            proposal = response.data.proposal
            allowGuestProposals = response.data.allowGuestProposals
        } catch {
            issue = error.localizedDescription
        }
    }

    func submit(
        token: String,
        title: String,
        note: String?,
        location: String?,
        start: Date,
        end: Date,
        using session: SessionStore
    ) async -> Bool {
        guard !isSubmitting else { return false }
        isSubmitting = true
        issue = nil
        defer { isSubmitting = false }

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            proposal = NativeScheduleShareViewerProposal(
                id: "ui-proposal-1",
                title: title,
                note: note,
                location: location,
                startTime: formatter.string(from: start),
                endTime: formatter.string(from: end),
                status: "PENDING"
            )
            return true
        }
        #endif

        do {
            let encoded = token.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? token
            let response: APIEnvelope<NativeScheduleShareProposalResult> = try await session.sendAuthorized(
                "api/v1/schedule-shares/recipient/\(encoded)/proposals",
                method: .post,
                body: NativeScheduleShareProposalRequest(
                    title: title,
                    note: note,
                    location: location,
                    startTime: formatter.string(from: start),
                    endTime: formatter.string(from: end)
                ),
                idempotencyKey: UUID().uuidString
            )
            proposal = response.data.proposal
            return true
        } catch {
            issue = error.localizedDescription
            return false
        }
    }
}

struct ScheduleShareRecipientView: View {
    @Environment(SessionStore.self) private var session
    let token: String

    @State private var store = ScheduleShareRecipientStore()
    @State private var selectedSlot: NativeScheduleShareSlot?
    @State private var title = String(localized: "Meet up")
    @State private var note = ""
    @State private var location = ""

    var body: some View {
        Group {
            if store.isLoading && store.snapshot == nil {
                ProgressView("Loading schedule")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let issue = store.issue, store.snapshot == nil {
                ContentUnavailableView("Schedule unavailable", systemImage: "calendar.badge.exclamationmark", description: Text(issue))
            } else if let snapshot = store.snapshot {
                List {
                    Section {
                        Text(snapshot.ownerDisplayLabel)
                            .font(.title3.weight(.semibold))
                        if let start = Date.sideSeatChatISO8601(snapshot.rangeStart),
                           let end = Date.sideSeatChatISO8601(snapshot.rangeEnd) {
                            Text("\(start.formatted(date: .abbreviated, time: .omitted)) – \(end.formatted(date: .abbreviated, time: .omitted))")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }

                    if let proposal = store.proposal {
                        Section("Your proposal") {
                            Text(proposal.title)
                                .font(.body.weight(.semibold))
                            if let start = Date.sideSeatChatISO8601(proposal.startTime),
                               let end = Date.sideSeatChatISO8601(proposal.endTime) {
                                Text("\(start.formatted(date: .abbreviated, time: .shortened)) – \(end.formatted(date: .omitted, time: .shortened))")
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                            Text(proposal.status)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                        }
                        .accessibilityIdentifier("schedule-share-my-proposal")
                    }

                    Section("Free slots") {
                        ForEach(snapshot.freeSlots) { slot in
                            Button {
                                selectedSlot = slot
                                if let start = Date.sideSeatChatISO8601(slot.start) {
                                    // keep title
                                    _ = start
                                }
                            } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        if let start = Date.sideSeatChatISO8601(slot.start),
                                           let end = Date.sideSeatChatISO8601(slot.end) {
                                            Text("\(start.formatted(date: .abbreviated, time: .shortened)) – \(end.formatted(date: .omitted, time: .shortened))")
                                                .foregroundStyle(.primary)
                                        }
                                    }
                                    Spacer()
                                    if selectedSlot?.id == slot.id {
                                        Image(systemName: "checkmark.circle.fill")
                                            .foregroundStyle(SideSeatTheme.accent)
                                    }
                                }
                            }
                            .accessibilityIdentifier("schedule-share-slot-\(slot.id)")
                        }
                    }

                    if !snapshot.blocks.isNilOrEmpty {
                        Section("Busy") {
                            ForEach(Array((snapshot.blocks ?? []).enumerated()), id: \.offset) { _, block in
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(
                                        block.kind == "busy_detail"
                                            ? (block.title ?? String(localized: "Busy"))
                                            : String(localized: "Busy")
                                    )
                                        .font(.footnote.weight(.semibold))
                                    if let start = Date.sideSeatChatISO8601(block.start),
                                       let end = Date.sideSeatChatISO8601(block.end) {
                                        Text("\(start.formatted(date: .omitted, time: .shortened)) – \(end.formatted(date: .omitted, time: .shortened))")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }

                    if store.allowGuestProposals {
                        Section("Suggest a time") {
                            TextField("Title", text: $title)
                                .accessibilityIdentifier("schedule-share-proposal-title")
                            TextField("Location (optional)", text: $location)
                            TextField("Note (optional)", text: $note, axis: .vertical)
                                .lineLimit(2...4)
                            Button(
                                store.isSubmitting
                                    ? String(localized: "Sending…")
                                    : String(localized: "Send proposal")
                            ) {
                                Task { await submitProposal() }
                            }
                            .disabled(selectedSlot == nil || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.isSubmitting)
                            .accessibilityIdentifier("schedule-share-proposal-submit")
                        }
                    }

                    if let issue = store.issue {
                        Section {
                            Text(issue)
                                .font(.footnote)
                                .foregroundStyle(SideSeatTheme.danger)
                        }
                    }
                }
            }
        }
        .navigationTitle("Shared schedule")
        .navigationBarTitleDisplayMode(.inline)
        .task { await store.load(token: token, using: session) }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("schedule-share-recipient")
    }

    private func submitProposal() async {
        guard let slot = selectedSlot,
              let start = Date.sideSeatChatISO8601(slot.start),
              let end = Date.sideSeatChatISO8601(slot.end)
        else { return }
        _ = await store.submit(
            token: token,
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            note: {
                let value = note.trimmingCharacters(in: .whitespacesAndNewlines)
                return value.isEmpty ? nil : value
            }(),
            location: {
                let value = location.trimmingCharacters(in: .whitespacesAndNewlines)
                return value.isEmpty ? nil : value
            }(),
            start: start,
            end: end,
            using: session
        )
    }
}

private extension Optional where Wrapped: Collection {
    var isNilOrEmpty: Bool {
        switch self {
        case .none: return true
        case .some(let value): return value.isEmpty
        }
    }
}
