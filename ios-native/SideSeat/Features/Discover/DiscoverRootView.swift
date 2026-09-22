import SwiftUI
import UIKit

private enum DiscoverFeedScope: String, CaseIterable, Identifiable {
    case recommended
    case coursemates
    case buddies
    case activities

    var id: String { rawValue }

    var title: LocalizedStringKey {
        switch self {
        case .recommended: "Recommended"
        case .coursemates: "Coursemates"
        case .buddies: "Buddies"
        case .activities: "Activities"
        }
    }
}

struct DiscoverRootView: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    @Environment(ClientConfigurationStore.self) private var clientConfiguration
    @Binding private var createDestination: CreateDestination?
    @State private var store = DiscoverFeedStore()
    @State private var cityPreference = DiscoverCityPreferenceStore.shared
    @State private var query = ""
    @State private var showsCitySelection = false
    @State private var showsMyResponses = false
    @State private var selectedScope: DiscoverFeedScope = .recommended
    @State private var v2Store = ActionToPlanV2Store.shared

    private let onRequestPublish: () -> Void

    init(
        createDestination: Binding<CreateDestination?>,
        onRequestPublish: @escaping () -> Void
    ) {
        _createDestination = createDestination
        self.onRequestPublish = onRequestPublish
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: SideSeatTheme.spaceLG) {
                feedContext

                if let issue = store.issue, store.payload == nil {
                    ContentUnavailableView {
                        Label("Could not load Discover", systemImage: "wifi.exclamationmark")
                    } description: {
                        Text(issue)
                    } actions: {
                        Button("Try again") { Task { await load() } }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 48)
                } else if store.payload == nil {
                    SSLoadingState("Loading Discover")
                        .frame(maxWidth: .infinity)
                        .padding(.top, 72)
                } else {
                    feedContent
                }
            }
            .padding(.horizontal, SideSeatTheme.spaceMD)
            .padding(.top, SideSeatTheme.spaceSM)
            .padding(.bottom, SideSeatTheme.spaceXL)
        }
        .background(SideSeatTheme.bgGrouped)
        .contentMargins(.bottom, 88, for: .scrollContent)
        .scrollDismissesKeyboard(.interactively)
        .ssRootNavigationTitle("Discover")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        showsMyResponses = true
                    } label: {
                        Label("My responses", systemImage: "hand.raised")
                    }
                    .accessibilityIdentifier("discover-my-responses-open")
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .accessibilityLabel("More Discover actions")
                .accessibilityIdentifier("discover-more-actions")
            }
            ToolbarItem(placement: .primaryAction) {
                Button("Publish", action: onRequestPublish)
                    .fontWeight(.semibold)
                    .accessibilityLabel("Publish")
                    .accessibilityHint("Choose a course action, buddy post, or activity")
                    .accessibilityIdentifier("discover-publish")
            }
        }
        .refreshable { await load() }
        .sheet(isPresented: $showsCitySelection) {
            DiscoverCitySelectionSheet(cityPreference: cityPreference)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showsMyResponses) {
            NavigationStack {
                DiscoverMyResponsesView()
            }
            .presentationDetents([.large])
            .presentationDragIndicator(.visible)
            .presentationBackground(SideSeatTheme.bgGrouped)
        }
        // Create forms live in AppShellView so chooser and form stay in one sheet.
        .onChange(of: createDestination) { previous, destination in
            if destination == nil {
                switch previous {
                case .courseAction, .buddyPost, .activity:
                    query = ""
                case .none:
                    break
                }
                Task { await load() }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .sideSeatDiscoverFeedNeedsRefresh)) { _ in
            Task { await load() }
        }
        .onChange(of: router.path) { previousPath, path in
            guard !previousPath.isEmpty, path.isEmpty else { return }
            Task { await load() }
        }
        .task(id: DiscoverFeedLoadKey(city: cityPreference.selectedCity, query: query, scope: selectedScope)) {
            if !query.isEmpty {
                try? await Task.sleep(for: .milliseconds(300))
                guard !Task.isCancelled else { return }
            }
            await load()
        }
        .accessibilityIdentifier("discover-list")
    }

    @ViewBuilder
    private var feedContent: some View {
        if plans.isEmpty {
            if selectedScope == .coursemates, query.isEmpty {
                SSEmptyState(
                    title: emptyState.title,
                    systemImage: emptyState.systemImage,
                    description: emptyState.description,
                    actionTitle: AppLocalization.string("Start course action"),
                    actionAccessibilityID: "discover-start-course-action",
                    action: { createDestination = .courseAction }
                )
                .frame(maxWidth: .infinity)
                .padding(.top, 72)
            } else {
                emptyView(
                    title: emptyState.title,
                    systemImage: emptyState.systemImage,
                    description: emptyState.description
                )
            }
        } else {
            ForEach(plans) { item in
                VStack(alignment: .leading, spacing: 6) {
                    if let reasons = recommendationReasons[item.id], !reasons.isEmpty {
                        RecommendationReasonRow(reasonCodes: reasons)
                    }
                    switch item {
                    case .post(let post):
                        NavigationLink(value: AppRoute.discoverPost(postID: post.id)) {
                            DiscoverBuddyRow(post: post)
                        }
                        .buttonStyle(DiscoverFeedButtonStyle())
                        .accessibilityIdentifier("discover-plan-\(post.id)")
                        .productFunnelImpression(
                            sourceKind: post.isCourseAction ? "COURSE_ACTION" : "BUDDY_POST",
                            sourceID: post.id,
                            surface: selectedScope == .recommended ? "DISCOVER_RECOMMENDED" : "DISCOVER_EXPLORE"
                        )
                    case .activity(let activity):
                        NavigationLink(value: AppRoute.activity(activityID: activity.id)) {
                            DiscoverActivityRow(activity: activity)
                        }
                        .buttonStyle(DiscoverFeedButtonStyle())
                        .accessibilityIdentifier("discover-plan-legacy-\(activity.id)")
                        .productFunnelImpression(
                            sourceKind: "DISCOVER_ACTIVITY",
                            sourceID: activity.id,
                            surface: selectedScope == .recommended ? "DISCOVER_RECOMMENDED" : "DISCOVER_EXPLORE"
                        )
                    }
                }
            }
        }
    }

    private func emptyView(
        title: LocalizedStringKey,
        systemImage: String,
        description: LocalizedStringKey
    ) -> some View {
        SSEmptyState(
            title: title,
            systemImage: systemImage,
            description: description
        )
        .frame(maxWidth: .infinity)
        .padding(.top, 72)
    }

    private var emptyState: (
        title: LocalizedStringKey,
        systemImage: String,
        description: LocalizedStringKey
    ) {
        if !query.isEmpty {
            return (
                "No results in this category",
                "magnifyingglass",
                "Try another search or clear the current keyword."
            )
        }

        return switch selectedScope {
        case .recommended:
            ("Nothing to recommend yet", "sparkles", "Try another search or publish something new.")
        case .coursemates:
            ("No course actions yet", "book.closed", "Start an action that only your coursemates can see.")
        case .buddies:
            ("No buddy posts yet", "person.2", "Publish a buddy post to find the right people.")
        case .activities:
            ("No activities yet", "calendar", "Create an activity with a time and place.")
        }
    }

    private var buddies: [NativeDiscoverBuddyPost] { store.payload?.buddies ?? [] }
    private var activities: [NativeDiscoverActivity] { store.payload?.activities ?? [] }
    private var plans: [DiscoverPlanFeedItem] {
        let items: [DiscoverPlanFeedItem]
        switch selectedScope {
        case .recommended:
            let recommendations = v2Store.recommendations?.items.compactMap { recommendation -> DiscoverPlanFeedItem? in
                if let post = recommendation.post { return .post(post) }
                if let activity = recommendation.activity { return .activity(activity) }
                return nil
            }
            items = recommendations ?? (buddies.map(DiscoverPlanFeedItem.post) + activities.map(DiscoverPlanFeedItem.activity))
        case .coursemates:
            items = buddies.filter(\.isCourseAction).map(DiscoverPlanFeedItem.post)
        case .buddies:
            items = buddies.filter { !$0.isCourseAction }.map(DiscoverPlanFeedItem.post)
        case .activities:
            items = activities.map(DiscoverPlanFeedItem.activity)
        }
        let visible = DiscoverPlanFeedItem.visible(items)
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard selectedScope == .recommended, !needle.isEmpty else { return visible }
        return visible.filter { $0.searchableText.lowercased().contains(needle) }
    }

    private var recommendationReasons: [String: [String]] {
        guard selectedScope == .recommended else { return [:] }
        return Dictionary(
            uniqueKeysWithValues: (v2Store.recommendations?.items ?? []).map {
                ($0.id, $0.reasonCodes)
            }
        )
    }

    private func load() async {
        async let feedLoad: Void = store.load(using: session, query: query)
        if selectedScope == .recommended,
           clientConfiguration.configuration?.isFeatureEnabled("v2Recommendations") == true {
            await v2Store.loadRecommendations(city: cityPreference.selectedCity, using: session)
        } else {
            await v2Store.loadAssignment(using: session)
        }
        await feedLoad
    }

    private var feedContext: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            Picker("Discover category", selection: $selectedScope) {
                ForEach(DiscoverFeedScope.allCases) { scope in
                    Text(scope.title)
                        .tag(scope)
                }
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("discover-feed-scope")

            if !hasMultipleCities {
                discoverSearchField
            } else if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                    discoverSearchField
                    discoverCityControl
                }
            } else {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: SideSeatTheme.spaceSM) {
                        discoverSearchField
                            .frame(minWidth: 170)
                        discoverCityControl
                    }

                    VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                        discoverSearchField
                        discoverCityControl
                    }
                }
            }
        }
    }

    private var hasMultipleCities: Bool {
        cityPreference.servedCities.count > 1
    }

    private var discoverCityControl: some View {
        Button {
            showsCitySelection = true
        } label: {
            HStack(spacing: 5) {
                Image(systemName: "location.fill")
                Text(verbatim: DiscoverCityDisplay.localizedName(for: cityPreference.selectedCity))
                    .lineLimit(1)
                Image(systemName: "chevron.down")
                    .font(.caption2.weight(.semibold))
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .background(SideSeatTheme.surface, in: Capsule())
            .overlay {
                Capsule()
                    .strokeBorder(SideSeatTheme.separator.opacity(0.32), lineWidth: 0.5)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .fixedSize(horizontal: true, vertical: false)
        .accessibilityLabel("City")
        .accessibilityValue(DiscoverCityDisplay.localizedName(for: cityPreference.selectedCity))
        .accessibilityIdentifier("discover-feed-location")
    }

    private var discoverSearchField: some View {
        HStack(spacing: SideSeatTheme.spaceSM) {
            Image(systemName: "magnifyingglass")
                .font(.body.weight(.medium))
                .foregroundStyle(SideSeatTheme.textSecondary)
                .accessibilityHidden(true)

            TextField(selectedScope.searchPrompt, text: $query)
                .submitLabel(.search)
                .padding(.vertical, 11)
                .accessibilityLabel(selectedScope.searchPrompt)
                .accessibilityIdentifier("discover-search")

            if !query.isEmpty {
                Button {
                    query = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(SideSeatTheme.textSecondary)
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
                .accessibilityIdentifier("discover-search-clear")
            }
        }
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity, minHeight: 44)
        .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(SideSeatTheme.separator.opacity(0.32), lineWidth: 0.5)
        }
    }
}

private extension DiscoverFeedScope {
    var searchPrompt: LocalizedStringKey {
        switch self {
        case .recommended: "Search recommendations"
        case .coursemates: "Search course actions"
        case .buddies: "Search buddy posts"
        case .activities: "Search activities"
        }
    }
}

private struct DiscoverCitySelectionSheet: View {
    @Environment(\.dismiss) private var dismiss

    let cityPreference: DiscoverCityPreferenceStore

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(cityPreference.servedCities, id: \.self) { city in
                        cityRow(city)
                    }
                } footer: {
                    if cityPreference.isLoadingConfig {
                        Text("Loading available cities…")
                            .accessibilityIdentifier("discover-city-availability-note")
                    } else if cityPreference.servedCities.count == 1 {
                        Text(verbatim: singleCityExplanation)
                            .accessibilityIdentifier("discover-city-availability-note")
                    }
                }
            }
            .navigationTitle("Choose a city")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .accessibilityIdentifier("discover-city-done")
                }
            }
        }
        .accessibilityIdentifier("discover-city-picker-sheet")
    }

    private func cityRow(_ city: String) -> some View {
        let isSelected = cityPreference.selectedCity == city
        let displayName = DiscoverCityDisplay.localizedName(for: city)

        return Button {
            cityPreference.select(city)
        } label: {
            HStack(spacing: SideSeatTheme.spaceMD) {
                Text(verbatim: displayName)
                    .foregroundStyle(SideSeatTheme.textPrimary)
                Spacer(minLength: SideSeatTheme.spaceMD)
                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.accentText)
                }
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(displayName)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityIdentifier("discover-city-option-\(city.lowercased())")
    }

    private var singleCityExplanation: String {
        guard let city = cityPreference.servedCities.first else { return "" }
        return String.localizedStringWithFormat(
            AppLocalization.string("Only %@ is available right now. More cities are coming."),
            DiscoverCityDisplay.localizedName(for: city)
        )
    }
}

