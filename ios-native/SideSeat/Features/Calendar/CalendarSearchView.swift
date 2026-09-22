import Observation
import SwiftUI

private struct NativeCalendarSearchPayload: Decodable, Sendable {
    let results: [NativeHomeStudyEntry]
}

@MainActor
@Observable
final class CalendarSearchStore {
    private(set) var results: [NativeHomeStudyEntry] = []
    private(set) var isLoading = false
    private(set) var issue: String?
    private var latestRequestID: UUID?
    private var loadedQuery = ""

    func clear() {
        latestRequestID = nil
        loadedQuery = ""
        results = []
        issue = nil
        isLoading = false
    }

    func search(_ rawQuery: String, using session: SessionStore) async {
        let query = rawQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else {
            clear()
            return
        }

        let requestID = UUID()
        latestRequestID = requestID
        if loadedQuery != query {
            results = []
        }
        isLoading = true
        issue = nil
        defer {
            if latestRequestID == requestID { isLoading = false }
        }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            try? await Task.sleep(for: .milliseconds(80))
            guard latestRequestID == requestID, !Task.isCancelled else { return }
            results = Self.fixtureResults(matching: query)
            loadedQuery = query
            return
        }
        #endif

        guard session.canMakeAuthenticatedRequests else {
            issue = AppLocalization.string("Connect to search your calendar.")
            return
        }

        do {
            let response: APIEnvelope<NativeCalendarSearchPayload> = try await session.sendAuthorized(
                "api/v1/calendar/search",
                queryItems: [URLQueryItem(name: "q", value: query)]
            )
            guard latestRequestID == requestID, !Task.isCancelled else { return }
            results = Array(response.data.results.prefix(30))
            loadedQuery = query
        } catch is CancellationError {
            return
        } catch {
            guard latestRequestID == requestID else { return }
            results = []
            issue = error.localizedDescription
        }
    }

    #if DEBUG
    private static func fixtureResults(matching query: String, now: Date = Date()) -> [NativeHomeStudyEntry] {
        NativeHomeSchedule.uiTestingFixture(now: now).studyEntries
            .compactMap { entry -> (NativeHomeStudyEntry, Int, TimeInterval)? in
                guard let rank = matchRank(entry, query: query),
                      let start = Date.sideSeatISO8601(entry.startISO),
                      let end = Date.sideSeatISO8601(entry.endISO)
                else { return nil }
                let distance: TimeInterval
                if start <= now, end >= now {
                    distance = 0
                } else if start > now {
                    distance = start.timeIntervalSince(now)
                } else {
                    distance = now.timeIntervalSince(end)
                }
                return (entry, rank, distance)
            }
            .sorted { left, right in
                if left.1 != right.1 { return left.1 < right.1 }
                if left.2 != right.2 { return left.2 < right.2 }
                let leftStart = Date.sideSeatISO8601(left.0.startISO) ?? .distantFuture
                let rightStart = Date.sideSeatISO8601(right.0.startISO) ?? .distantFuture
                let leftPast = leftStart < now
                let rightPast = rightStart < now
                if leftPast != rightPast { return !leftPast }
                return left.0.startISO < right.0.startISO
            }
            .prefix(30)
            .map(\.0)
    }

    private static func matchRank(_ entry: NativeHomeStudyEntry, query: String) -> Int? {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !needle.isEmpty else { return nil }
        let title = entry.title.lowercased()
        if title == needle { return 0 }
        if title.hasPrefix(needle) { return 1 }
        if title.contains(needle) { return 2 }
        if entry.location?.lowercased().contains(needle) == true { return 3 }
        if entry.note?.lowercased().contains(needle) == true { return 4 }
        return nil
    }
    #endif
}

