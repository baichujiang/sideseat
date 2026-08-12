import SwiftUI

struct DiscoverRootView: View {
    @Environment(SessionStore.self) private var session
    @Binding private var createDestination: CreateDestination?
    @State private var store = DiscoverFeedStore()
    @State private var query = ""

    init(createDestination: Binding<CreateDestination?>) {
        _createDestination = createDestination
    }

    var body: some View {
        ScrollView {
            if let issue = store.issue, store.payload == nil {
                ContentUnavailableView {
                    Label("Could not load Discover", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(issue)
                } actions: {
                    Button("Try again") { Task { await load() } }
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 96)
            } else if store.payload == nil {
                SSLoadingState("Loading Discover")
                    .frame(maxWidth: .infinity)
                    .padding(.top, 120)
            } else {
                LazyVStack(spacing: SideSeatTheme.spaceMD) {
                    if !plans.isEmpty {
                        feedContext
                    }
                    feedContent
                }
                .padding(.horizontal, SideSeatTheme.spaceMD)
                .padding(.top, SideSeatTheme.spaceSM)
                .padding(.bottom, SideSeatTheme.spaceXL)
            }
        }
        .background(SideSeatTheme.bgGrouped)
        .scrollDismissesKeyboard(.interactively)
        .ssRootNavigationTitle("Discover")
        .searchable(text: $query, prompt: "Search")
        .refreshable { await load() }
        // Create forms are presented by `AppShellView` so the center Create action
        // never has to switch tabs (which caused a full-screen flash).
        .onChange(of: createDestination) { previous, destination in
            if destination == nil {
                switch previous {
                case .plan:
                    query = ""
                case .none:
                    break
                }
                Task { await load() }
            }
        }
        .task(id: query) {
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
            emptyView(title: "No plans yet", description: "Try another search or create a plan.")
        } else {
            ForEach(plans) { item in
                switch item {
                case .post(let post):
                    NavigationLink(value: AppRoute.discoverPost(postID: post.id)) {
                        DiscoverBuddyRow(post: post)
                    }
                    .buttonStyle(DiscoverFeedButtonStyle())
                    .accessibilityIdentifier("discover-plan-\(post.id)")
                case .activity(let activity):
                    NavigationLink(value: AppRoute.activity(activityID: activity.id)) {
                        DiscoverActivityRow(activity: activity)
                    }
                    .buttonStyle(DiscoverFeedButtonStyle())
                    .accessibilityIdentifier("discover-plan-legacy-\(activity.id)")
                }
            }
        }
    }

    private func emptyView(title: LocalizedStringKey, description: LocalizedStringKey) -> some View {
        SSEmptyState(
            title: title,
            systemImage: "person.2",
            description: description
        )
        .frame(maxWidth: .infinity)
        .padding(.top, 72)
    }

    private var buddies: [NativeDiscoverBuddyPost] { store.payload?.buddies ?? [] }
    private var activities: [NativeDiscoverActivity] { store.payload?.activities ?? [] }
    private var plans: [DiscoverPlanFeedItem] {
        (buddies.map(DiscoverPlanFeedItem.post) + activities.map(DiscoverPlanFeedItem.activity))
            .sorted { $0.sortDate > $1.sortDate }
    }

    private func load() async {
        await store.load(using: session, query: query)
    }

    private var feedContext: some View {
        HStack(spacing: SideSeatTheme.spaceSM) {
            Label(store.payload?.city ?? "Munich", systemImage: "location.fill")
                .lineLimit(1)
            Spacer(minLength: SideSeatTheme.spaceMD)
            HStack(spacing: 4) {
                Text("\(plans.count)")
                    .monospacedDigit()
                Text("Plans")
            }
        }
        .font(.caption.weight(.medium))
        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
        .padding(.horizontal, SideSeatTheme.spaceXS)
        .accessibilityIdentifier("discover-feed-context")
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
    func discoverFeedCard() -> some View {
        padding(14)
            .background(
                SideSeatTheme.surface,
                in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                    .strokeBorder(SideSeatTheme.separator.opacity(0.22), lineWidth: 0.5)
            }
    }
}

private enum DiscoverPlanFeedItem: Identifiable {
    case post(NativeDiscoverBuddyPost)
    case activity(NativeDiscoverActivity)

    var id: String {
        switch self {
        case .post(let post): "post-\(post.id)"
        case .activity(let activity): "activity-\(activity.id)"
        }
    }

    var sortDate: Date {
        switch self {
        case .post(let post):
            return post.startDate ?? (try? Date(post.createdAt, strategy: .iso8601)) ?? .distantPast
        case .activity(let activity):
            return activity.startDate ?? .distantPast
        }
    }
}

private struct DiscoverBuddyRow: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let post: NativeDiscoverBuddyPost

    private var status: DiscoverStatusPresentation {
        BuddyPostDisplay.status(post)
    }

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

    private var authorSubtitle: String? {
        if let tagline = post.author.tagline?.trimmingCharacters(in: .whitespacesAndNewlines),
           !tagline.isEmpty {
            return tagline
        }
        return academicLine
    }

    private var showsRestrictedVisibility: Bool {
        post.visibility.uppercased() != "CITY_INTERNATIONALS"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                InitialAvatar(name: post.author.displayName, url: post.author.avatarUrl, size: 38)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(post.author.displayName)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.primary)
                            .accessibilityIdentifier("discover-author-name-visual-\(post.id)")
                        if post.author.verifiedStudent {
                            SchoolIdentityBadge(
                                school: post.author.school,
                                verifiedStudent: true,
                                status: "VERIFIED",
                                compact: true
                            )
                            .accessibilityIdentifier("discover-school-verification-\(post.id)")
                        }
                        if post.isOwn {
                            Text("You")
                                .font(.caption2.weight(.medium))
                                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        }
                    }