private struct DiscoverFeedLoadKey: Hashable {
    let city: String
    let query: String
    let scope: DiscoverFeedScope
}

private struct RecommendationReasonRow: View {
    let reasonCodes: [String]

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "sparkles")
            Text(reasonCodes.map(Self.label).joined(separator: " · "))
                .lineLimit(1)
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(SideSeatTheme.accentText)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            String(
                format: AppLocalization.string("Recommended because %@"),
                reasonCodes.map(Self.label).joined(separator: ", ")
            )
        )
    }

    private static func label(_ code: String) -> String {
        switch code {
        case "MATCHES_INTEREST": AppLocalization.string("Matches your interests")
        case "SAME_COURSE": AppLocalization.string("Same course")
        case "SHARED_LANGUAGE": AppLocalization.string("Shared language")
        case "FITS_SOCIAL_TIME": AppLocalization.string("Fits your time")
        case "UPCOMING": AppLocalization.string("Coming up")
        default: AppLocalization.string("Recent")
        }
    }
}

private struct DiscoverFeedButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? SideSeatTheme.Interaction.pressedOpacity : 1)
            .scaleEffect(configuration.isPressed ? SideSeatTheme.Interaction.pressedScale : 1)
            .animation(
                .easeOut(duration: SideSeatTheme.Interaction.pressDuration),
                value: configuration.isPressed
            )
    }
}

