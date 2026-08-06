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
        List {
            if let issue = store.issue, store.payload == nil {
                ContentUnavailableView {
                    Label("Could not load Discover", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(issue)
                } actions: {
                    Button("Try again") { Task { await load() } }
                }
                .ssListPageStateRow()
            } else if store.isLoading, store.payload == nil {
                SSLoadingState("Loading Discover")
                    .frame(maxWidth: .infinity)
                    .ssListPageStateRow()
            } else {
                feedContent
            }
        }
        .listStyle(.plain)
        .ssRootNavigationTitle(
            "Discover",
            subtitle: DiscoverCityPreferenceStore.shared.selectedCity
        )
        .searchable(text: $query, prompt: "People, plans, or places")
        .refreshable { await load() }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    createDestination = .plan
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("Create plan")
                .accessibilityIdentifier("discover-create-plan")
            }
        }
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
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("discover-plan-\(post.id)")
                case .activity(let activity):
                    NavigationLink(value: AppRoute.activity(activityID: activity.id)) {
                        DiscoverActivityRow(activity: activity)
                    }
                    .buttonStyle(.plain)
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
        .ssListPageStateRow()
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
    let post: NativeDiscoverBuddyPost

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                InitialAvatar(name: post.author.displayName, url: post.author.avatarUrl)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(post.author.displayName)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.primary)
                        SchoolIdentityBadge(
                            school: post.author.school,
                            verifiedStudent: post.author.verifiedStudent,
                            status: post.author.verifiedStudent ? "VERIFIED" : "UNVERIFIED",
                            compact: true
                        )
                    }
                    if let studentRoleLabel = post.author.studentRoleLabel {
                        Text(studentRoleLabel)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(SideSeatTheme.accent)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(SideSeatTheme.accent.opacity(0.10), in: Capsule())
                            .lineLimit(1)
                    }
                    if let tagline = post.author.tagline, !tagline.isEmpty {
                        Text(tagline).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    } else if let major = post.author.major, !major.isEmpty {
                        Text(major).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
                Spacer()
                if post.isOwn { Text("You").font(.caption).foregroundStyle(.secondary) }
            }
            Text(post.title)
                .font(.body.weight(.semibold))
                .foregroundStyle(.primary)
            if let body = post.body, !body.isEmpty {
                Text(body).font(.subheadline).foregroundStyle(.secondary).lineLimit(3)
            }
            if !post.tags.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(post.tags.prefix(6), id: \.self) { tag in
                            Text("#\(tag)")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(SideSeatTheme.textSecondary)
                                .padding(.horizontal, 7)
                                .padding(.vertical, 3)
                                .background(SideSeatTheme.fillTertiary, in: Capsule())
                        }
                    }
                }
            }
            if post.startDate != nil || post.location != nil {
                HStack(spacing: 12) {
                    if let start = post.startDate {
                        Label(start.formatted(date: .abbreviated, time: .shortened), systemImage: "calendar")
                    }
                    if let location = post.location, !location.isEmpty {
                        Label(location, systemImage: "mappin.and.ellipse")
                            .lineLimit(1)
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            HStack(spacing: 12) {
                Label(BuddyPostDisplay.statusLabel(post.status), systemImage: post.status == "ACTIVE" ? "circle.fill" : "checkmark.circle")
                if let expiry = post.expiryDate {
                    Label {
                        Text(expiry, format: .dateTime.month().day())
                    } icon: {
                        Image(systemName: "clock")
                    }
                }
                if post.interestedCount > 0 {
                    Label("\(post.interestedCount)", systemImage: "heart")
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            Label(BuddyPostDisplay.visibilityLabel(post.visibility), systemImage: "eye")
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 6)
    }
}

private struct DiscoverActivityRow: View {
    let activity: NativeDiscoverActivity

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(activity.title)
                .font(.body.weight(.semibold))
                .foregroundStyle(.primary)
            if let start = activity.startDate {
                Label(start.formatted(date: .abbreviated, time: .shortened), systemImage: "calendar")
            }
            Label(activity.location, systemImage: "mappin.and.ellipse")
            HStack {
                Text(activity.organizer.displayName)
                Spacer()
                if let capacity = activity.capacity {
                    Text("\(activity.goingCount)/\(capacity) going")
                } else {
                    Text("\(activity.goingCount) going")
                }
            }
            .foregroundStyle(.secondary)
        }
        .font(.subheadline)
        .padding(.vertical, 6)
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