                    if let authorSubtitle {
                        Text(authorSubtitle)
                            .font(.caption)
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                            .lineLimit(1)
                            .accessibilityIdentifier("discover-author-tagline-visual-\(post.id)")
                    }
                }
                Spacer(minLength: SideSeatTheme.spaceSM)
                DiscoverStatusBadge(status: status)
                    .accessibilityIdentifier("discover-status-\(post.id)")
            }

            if !post.imageUrls.isEmpty {
                if dynamicTypeSize.isAccessibilitySize {
                    VStack(alignment: .leading, spacing: 10) {
                        postSummary
                        DiscoverPostMediaGrid(
                            imageURLs: post.imageUrls,
                            accessibilityID: "discover-plan-media-\(post.id)"
                        )
                        .frame(height: 156)
                    }
                } else {
                    HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
                        postSummary
                        DiscoverPostMediaGrid(
                            imageURLs: post.imageUrls,
                            accessibilityID: "discover-plan-media-\(post.id)"
                        )
                        .frame(width: 104, height: 92)
                        .layoutPriority(1)
                    }
                }
            } else {
                postSummary
            }

            if post.startDate != nil || post.location != nil {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 12) {
                        postScheduleMetadata
                    }
                    VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                        postScheduleMetadata
                    }
                }
                .font(.caption)
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .padding(10)
                .background(
                    SideSeatTheme.fillSubtle,
                    in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                )
            }

            if showsRestrictedVisibility || post.interestedCount > 0 {
                HStack(spacing: SideSeatTheme.spaceSM) {
                    if showsRestrictedVisibility {
                        visibilityBadge
                    }
                    Spacer(minLength: 0)
                    interestLabel
                }
            }
        }
        .discoverFeedCard()
        .contentShape(Rectangle())
    }

    private var postSummary: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(post.title)
                .font(.body.weight(.semibold))
                .foregroundStyle(.primary)
                .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 2)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("discover-post-title-visual-\(post.id)")

            if let body = post.body, !body.isEmpty {
                Text(body)
                    .font(.subheadline)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 2)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("discover-post-body-visual-\(post.id)")
            }

            if !post.tags.isEmpty {
                HStack(spacing: SideSeatTheme.spaceSM) {
                    ForEach(post.tags.prefix(2), id: \.self) { tag in
                        Text("#\(tag)")
                    }
                    if post.tags.count > 2 {
                        Text("+\(post.tags.count - 2)")
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

    @ViewBuilder
    private var postScheduleMetadata: some View {
        if let start = post.startDate {
            Label(start.formatted(date: .abbreviated, time: .shortened), systemImage: "calendar")
                .lineLimit(1)
                .accessibilityIdentifier("discover-post-date-visual-\(post.id)")
        }
        if let location = post.location, !location.isEmpty {
            Label(location, systemImage: "mappin.and.ellipse")
                .lineLimit(1)
                .accessibilityIdentifier("discover-post-location-visual-\(post.id)")
        }
    }

    private var visibilityBadge: some View {
        DiscoverMetadataBadge(
            BuddyPostDisplay.visibilityLabel(post.visibility),
            systemImage: BuddyPostDisplay.visibilitySystemImage(post.visibility)
        )
        .accessibilityIdentifier("discover-visibility-\(post.id)")
    }

    @ViewBuilder
    private var interestLabel: some View {
        if post.interestedCount > 0 {
            Label(
                "\(post.interestedCount)",
                systemImage: post.savedByViewer ? "heart.fill" : "heart"
            )
                .font(.caption)
                .foregroundStyle(
                    post.savedByViewer ? SideSeatTheme.accent : SideSeatTheme.textSecondaryStrong
                )
                .accessibilityIdentifier("discover-interest-\(post.id)")
        }
    }
}

private struct DiscoverPostMediaGrid: View {
    let imageURLs: [String]
    let accessibilityID: String

    private let gap: CGFloat = 3

    private var visibleURLs: [String] {
        Array(imageURLs.prefix(3))
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
                image(visibleURLs[0])
                    .frame(width: proxy.size.width, height: proxy.size.height)
            case 2:
                HStack(spacing: gap) {
                    ForEach(visibleURLs.indices, id: \.self) { index in
                        image(visibleURLs[index])
                    }
                }
            default:
                HStack(spacing: gap) {
                    image(visibleURLs[0])
                        .frame(width: availableWidth * 0.64)
                    VStack(spacing: gap) {
                        image(visibleURLs[1])
                        image(visibleURLs[2])
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
                ? String(localized: "1 photo")
                : String(localized: "\(imageURLs.count) photos")
        )
        .accessibilityIdentifier(accessibilityID)
    }

    private func image(_ value: String) -> some View {
        AsyncImage(url: URL(string: value)) { phase in
            switch phase {
            case .success(let image):
                image
                    .resizable()
                    .scaledToFill()
            case .failure:
                placeholder(systemImage: "photo.badge.exclamationmark")
            default:
                ZStack {
                    SideSeatTheme.fillSubtle
                    ProgressView()
                        .controlSize(.small)
                        .tint(SideSeatTheme.textSecondary)
                }
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

private struct DiscoverActivityRow: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let activity: NativeDiscoverActivity

    private var status: DiscoverStatusPresentation {
        DiscoverActivityDisplay.status(activity)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                InitialAvatar(name: activity.organizer.displayName, url: activity.organizer.avatarUrl, size: 38)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(activity.organizer.displayName)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.primary)
                            .accessibilityIdentifier("discover-activity-author-name-visual-\(activity.id)")
                        if activity.isOrganizer {
                            Text("You")
                                .font(.caption2.weight(.medium))
                                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        }
                    }
                    Text(activity.school)
                        .font(.caption)
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .lineLimit(1)
                        .accessibilityIdentifier("discover-activity-school-visual-\(activity.id)")
                }
                Spacer(minLength: 0)
                DiscoverStatusBadge(status: status)
                    .accessibilityIdentifier("discover-status-activity-\(activity.id)")
            }

            VStack(alignment: .leading, spacing: 5) {
                Text(activity.title)
                    .font(.body.weight(.semibold))
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

            ViewThatFits(in: .horizontal) {
                HStack(spacing: 12) {
                    activityScheduleMetadata
                }
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                    activityScheduleMetadata
                }
            }
            .font(.caption)
            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
            .padding(10)
            .background(
                SideSeatTheme.fillSubtle,
                in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
            )

            HStack(spacing: SideSeatTheme.spaceSM) {
                Spacer(minLength: 0)
                if let capacity = activity.capacity {
                    Label("\(activity.goingCount)/\(capacity) going", systemImage: "person.2")
                        .accessibilityIdentifier("discover-activity-attendance-\(activity.id)")
                } else {
                    Label("\(activity.goingCount) going", systemImage: "person.2")
                        .accessibilityIdentifier("discover-activity-attendance-\(activity.id)")
                }
            }
            .font(.caption)
            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
        }
        .discoverFeedCard()
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private var activityScheduleMetadata: some View {
        if let start = activity.startDate {
            Label(start.formatted(date: .abbreviated, time: .shortened), systemImage: "calendar")
                .lineLimit(1)
                .accessibilityIdentifier("discover-activity-date-visual-\(activity.id)")
        }
        Label(activity.location, systemImage: "mappin.and.ellipse")
            .lineLimit(1)
            .accessibilityIdentifier("discover-activity-location-visual-\(activity.id)")
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

private struct DiscoverMetadataBadge: View {
    let label: String
    let systemImage: String

    init(_ label: String, systemImage: String) {
        self.label = label
        self.systemImage = systemImage
    }

    var body: some View {
        Label(label, systemImage: systemImage)
            .labelStyle(.titleAndIcon)
            .font(.caption2.weight(.medium))
            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(SideSeatTheme.fillTertiary, in: Capsule())
            .fixedSize(horizontal: false, vertical: true)
    }
}

struct InitialAvatar: View {
    let name: String
    var url: String? = nil
    var size: CGFloat = 36

    private var tileColor: Color {
        SideSeatTheme.AvatarPalette.color(for: name)
    }

    var body: some View {
        ZStack {
            Circle()
                .fill(tileColor)
            if let url, let imageURL = URL(string: url), !url.isEmpty {
                AsyncImage(url: imageURL) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFill()
                    default:
                        initialsText
                    }
                }
                .frame(width: size, height: size)
                .clipShape(Circle())
            } else {
                initialsText
            }
        }
        .frame(width: size, height: size)
        .overlay {
            Circle().strokeBorder(Color.primary.opacity(0.08), lineWidth: 1)
        }
        .accessibilityHidden(true)
    }

    private var initialsText: some View {
        Text(String(name.first ?? "?"))
            .font(size >= 40 ? .title3.weight(.semibold) : .subheadline.weight(.semibold))
            .foregroundStyle(.white)
            .lineLimit(1)
            .minimumScaleFactor(0.5)
            .accessibilityHidden(true)
            .accessibilityIdentifier("avatar-initial-visual")
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

    @ViewBuilder
    private func tile(_ member: Member, cell: CGFloat) -> some View {
        ZStack {
            Rectangle().fill(Self.tileColor(for: member.name))
            if let url = member.url, let imageURL = URL(string: url), !url.isEmpty {
                AsyncImage(url: imageURL) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFill()
                    default:
                        tileInitials(member.name, cell: cell)
                    }
                }
                .frame(width: cell, height: cell)
                .clipped()
            } else {
                tileInitials(member.name, cell: cell)
            }
        }
        .frame(width: cell, height: cell)
        .clipped()
    }

    private func tileInitials(_ name: String, cell: CGFloat) -> some View {
        Text(String(name.first ?? "?"))
            .font(.system(size: max(8, cell * 0.42), weight: .semibold))
            .foregroundStyle(.white)
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