private extension View {
    func productFunnelImpression(
        sourceKind: String,
        sourceID: String,
        surface: String
    ) -> some View {
        background {
            ProductFunnelImpressionProbe(
                sourceKind: sourceKind,
                sourceID: sourceID,
                surface: surface
            )
        }
    }

    func discoverFeedCard() -> some View {
        background(
            SideSeatTheme.surface,
            in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                .strokeBorder(SideSeatTheme.separator.opacity(0.28), lineWidth: 0.5)
        }
        .clipShape(RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous))
    }
}

private struct ProductFunnelImpressionProbe: View {
    @Environment(SessionStore.self) private var session
    let sourceKind: String
    let sourceID: String
    let surface: String

    @State private var isHalfVisible = false
    @State private var didSend = false

    var body: some View {
        GeometryReader { proxy in
            Color.clear
                .onAppear { updateVisibility(proxy.frame(in: .global)) }
                .onChange(of: proxy.frame(in: .global)) { _, frame in
                    updateVisibility(frame)
                }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .task(id: isHalfVisible) {
            guard isHalfVisible, !didSend else { return }
            try? await Task.sleep(for: .milliseconds(500))
            guard !Task.isCancelled, isHalfVisible, !didSend else { return }
            didSend = true
            await send()
        }
    }

    private func updateVisibility(_ frame: CGRect) {
        guard frame.width > 0, frame.height > 0 else {
            isHalfVisible = false
            return
        }
        let visible = frame.intersection(UIScreen.main.bounds)
        isHalfVisible = !visible.isNull
            && visible.width * visible.height >= frame.width * frame.height * 0.5
    }

    private func send() async {
        await ProductFunnelReporter.record(
            name: "OPPORTUNITY_IMPRESSION",
            surface: surface,
            sourceKind: sourceKind,
            sourceID: sourceID,
            metadata: NativeProductFunnelMetadata(visibilityDurationMs: 500),
            using: session
        )
    }
}

private extension NativeDiscoverBuddyPost {
    var isCourseAction: Bool {
        category.uppercased() == "SHARED_COURSES"
            || visibility.uppercased() == "COURSEMATES_ONLY"
            || !linkedCourses.isEmpty
    }
}

enum DiscoverPlanFeedItem: Identifiable {
    case post(NativeDiscoverBuddyPost)
    case activity(NativeDiscoverActivity)