struct CalendarSearchView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(SessionStore.self) private var session
    @State private var store = CalendarSearchStore()
    @State private var query = ""
    @State private var searchIsPresented = false

    let onSelect: (NativeHomeStudyEntry) -> Void

    private var trimmedQuery: String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        NavigationStack {
            List {
                searchContent
            }
            .listStyle(.plain)
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("Search events")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(
                text: $query,
                isPresented: $searchIsPresented,
                placement: .navigationBarDrawer(displayMode: .always),
                prompt: "Title, location, or notes"
            )
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                        .accessibilityIdentifier("calendar-search-done")
                }
            }
        }
        .task {
            await Task.yield()
            searchIsPresented = true
        }
        .task(id: trimmedQuery) {
            guard !trimmedQuery.isEmpty else {
                store.clear()
                return
            }
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await store.search(trimmedQuery, using: session)
        }
        .accessibilityIdentifier("calendar-search-sheet")
    }

    @ViewBuilder
    private var searchContent: some View {
        if trimmedQuery.isEmpty {
            ContentUnavailableView {
                Label("Search events", systemImage: "magnifyingglass")
            } description: {
                Text("Find an event by its title, location, or notes.")
            }
            .ssListPageStateRow()
            .accessibilityIdentifier("calendar-search-prompt")
        } else if store.isLoading, store.results.isEmpty {
            SSLoadingState("Searching events")
                .frame(maxWidth: .infinity)
                .ssListPageStateRow()
                .accessibilityIdentifier("calendar-search-loading")
        } else if let issue = store.issue {
            ContentUnavailableView {
                Label("Could not search events", systemImage: "wifi.exclamationmark")
            } description: {
                Text(issue)
            } actions: {
                Button("Try again") {
                    Task { await store.search(trimmedQuery, using: session) }
                }
            }
            .ssListPageStateRow()
            .accessibilityIdentifier("calendar-search-error")
        } else if store.results.isEmpty {
            ContentUnavailableView.search(text: trimmedQuery)
                .ssListPageStateRow()
                .accessibilityIdentifier("calendar-search-empty")
        } else {
            ForEach(store.results, id: \.id) { event in
                CalendarSearchResultRow(event: event) {
                    onSelect(event)
                }
            }
        }
    }
}

private struct CalendarSearchResultRow: View {
    let event: NativeHomeStudyEntry
    let onSelect: () -> Void

    private var start: Date? { Date.sideSeatISO8601(event.startISO) }

    var body: some View {
        Button(action: onSelect) {
            HStack(alignment: .top, spacing: SideSeatTheme.spaceSM) {
                Circle()
                    .fill(Color(hex: event.categoryColor) ?? SideSeatTheme.textSecondary)
                    .frame(width: 10, height: 10)
                    .overlay {
                        Circle()
                            .strokeBorder(Color.primary.opacity(0.16), lineWidth: 0.5)
                    }
                    .padding(.top, 5)
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(event.title)
                            .font(.body.weight(.semibold))
                            .foregroundStyle(SideSeatTheme.textPrimary)
                            .multilineTextAlignment(.leading)
                        if event.repeatRule != NativeCalendarRepeatRule.none.rawValue {
                            Image(systemName: "repeat")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(SideSeatTheme.textSecondary)
                                .accessibilityLabel("Repeating event")
                        }
                    }

                    if let start {
                        Text(start.formatted(date: .abbreviated, time: .shortened))
                            .font(.subheadline)
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    }

                    if let location = normalized(event.location) {
                        Label(location, systemImage: "mappin.and.ellipse")
                            .font(.caption)
                            .foregroundStyle(SideSeatTheme.textSecondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.textSecondary)
                    .accessibilityHidden(true)
            }
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(SSPressButtonStyle())
        .accessibilityIdentifier("calendar-search-result-\(event.id)")
    }

    private func normalized(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

private extension Date {
    static func sideSeatISO8601(_ value: String) -> Date? {
        if let date = try? Date(value, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true)) {
            return date
        }
        return try? Date(value, strategy: Date.ISO8601FormatStyle())
    }
}
