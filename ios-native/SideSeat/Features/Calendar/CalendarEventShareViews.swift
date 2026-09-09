import Observation
import SwiftUI
import UIKit

struct NativeEventShareCreateRequest: Encodable, Sendable {
    let includeLocation: Bool
    let includeNotes: Bool
}

struct NativeEventShareCreatePayload: Decodable, Sendable {
    let linkId: String
    let token: String
    let shareUrl: String
    let expiresAt: String
}

struct NativeEventShareSnapshot: Decodable, Sendable {
    let linkId: String
    let ownerDisplayLabel: String
    let title: String
    let startAt: String
    let endAt: String
    let location: String?
    let note: String?
    let expiresAt: String
}

struct NativeEventShareRecipientPayload: Decodable, Sendable {
    let snapshot: NativeEventShareSnapshot
    let ownedByViewer: Bool
    let addedCalendarEntryId: String?
}

struct NativeEventShareImportPayload: Decodable, Sendable {
    let calendarEntryId: String
    let created: Bool
}

struct CalendarEventShareSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    let item: HomeAgendaItem

    @State private var includeLocation: Bool
    @State private var includeNotes = false
    @State private var createdShare: NativeEventShareCreatePayload?
    @State private var contactsStore = ContactsStore()
    @State private var isCreating = false
    @State private var sendingConnectionID: String?
    @State private var issue: String?
    @State private var sharePayload: SSSharePayload?
    @State private var copiedLink = false
    @State private var sentRecipientName: String?

    init(item: HomeAgendaItem) {
        self.item = item
        _includeLocation = State(initialValue: Self.normalized(item.location) != nil)
    }

    var body: some View {
        NavigationStack {
            Group {
                if let createdShare {
                    destinationList(createdShare)
                } else {
                    sharePreview
                }
            }
            .navigationTitle(createdShare == nil ? "Share event details" : "Share with")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: dismiss.callAsFunction)
                }
            }
        }
        .sheet(item: $sharePayload) { payload in
            SSActivityView(items: payload.items)
        }
        .task(id: createdShare?.linkId) {
            guard createdShare != nil, !contactsStore.hasLoaded else { return }
            await contactsStore.load(using: session)
        }
        .accessibilityIdentifier("event-share-compose")
    }

    private var sharePreview: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                    Label("Event details preview", systemImage: "calendar.badge.checkmark")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)

                    Text(item.title)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .accessibilityIdentifier("event-share-preview-title")

                    Label(formattedRange, systemImage: "clock")
                        .font(.subheadline)
                        .foregroundStyle(SideSeatTheme.textSecondary)

                    if includeLocation, let location = Self.normalized(item.location) {
                        Label(location, systemImage: "mappin.and.ellipse")
                            .font(.subheadline)
                            .foregroundStyle(SideSeatTheme.textSecondary)
                    }

                    if includeNotes, let note = Self.normalized(item.note) {
                        Label(note, systemImage: "note.text")
                            .font(.subheadline)
                            .foregroundStyle(SideSeatTheme.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.vertical, SideSeatTheme.spaceXS)
            }

            Section {
                if Self.normalized(item.location) != nil {
                    Toggle("Include location", isOn: $includeLocation)
                        .accessibilityIdentifier("event-share-include-location")
                }
                if Self.normalized(item.note) != nil {
                    Toggle("Include notes", isOn: $includeNotes)
                        .accessibilityIdentifier("event-share-include-notes")
                }
            } header: {
                Text("Shared details")
            } footer: {
                Text("The recipient gets a filtered view and can add an independent copy. This is not an invitation and does not share participants or editing access.")
                    .accessibilityIdentifier("event-share-copy-disclosure")
            }

            if let issue {
                Section {
                    Label(issue, systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(SideSeatTheme.danger)
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 0) {
                Divider()
                SSPrimaryButton(
                    title: AppLocalization.string("Continue"),
                    isLoading: isCreating,
                    fill: .product,
                    height: 48,
                    accessibilityID: "event-share-continue"
                ) {
                    Task { await createShare() }
                }
                .disabled(isCreating)
                .padding(.horizontal, SideSeatTheme.screenHorizontal)
                .padding(.vertical, SideSeatTheme.spaceMD)
            }
            .background(.regularMaterial)
        }
    }

    private func destinationList(_ share: NativeEventShareCreatePayload) -> some View {
        List {
            if let sentRecipientName {
                Section {
                    Label(
                        String(
                            format: AppLocalization.string("Sent to %@"),
                            sentRecipientName
                        ),
                        systemImage: "checkmark.circle.fill"
                    )
                    .foregroundStyle(SideSeatTheme.success)
                }
            }

            Section("SideSeat contacts") {
                if contactsStore.isLoading {
                    HStack {
                        Spacer()
                        ProgressView()
                        Spacer()
                    }
                } else if contactsStore.contacts.isEmpty {
                    Text("No contacts available")
                        .foregroundStyle(SideSeatTheme.textSecondary)
                } else {
                    ForEach(contactsStore.contacts.prefix(8)) { contact in
                        Button {
                            Task { await send(share, to: contact) }
                        } label: {
                            HStack(spacing: SideSeatTheme.spaceMD) {
                                InitialAvatar(name: contact.displayName, url: contact.peer.avatarUrl, size: 36)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(contact.displayName)
                                        .foregroundStyle(SideSeatTheme.textPrimary)
                                    Text("Send a private link in chat")
                                        .font(.caption)
                                        .foregroundStyle(SideSeatTheme.textSecondary)
                                }
                                Spacer(minLength: SideSeatTheme.spaceSM)
                                if sendingConnectionID == contact.connectionId {
                                    ProgressView()
                                } else {
                                    Image(systemName: "paperplane")
                                        .foregroundStyle(SideSeatTheme.utilityAction)
                                }
                            }
                            .frame(minHeight: 44)
                        }
                        .buttonStyle(SSPressButtonStyle())
                        .disabled(sendingConnectionID != nil)
                        .accessibilityIdentifier("event-share-contact-\(contact.connectionId)")
                    }
                }
            }

            Section("Other ways") {
                Button {
                    UIPasteboard.general.url = URL(string: share.shareUrl)
                    copiedLink.toggle()
                } label: {
                    Label(copiedLink ? "Link copied" : "Copy link", systemImage: copiedLink ? "checkmark" : "doc.on.doc")
                }
                .accessibilityIdentifier("event-share-copy-link")

                Button {
                    guard let url = URL(string: share.shareUrl) else { return }
                    sharePayload = SSSharePayload(items: [shareMessage, url])
                } label: {
                    Label("Share with other apps", systemImage: "square.and.arrow.up")
                }
                .accessibilityIdentifier("event-share-system-share")
            }

            if let visibleIssue = issue ?? contactsStore.issue {
                Section {
                    Label(visibleIssue, systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(SideSeatTheme.danger)
                }
            }
        }
        .accessibilityIdentifier("event-share-destinations")
    }

    @MainActor
    private func createShare() async {
        guard !isCreating else { return }
        isCreating = true
        issue = nil
        defer { isCreating = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            createdShare = NativeEventShareCreatePayload(
                linkId: "ui-event-share",
                token: "ui-event-share-token",
                shareUrl: "https://www.sideseat.de/share/event/ui-event-share-token",
                expiresAt: "2026-09-12T12:00:00.000Z"
            )
            return
        }
        #endif

        let encodedID = item.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? item.id
        do {
            let response: APIEnvelope<NativeEventShareCreatePayload> = try await session.sendAuthorized(
                "api/v1/calendar/events/\(encodedID)/shares",
                method: .post,
                body: NativeEventShareCreateRequest(
                    includeLocation: includeLocation,
                    includeNotes: includeNotes
                ),
                idempotencyKey: UUID().uuidString
            )
            createdShare = response.data
        } catch {
            issue = error.localizedDescription
        }
    }

    @MainActor
    private func send(_ share: NativeEventShareCreatePayload, to contact: NativeContactRow) async {
        guard sendingConnectionID == nil else { return }
        sendingConnectionID = contact.connectionId
        issue = nil
        defer { sendingConnectionID = nil }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            sentRecipientName = contact.displayName
            return
        }
        #endif

        do {
            let _: APIEnvelope<NativeDirectMessage> = try await session.sendAuthorized(
                "api/v1/connections/\(contact.connectionId)/messages",
                method: .post,
                body: NativeDirectTextMessageRequest(body: "\(shareMessage)\n\(share.shareUrl)"),
                idempotencyKey: UUID().uuidString
            )
            sentRecipientName = contact.displayName
        } catch {
            issue = error.localizedDescription
        }
    }

    private var shareMessage: String {
        String(format: AppLocalization.string("Event details: %@"), item.title)
    }

    private var formattedRange: String {
        let formatter = DateFormatter()
        formatter.locale = AppLocalization.selectedLanguage.locale
        formatter.calendar = .sideSeatBerlin
        formatter.timeZone = Calendar.sideSeatBerlin.timeZone
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        let start = formatter.string(from: item.start)
        let end = formatter.string(from: item.end)
        return "\(start) – \(end)"
    }

    private static func normalized(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

@MainActor
@Observable
final class CalendarEventShareRecipientStore {
    private(set) var payload: NativeEventShareRecipientPayload?
    private(set) var isLoading = false
    private(set) var isAdding = false
    private(set) var issue: String?

    func load(token: String, using session: SessionStore) async {
        guard !isLoading else { return }
        isLoading = true
        issue = nil
        defer { isLoading = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            payload = NativeEventShareRecipientPayload(
                snapshot: NativeEventShareSnapshot(
                    linkId: "ui-event-share",
                    ownerDisplayLabel: "Mina",
                    title: "Library study",
                    startAt: "2026-09-02T12:00:00.000Z",
                    endAt: "2026-09-02T13:00:00.000Z",
                    location: "Main Library",
                    note: "Bring the practice sheet.",
                    expiresAt: "2026-09-12T12:00:00.000Z"
                ),
                ownedByViewer: false,
                addedCalendarEntryId: nil
            )
            return
        }
        #endif

        do {
            let encoded = token.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? token
            let response: APIEnvelope<NativeEventShareRecipientPayload> = try await session.sendAuthorized(
                "api/v1/event-shares/\(encoded)"
            )
            payload = response.data
        } catch {
            issue = error.localizedDescription
        }
    }

    func add(token: String, using session: SessionStore) async {
        guard !isAdding, let payload, !payload.ownedByViewer, payload.addedCalendarEntryId == nil else {
            return
        }
        isAdding = true
        issue = nil
        defer { isAdding = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            self.payload = NativeEventShareRecipientPayload(
                snapshot: payload.snapshot,
                ownedByViewer: false,
                addedCalendarEntryId: "ui-imported-event"
            )
            NotificationCenter.default.post(name: .sideSeatCalendarNeedsRefresh, object: nil)
            return
        }
        #endif

        do {
            let encoded = token.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? token
            let response: APIEnvelope<NativeEventShareImportPayload> = try await session.sendAuthorized(
                "api/v1/event-shares/\(encoded)/add",
                method: .post,
                idempotencyKey: UUID().uuidString
            )
            self.payload = NativeEventShareRecipientPayload(
                snapshot: payload.snapshot,
                ownedByViewer: payload.ownedByViewer,
                addedCalendarEntryId: response.data.calendarEntryId
            )
            NotificationCenter.default.post(name: .sideSeatCalendarNeedsRefresh, object: nil)
        } catch {
            issue = error.localizedDescription
        }
    }
}

struct CalendarEventShareRecipientView: View {
    @Environment(SessionStore.self) private var session
    let token: String

    @State private var store = CalendarEventShareRecipientStore()

    var body: some View {
        Group {
            if let payload = store.payload {
                content(payload)
            } else if let issue = store.issue {
                ContentUnavailableView(
                    "Event details unavailable",
                    systemImage: "calendar.badge.exclamationmark",
                    description: Text(issue)
                )
            } else {
                SSLoadingState("Loading event details")
            }
        }
        .background(SideSeatTheme.bgGrouped)
        .navigationTitle("Event details")
        .navigationBarTitleDisplayMode(.inline)
        .task { await store.load(token: token, using: session) }
        .accessibilityIdentifier("event-share-recipient")
    }

    private func content(_ payload: NativeEventShareRecipientPayload) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceLG) {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                    HStack(spacing: SideSeatTheme.spaceSM) {
                        Image(systemName: "calendar.badge.checkmark")
                            .foregroundStyle(SideSeatTheme.utilityAction)
                        Text("Shared by \(payload.snapshot.ownerDisplayLabel)")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    }

                    Text(payload.snapshot.title)
                        .font(.title2.weight(.bold))
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("event-share-title")

                    if let start = Date.sideSeatChatISO8601(payload.snapshot.startAt),
                       let end = Date.sideSeatChatISO8601(payload.snapshot.endAt) {
                        sharedDetailRow(
                            title: "When",
                            value: formattedRange(start: start, end: end),
                            systemImage: "clock",
                            accessibilityID: "event-share-when"
                        )
                    }
                    if let location = normalized(payload.snapshot.location) {
                        sharedDetailRow(
                            title: "Location",
                            value: location,
                            systemImage: "mappin.and.ellipse",
                            accessibilityID: "event-share-location"
                        )
                    }
                    if let note = normalized(payload.snapshot.note) {
                        sharedDetailRow(
                            title: "Notes",
                            value: note,
                            systemImage: "note.text",
                            accessibilityID: "event-share-notes"
                        )
                    }
                }
                .padding(SideSeatTheme.spaceLG)
                .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius, style: .continuous)
                        .strokeBorder(SideSeatTheme.separator.opacity(0.28), lineWidth: 0.5)
                }

                Label(
                    "This is a shared copy, not an invitation. Adding it does not notify the sender or sync future changes.",
                    systemImage: "info.circle"
                )
                .font(.footnote)
                .foregroundStyle(SideSeatTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("event-share-copy-disclosure")

                if payload.ownedByViewer {
                    Label("This event belongs to you", systemImage: "person.crop.circle.badge.checkmark")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .background(SideSeatTheme.fillTertiary, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous))
                } else if payload.addedCalendarEntryId != nil {
                    Label("Copy added to your calendar", systemImage: "checkmark.circle.fill")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.success)
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .background(SideSeatTheme.success.opacity(0.1), in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous))
                        .accessibilityIdentifier("event-share-added")
                } else {
                    SSPrimaryButton(
                        title: AppLocalization.string("Add a copy to my calendar"),
                        isLoading: store.isAdding,
                        fill: .product,
                        height: 48,
                        accessibilityID: "event-share-add"
                    ) {
                        Task { await store.add(token: token, using: session) }
                    }
                }

                if let issue = store.issue {
                    Label(issue, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(SideSeatTheme.danger)
                }
            }
            .padding(.horizontal, SideSeatTheme.screenHorizontal)
            .padding(.vertical, SideSeatTheme.spaceLG)
        }
    }

    private func sharedDetailRow(
        title: LocalizedStringKey,
        value: String,
        systemImage: String,
        accessibilityID: String
    ) -> some View {
        HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
            Image(systemName: systemImage)
                .foregroundStyle(SideSeatTheme.textSecondary)
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.caption)
                    .foregroundStyle(SideSeatTheme.textSecondary)
                Text(value)
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier(accessibilityID)
    }

    private func formattedRange(start: Date, end: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = AppLocalization.selectedLanguage.locale
        formatter.calendar = .sideSeatBerlin
        formatter.timeZone = Calendar.sideSeatBerlin.timeZone
        formatter.dateStyle = .long
        formatter.timeStyle = .short
        return "\(formatter.string(from: start)) – \(formatter.string(from: end))"
    }

    private func normalized(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