    var id: String {
        switch self {
        case .post(let post): "post-\(post.id)"
        case .activity(let activity): "activity-\(activity.id)"
        }
    }

    var searchableText: String {
        switch self {
        case .post(let post):
            return [post.title, post.body, post.location]
                .compactMap { $0 }
                .joined(separator: " ")
        case .activity(let activity):
            return [activity.title, activity.description, activity.location]
                .compactMap { $0 }
                .joined(separator: " ")
        }
    }

    private enum TimingGroup: Int {
        case ongoing
        case upcoming
        case unscheduled
        case past
    }

    private var scheduledDate: Date? {
        switch self {
        case .post(let post): post.startDate
        case .activity(let activity): activity.startDate
        }
    }

    private var scheduledEndDate: Date? {
        switch self {
        case .post(let post): post.endDate
        case .activity(let activity): activity.endDate
        }
    }

    private var publishedDate: Date {
        switch self {
        case .post(let post):
            (try? Date(post.createdAt, strategy: .iso8601)) ?? .distantPast
        case .activity(let activity):
            activity.startDate ?? .distantPast
        }
    }

    static func ordered(_ items: [Self], now: Date = Date()) -> [Self] {
        items.sorted { left, right in
            let leftRank = left.rank(now: now)
            let rightRank = right.rank(now: now)

            if leftRank.group.rawValue != rightRank.group.rawValue {
                return leftRank.group.rawValue < rightRank.group.rawValue
            }

            if leftRank.date != rightRank.date {
                switch leftRank.group {
                case .ongoing, .upcoming:
                    return leftRank.date < rightRank.date
                case .unscheduled, .past:
                    return leftRank.date > rightRank.date
                }
            }

            return left.id < right.id
        }
    }

    static func visible(_ items: [Self], now: Date = Date()) -> [Self] {
        ordered(items.filter { $0.isVisible(now: now) }, now: now)
    }

    private func isVisible(now: Date) -> Bool {
        switch self {
        case .post(let post):
            if let end = post.endDate { return end >= now }
            if let start = post.startDate { return start >= now }
            return true
        case .activity(let activity):
            return activity.endDate.map { $0 >= now } ?? activity.startDate.map { $0 >= now } ?? false
        }
    }

    private func rank(now: Date) -> (group: TimingGroup, date: Date) {
        guard let scheduledDate else {
            return (.unscheduled, publishedDate)
        }
        if scheduledDate <= now, scheduledEndDate.map({ $0 >= now }) == true {
            return (.ongoing, scheduledEndDate ?? scheduledDate)
        }
        if scheduledDate >= now {
            return (.upcoming, scheduledDate)
        }
        return (.past, scheduledDate)
    }
}

private struct DiscoverBuddyRow: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let post: NativeDiscoverBuddyPost

    private var academicLine: String? {
        let values = [post.author.studentRoleLabel, post.author.major]
            .compactMap { value -> String? in
                guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else {
                    return nil
                }
                return value
            }
        return values.isEmpty ? nil : values.joined(separator: " · ")
    }

    private var authorContext: String? {
        let school = post.author.school?.trimmingCharacters(in: .whitespacesAndNewlines)
        let tagline = post.author.tagline?.trimmingCharacters(in: .whitespacesAndNewlines)
        let supporting = tagline?.isEmpty == false ? tagline : academicLine
        let values = [school, supporting].compactMap { value -> String? in
            guard let value, !value.isEmpty else { return nil }
            return value
        }
        return values.isEmpty ? nil : values.joined(separator: " · ")
    }

    private var showsRestrictedVisibility: Bool {
        post.visibility.uppercased() != "CITY_INTERNATIONALS"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            DiscoverFeedAuthorHeader(
                name: post.author.displayName,
                avatarURL: post.author.avatarUrl,
                context: authorContext,
                school: post.author.school,
                isOwn: post.isOwn,
                isVerified: post.author.verifiedStudent,
                status: nil,
                timestamp: try? Date(post.createdAt, strategy: .iso8601),
                nameAccessibilityID: "discover-author-name-visual-\(post.id)",
                contextAccessibilityID: "discover-author-tagline-visual-\(post.id)",
                verificationAccessibilityID: "discover-school-verification-\(post.id)",
                statusAccessibilityID: nil
            )
            .padding(.horizontal, SideSeatTheme.spaceLG)
            .padding(.top, 14)
            .padding(.bottom, SideSeatTheme.spaceMD)

            VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                postSummary

                if !post.imageUrls.isEmpty {
                    DiscoverPostMediaGrid(
                        imageURLs: post.imageUrls,
                        accessibilityID: "discover-plan-media-\(post.id)"
                    )
                    .frame(height: dynamicTypeSize.isAccessibilitySize ? 180 : 148)
                }

                if post.startDate != nil || post.location != nil {
                    DiscoverFeedScheduleSummary(
                        start: post.startDate,
                        end: post.endDate,
                        location: post.location,
                        dateAccessibilityID: "discover-post-date-visual-\(post.id)",
                        locationAccessibilityID: "discover-post-location-visual-\(post.id)"
                    )
                }
            }
            .padding(.horizontal, SideSeatTheme.spaceLG)
            .padding(.bottom, 14)

            Divider()

            feedFooter
                .padding(.horizontal, SideSeatTheme.spaceLG)
                .frame(minHeight: 44)
        }
        .discoverFeedCard()
        .contentShape(Rectangle())
    }

    private var postSummary: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(post.title)
                .font(.headline)
                .foregroundStyle(.primary)
                .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 2)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("discover-post-title-visual-\(post.id)")

            if let body = post.body, !body.isEmpty {
                Text(body)
                    .font(.subheadline)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : (post.imageUrls.isEmpty ? 3 : 2))
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("discover-post-body-visual-\(post.id)")
            }

            if !post.tags.isEmpty {
                HStack(spacing: 10) {
                    ForEach(post.tags.prefix(3), id: \.self) { tag in
                        Text("#\(tag)")
                    }
                    if post.tags.count > 3 {
                        Text("+\(post.tags.count - 3)")
                    }
                }
                .font(.caption.weight(.medium))
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .lineLimit(1)
                .accessibilityIdentifier("discover-tags-visual-\(post.id)")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var feedFooter: some View {
        HStack(spacing: SideSeatTheme.spaceSM) {
            if post.isCourseAction {
                Label("Course action", systemImage: "book.closed.fill")
            } else {
                Label("Find buddies", systemImage: "person.2")
            }

            if post.isCourseAction, let course = post.linkedCourses.first {
                Text("·")
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                if let code = course.code, !code.isEmpty {
                    Text(verbatim: code)
                        .lineLimit(1)
                } else {
                    Text(verbatim: course.name)
                        .lineLimit(1)
                }
            }

            if showsRestrictedVisibility {
                Text("·")
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                Label(
                    BuddyPostDisplay.visibilityLabel(post.visibility),
                    systemImage: BuddyPostDisplay.visibilitySystemImage(post.visibility)
                )
                .accessibilityIdentifier("discover-visibility-\(post.id)")
            }

            Spacer(minLength: SideSeatTheme.spaceSM)

            HStack(spacing: SideSeatTheme.spaceMD) {
                if post.commentCount > 0 {
                    Label("\(post.commentCount)", systemImage: "bubble.left")
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel(
                            String.localizedStringWithFormat(
                                AppLocalization.string( "%lld comments"),
                                Int64(post.commentCount)
                            )
                        )
                        .accessibilityValue("\(post.commentCount)")
                        .accessibilityIdentifier("discover-comment-count-\(post.id)-\(post.commentCount)")
                }

                if post.interestedCount > 0 {
                    Label(
                        "\(post.interestedCount)",
                        systemImage: post.savedByViewer ? "heart.fill" : "heart"
                    )
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                    .accessibilityElement(children: .combine)
                    .foregroundStyle(
                        post.savedByViewer ? SideSeatTheme.accentText : SideSeatTheme.textPrimary
                    )
                    .accessibilityLabel(
                        String.localizedStringWithFormat(
                            AppLocalization.string( "%lld interested"),
                            Int64(post.interestedCount)
                        )
                    )
                    .accessibilityIdentifier("discover-interest-\(post.id)")
                }
            }
            .font(.subheadline.weight(.semibold))
        }
        .font(.caption.weight(.medium))
        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
        .fixedSize(horizontal: false, vertical: true)
    }
}

private struct DiscoverPostMediaGrid: View {
    let imageURLs: [String]
    let accessibilityID: String

    private let gap: CGFloat = 3

    private var visibleURLs: [String] {
        Array(imageURLs.prefix(3))
    }

    private var hiddenCount: Int {
        max(0, imageURLs.count - visibleURLs.count)
    }

    var body: some View {
        GeometryReader { proxy in
            let availableWidth = proxy.size.width.isFinite
                ? max(0, proxy.size.width - gap)
                : 0

            switch visibleURLs.count {
            case 0:
                placeholder(systemImage: "photo")
                    .frame(width: proxy.size.width, height: proxy.size.height)
            case 1:
                tile(visibleURLs[0])
                    .frame(width: proxy.size.width, height: proxy.size.height)
            case 2:
                HStack(spacing: gap) {
                    ForEach(visibleURLs.indices, id: \.self) { index in
                        tile(visibleURLs[index])
                    }
                }
            default:
                HStack(spacing: gap) {
                    tile(visibleURLs[0])
                        .frame(width: availableWidth * 0.64)
                    VStack(spacing: gap) {
                        tile(visibleURLs[1])
                        tile(visibleURLs[2], hiddenCount: hiddenCount)
                    }
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.06), lineWidth: 1)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            imageURLs.count == 1
                ? AppLocalization.string( "1 photo")
                : AppLocalization.string( "\(imageURLs.count) photos")
        )
        .accessibilityIdentifier(accessibilityID)
    }

    private func tile(_ value: String, hiddenCount: Int = 0) -> some View {
        ZStack {
            DiscoverMediaImage(source: value)

            if hiddenCount > 0 {
                Color.black.opacity(0.42)
                Text("+\(hiddenCount)")
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(.white)
                    .monospacedDigit()
                    .accessibilityHidden(true)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
    }

    private func placeholder(systemImage: String) -> some View {
        ZStack {
            SideSeatTheme.fillSubtle
            Image(systemName: systemImage)
                .font(.title3)
                .foregroundStyle(SideSeatTheme.textSecondary)
        }
    }
}

struct DiscoverMediaImage: View {
    let source: String
    var contentMode: ContentMode = .fill
    var placeholderBackground: Color = SideSeatTheme.fillSubtle
    var placeholderForeground: Color = SideSeatTheme.textSecondary

    var body: some View {
        Group {
            #if DEBUG
            if let previewAssetName {
                Image(previewAssetName)
                    .resizable()
                    .aspectRatio(contentMode: contentMode)
            } else {
                remoteImage
            }
            #else
            remoteImage
            #endif
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
    }

    private var remoteImage: some View {
        AsyncImage(url: URL(string: source)) { phase in
            switch phase {
            case .success(let image):
                image
                    .resizable()
                    .aspectRatio(contentMode: contentMode)
            case .failure:
                placeholder(systemImage: "photo.badge.exclamationmark")
            default:
                ZStack {
                    placeholderBackground
                    ProgressView()
                        .controlSize(.small)
                        .tint(placeholderForeground)
                }
            }
        }
    }

    #if DEBUG
    private var previewAssetName: String? {
        switch source {
        case "sideseat-preview://discover-study/1", "sideseat-preview://discover-study/4":
            "DiscoverStudyFixture1"
        case "sideseat-preview://discover-study/2":
            "DiscoverStudyFixture2"
        case "sideseat-preview://discover-study/3":
            "DiscoverStudyFixture3"
        default:
            nil
        }
    }
    #endif

    private func placeholder(systemImage: String) -> some View {
        ZStack {
            placeholderBackground
            Image(systemName: systemImage)
                .font(.title3)
                .foregroundStyle(placeholderForeground)
        }
    }
}

private struct DiscoverActivityRow: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let activity: NativeDiscoverActivity

    private var status: DiscoverStatusPresentation {
        DiscoverActivityDisplay.status(activity)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            DiscoverFeedAuthorHeader(
                name: activity.organizer.displayName,
                avatarURL: activity.organizer.avatarUrl,
                context: "\(activity.school) · \(AppLocalization.string( "Organizer"))",
                school: activity.school,
                isOwn: activity.isOrganizer,
                isVerified: activity.organizer.verifiedStudent,
                status: status.isOpen ? nil : status,
                timestamp: nil,
                nameAccessibilityID: "discover-activity-author-name-visual-\(activity.id)",
                contextAccessibilityID: "discover-activity-school-visual-\(activity.id)",
                verificationAccessibilityID: "discover-activity-verification-\(activity.id)",
                statusAccessibilityID: status.isOpen
                    ? nil
                    : "discover-status-activity-\(activity.id)"
            )
            .padding(.horizontal, SideSeatTheme.spaceLG)
            .padding(.top, 14)
            .padding(.bottom, SideSeatTheme.spaceMD)

            VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                VStack(alignment: .leading, spacing: 7) {
                    Text(activity.title)
                        .font(.headline)
                        .foregroundStyle(.primary)
                        .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 2)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("discover-activity-title-visual-\(activity.id)")
                    if let description = activity.description, !description.isEmpty {
                        Text(description)
                            .font(.subheadline)
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                            .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 3)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("discover-activity-description-visual-\(activity.id)")
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                DiscoverFeedScheduleSummary(
                    start: activity.startDate,
                    end: activity.endDate,
                    location: activity.location,
                    dateAccessibilityID: "discover-activity-date-visual-\(activity.id)",
                    locationAccessibilityID: "discover-activity-location-visual-\(activity.id)"
                )
            }
            .padding(.horizontal, SideSeatTheme.spaceLG)
            .padding(.bottom, 14)

            Divider()

            HStack(spacing: SideSeatTheme.spaceSM) {
                Label("Activity", systemImage: "calendar.badge.plus")
                Spacer(minLength: 0)
                HStack(spacing: SideSeatTheme.spaceMD) {
                    if activity.commentCount > 0 {
                        Label("\(activity.commentCount)", systemImage: "bubble.left")
                            .foregroundStyle(SideSeatTheme.textPrimary)
                            .accessibilityLabel(
                                String.localizedStringWithFormat(
                                    AppLocalization.string( "%lld comments"),
                                    Int64(activity.commentCount)
                                )
                            )
                            .accessibilityValue("\(activity.commentCount)")
                            .accessibilityIdentifier(
                                "discover-activity-comment-count-\(activity.id)-\(activity.commentCount)"
                            )
                    }

                    if let capacity = activity.capacity {
                        Label("\(activity.goingCount)/\(capacity)", systemImage: "person.2")
                            .foregroundStyle(SideSeatTheme.textPrimary)
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                            .accessibilityElement(children: .combine)
                            .accessibilityLabel(
                                String.localizedStringWithFormat(
                                    AppLocalization.string( "%lld/%lld going"),
                                    Int64(activity.goingCount),
                                    Int64(capacity)
                                )
                            )
                            .accessibilityIdentifier("discover-activity-attendance-\(activity.id)")
                    } else {
                        Label("\(activity.goingCount)", systemImage: "person.2")
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                            .accessibilityElement(children: .combine)
                            .accessibilityLabel(
                                String.localizedStringWithFormat(
                                    AppLocalization.string( "%lld going"),
                                    Int64(activity.goingCount)
                                )
                            )
                            .accessibilityIdentifier("discover-activity-attendance-\(activity.id)")
                    }
                }
            }
            .font(.caption.weight(.medium))
            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
            .padding(.horizontal, SideSeatTheme.spaceLG)
            .frame(minHeight: 44)
        }
        .discoverFeedCard()
        .contentShape(Rectangle())
    }

}

private struct DiscoverFeedScheduleSummary: View {
    let start: Date?
    let end: Date?
    let location: String?
    let dateAccessibilityID: String
    let locationAccessibilityID: String

    var body: some View {
        HStack(alignment: .center, spacing: SideSeatTheme.spaceMD) {
            if let start {
                VStack(spacing: 1) {
                    Text(start.formatted(.dateTime.month(.abbreviated)).uppercased())
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .accessibilityIdentifier("discover-feed-date-tile-month-visual")
                    Text(start.formatted(.dateTime.day()))
                        .font(.title3.weight(.bold))
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .accessibilityIdentifier("discover-feed-date-tile-day-visual")
                }
                .frame(width: 46, height: 48)
                .background(
                    SideSeatTheme.fillTertiary,
                    in: RoundedRectangle(cornerRadius: 10, style: .continuous)
                )
                .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 4) {
                    Text(timeLabel(start: start, end: end))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .lineLimit(1)
                        .accessibilityLabel(accessibleDateTimeLabel(start: start, end: end))
                        .accessibilityIdentifier(dateAccessibilityID)

                    if let location = normalizedLocation {
                        Label(location, systemImage: "mappin.and.ellipse")
                            .font(.caption)
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                            .lineLimit(1)
                            .accessibilityIdentifier(locationAccessibilityID)
                    }
                }
            } else if let location = normalizedLocation {
                Label(location, systemImage: "mappin.and.ellipse")
                    .font(.subheadline)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .lineLimit(1)
                    .accessibilityIdentifier(locationAccessibilityID)
            }

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var normalizedLocation: String? {
        guard let value = location?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else {
            return nil
        }
        return value
    }

    private func timeLabel(start: Date, end: Date?) -> String {
        let weekday = start.formatted(.dateTime.weekday(.abbreviated))
        let startTime = start.formatted(date: .omitted, time: .shortened)
        guard let end else { return "\(weekday) · \(startTime)" }
        return "\(weekday) · \(startTime)-\(end.formatted(date: .omitted, time: .shortened))"
    }

    private func accessibleDateTimeLabel(start: Date, end: Date?) -> String {
        let date = start.formatted(.dateTime.year().month(.wide).day().weekday(.wide))
        let startTime = start.formatted(date: .omitted, time: .shortened)
        guard let end else { return "\(date), \(startTime)" }
        let endTime = end.formatted(date: .omitted, time: .shortened)
        return "\(date), \(startTime)-\(endTime)"
    }
}

private struct DiscoverFeedAuthorHeader: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let name: String
    let avatarURL: String?
    let context: String?
    let school: String?
    let isOwn: Bool
    let isVerified: Bool
    let status: DiscoverStatusPresentation?
    let timestamp: Date?
    let nameAccessibilityID: String
    let contextAccessibilityID: String
    let verificationAccessibilityID: String
    let statusAccessibilityID: String?

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            InitialAvatar(name: name, url: avatarURL, size: 36)

            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 6) {
                    identityLine

                    contextLabel

                    if status != nil || timestamp != nil {
                        HStack(alignment: .center, spacing: SideSeatTheme.spaceSM) {
                            statusBadge
                            Spacer(minLength: SideSeatTheme.spaceSM)
                            timestampLabel
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                VStack(alignment: .leading, spacing: 3) {
                    HStack(alignment: .center, spacing: 8) {
                        identityLine
                            .layoutPriority(1)
                        statusBadge
                    }

                    if hasSupportingLine {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            contextLabel
                                .layoutPriority(1)
                            Spacer(minLength: SideSeatTheme.spaceSM)
                            timestampLabel
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private var hasSupportingLine: Bool {
        context?.isEmpty == false || timestamp != nil
    }

    private var identityLine: some View {
        HStack(spacing: 5) {
            Text(name)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.primary)
                .lineLimit(1)
                .accessibilityIdentifier(nameAccessibilityID)

            if isVerified {
                VerifiedSchoolMark(
                    school: school,
                    compact: true,
                    accessibilityID: verificationAccessibilityID
                )
            }

            if isOwn {
                Text("You")
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var statusBadge: some View {
        if let status, let statusAccessibilityID {
            DiscoverStatusBadge(status: status)
                .fixedSize(horizontal: true, vertical: false)
                .accessibilityIdentifier(statusAccessibilityID)
        }
    }

    @ViewBuilder
    private var contextLabel: some View {
        if let context, !context.isEmpty {
            Text(context)
                .font(.caption)
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .lineLimit(dynamicTypeSize.isAccessibilitySize ? 2 : 1)
                .accessibilityIdentifier(contextAccessibilityID)
        }
    }

    @ViewBuilder
    private var timestampLabel: some View {
        if let timestamp {
            Text(min(timestamp, Date()).formatted(.relative(presentation: .named)))
                .font(.caption.weight(.medium))
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .lineLimit(1)
                .fixedSize(horizontal: true, vertical: false)
                .accessibilityIdentifier("discover-post-age")
        }
    }
}

struct DiscoverStatusBadge: View {
    let status: DiscoverStatusPresentation

    private var foreground: Color {
        switch status.tone {
        case .success: SideSeatTheme.statusSuccessText
        case .warning: SideSeatTheme.statusWarningText
        case .danger: SideSeatTheme.statusDangerText
        case .neutral: SideSeatTheme.textSecondaryStrong
        }
    }

    private var fill: Color {
        switch status.tone {
        case .success: SideSeatTheme.success.opacity(0.12)
        case .warning: SideSeatTheme.warning.opacity(0.14)
        case .danger: SideSeatTheme.danger.opacity(0.12)
        case .neutral: SideSeatTheme.fillTertiary
        }
    }

    var body: some View {
        Label(status.label, systemImage: status.systemImage)
            .labelStyle(.titleAndIcon)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(foreground)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(fill, in: Capsule())
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// The same persisted p01…p20 identities are used by the web and native clients.
struct NativeSystemAvatar: Identifiable, Equatable, Sendable {
    let id: String
    let nameKey: String

    var assetName: String { "SystemAvatar-\(id)" }
    var localizedName: String { AppLocalization.string(String.LocalizationValue(nameKey)) }

    static let all: [NativeSystemAvatar] = [
        NativeSystemAvatar(id: "p01", nameKey: "Peach cat"),
        NativeSystemAvatar(id: "p02", nameKey: "Mint rabbit"),
        NativeSystemAvatar(id: "p03", nameKey: "Honey bear"),
        NativeSystemAvatar(id: "p04", nameKey: "Apricot fox"),
        NativeSystemAvatar(id: "p05", nameKey: "Cloud koala"),
        NativeSystemAvatar(id: "p06", nameKey: "Bamboo panda"),
        NativeSystemAvatar(id: "p07", nameKey: "Cocoa otter"),
        NativeSystemAvatar(id: "p08", nameKey: "Blueberry penguin"),
        NativeSystemAvatar(id: "p09", nameKey: "Biscuit puppy"),
        NativeSystemAvatar(id: "p10", nameKey: "Pond frog"),
        NativeSystemAvatar(id: "p11", nameKey: "Lilac cat"),
        NativeSystemAvatar(id: "p12", nameKey: "Rose rabbit"),
        NativeSystemAvatar(id: "p13", nameKey: "Sage bear"),
        NativeSystemAvatar(id: "p14", nameKey: "Dusk fox"),
        NativeSystemAvatar(id: "p15", nameKey: "Sand koala"),
        NativeSystemAvatar(id: "p16", nameKey: "Pebble panda"),
        NativeSystemAvatar(id: "p17", nameKey: "River otter"),
        NativeSystemAvatar(id: "p18", nameKey: "Sunrise penguin"),
        NativeSystemAvatar(id: "p19", nameKey: "Maple puppy"),
        NativeSystemAvatar(id: "p20", nameKey: "Matcha frog"),
    ]
    static let defaultID = "p01"

    static func presetID(for value: String?) -> String? {
        all.first {
            value == $0.id || value == "/avatars/\($0.id).jpeg"
                || value == "/avatars/companions-v1/\($0.id).svg"
        }?.id
    }
}

enum NativeAvatarSource: Equatable {
    case preset(String)
    case remote(URL)

    static func resolve(_ value: String?) -> NativeAvatarSource {
        if let id = NativeSystemAvatar.presetID(for: value) { return .preset(id) }
        if let value, let url = URL(string: value),
           ["https", "http", "data"].contains(url.scheme?.lowercased() ?? "") {
            return .remote(url)
        }
        return .preset(NativeSystemAvatar.defaultID)
    }
}

/// Unclipped content so individual circles and group collage tiles share resolution.
private struct NativeAvatarImage: View {
    let value: String?

    var body: some View {
        switch NativeAvatarSource.resolve(value) {
        case .preset(let id):
            Image("SystemAvatar-\(id)").resizable().scaledToFill()
        case .remote(let url):
            AsyncImage(url: url) { phase in
                if case .success(let image) = phase {
                    image.resizable().scaledToFill()
                } else {
                    Image("SystemAvatar-\(NativeSystemAvatar.defaultID)")
                        .resizable().scaledToFill()
                }
            }
        }
    }
}

struct InitialAvatar: View {
    let name: String
    var url: String? = nil
    var size: CGFloat = 36

    var body: some View {
        NativeAvatarImage(value: url)
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay {
            Circle().strokeBorder(Color.primary.opacity(0.08), lineWidth: 1)
        }
        .accessibilityHidden(true)
    }

}

/// WeChat-style rounded-square collage of up to 9 member avatars.
struct GroupCompositeAvatar: View {
    struct Member: Hashable, Sendable {
        let name: String
        let url: String?
    }

    let members: [Member]
    var size: CGFloat = 44

    private var tiles: [Member] {
        Array(members.prefix(9))
    }

    var body: some View {
        let gap = max(1, size * 0.045)
        let rows = Self.rowLayout(count: tiles.count)
        let maxCols = CGFloat(rows.map(\.count).max() ?? 1)
        let cell = max(1, (size - gap * 2 - gap * (maxCols - 1)) / maxCols)

        VStack(spacing: gap) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                HStack(spacing: gap) {
                    ForEach(row, id: \.self) { index in
                        tile(tiles[index], cell: cell)
                    }
                }
            }
        }
        .padding(gap)
        .frame(width: size, height: size)
        .background(SideSeatTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: size * 0.18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: size * 0.18, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.08), lineWidth: 1)
        }
        .accessibilityHidden(true)
    }

    private func tile(_ member: Member, cell: CGFloat) -> some View {
        NativeAvatarImage(value: member.url)
        .frame(width: cell, height: cell)
        .clipped()
    }

    /// WeChat-style row groupings for 1…9 faces.
    private static func rowLayout(count: Int) -> [[Int]] {
        switch max(0, count) {
        case 0: return []
        case 1: return [[0]]
        case 2: return [[0, 1]]
        case 3: return [[0], [1, 2]]
        case 4: return [[0, 1], [2, 3]]
        case 5: return [[0, 1], [2, 3, 4]]
        case 6: return [[0, 1, 2], [3, 4, 5]]
        case 7: return [[0], [1, 2, 3], [4, 5, 6]]
        case 8: return [[0, 1], [2, 3, 4], [5, 6, 7]]
        default: return [[0, 1, 2], [3, 4, 5], [6, 7, 8]]
        }
    }

    private static func tileColor(for name: String) -> Color {
        SideSeatTheme.AvatarPalette.color(for: name)
    }
}
