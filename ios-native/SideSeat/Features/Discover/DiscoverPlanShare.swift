import SwiftUI
import UIKit

enum DiscoverPlanShareContent {
    static func url(for post: NativeDiscoverBuddyPost) -> URL {
        URL(string: "https://www.sideseat.de")!
            .appendingPathComponent("discover")
            .appendingPathComponent("posts")
            .appendingPathComponent(post.id)
    }

    static func text(for post: NativeDiscoverBuddyPost) -> String {
        var lines = [post.title]
        if let start = post.startDate {
            lines.append(start.formatted(date: .abbreviated, time: .shortened))
        }
        if let location = post.location, !location.isEmpty {
            lines.append("\(location), \(post.city)")
        } else {
            lines.append(post.city)
        }
        if let body = post.body, !body.isEmpty {
            lines.append(body)
        }
        lines.append(String(localized: "Find international student buddies on SideSeat."))
        lines.append("#SideSeat #留学生找搭子 #留学生活")
        lines.append(url(for: post).absoluteString)
        return lines.joined(separator: "\n")
    }
}

struct DiscoverPlanSharePreview: View {
    @Environment(\.dismiss) private var dismiss
    let post: NativeDiscoverBuddyPost

    var body: some View {
        NavigationStack {
            GeometryReader { proxy in
                ScrollView {
                    VStack(spacing: SideSeatTheme.spaceLG) {
                        DiscoverPlanShareCard(post: post)
                            .frame(width: 360, height: 480)
                            .scaleEffect(0.78)
                            .frame(width: 281, height: 374)
                            .shadow(color: Color.black.opacity(0.12), radius: 18, y: 8)
                            .accessibilityIdentifier("discover-plan-share-card")

                        Text("Xiaohongshu share card")
                            .font(.headline)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: proxy.size.height)
                    .padding(.horizontal, SideSeatTheme.screenHorizontal)
                    .padding(.vertical, SideSeatTheme.spaceXL)
                }
            }
            .background(SideSeatTheme.bgGrouped)
            .navigationTitle("Share plan")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                        .accessibilityIdentifier("discover-plan-share-done")
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                SSShareActionBar(
                    caption: DiscoverPlanShareContent.text(for: post),
                    accessibilityPrefix: "discover-plan-share",
                    makeImage: { DiscoverPlanShareRenderer.image(for: post) }
                )
            }
        }
        .presentationDetents([.large])
        .accessibilityIdentifier("discover-plan-share-preview")
    }
}

@MainActor
enum DiscoverPlanShareRenderer {
    static func image(for post: NativeDiscoverBuddyPost) -> UIImage? {
        let card = DiscoverPlanShareCard(post: post)
            .frame(width: 360, height: 480)
            .environment(\.colorScheme, .light)
        let renderer = ImageRenderer(content: card)
        renderer.scale = 3
        renderer.isOpaque = true
        return renderer.uiImage
    }
}

private struct DiscoverPlanShareCard: View {
    let post: NativeDiscoverBuddyPost

    var body: some View {
        ZStack {
            Color.white

            VStack(alignment: .leading, spacing: 0) {
                header
                titleBlock
                details
                Spacer(minLength: 12)
                host
                footer
            }
            .padding(24)
        }
        .frame(width: 360, height: 480)
        .clipped()
    }

    private var header: some View {
        let status = BuddyPostDisplay.status(post)

        return HStack(spacing: 8) {
            SSShareMark()
            Spacer(minLength: 0)
            Label(status.label, systemImage: status.systemImage)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(status.isOpen ? Color(red: 0.12, green: 0.48, blue: 0.28) : Color.secondary)
                .padding(.horizontal, 9)
                .padding(.vertical, 5)
                .background(
                    status.isOpen ? Color(red: 0.90, green: 0.97, blue: 0.92) : Color(uiColor: .tertiarySystemFill),
                    in: Capsule()
                )
        }
    }

    private var titleBlock: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(post.title)
                .font(.system(size: 27, weight: .bold, design: .rounded))
                .foregroundStyle(Color(red: 0.11, green: 0.10, blue: 0.14))
                .lineLimit(3)
                .minimumScaleFactor(0.78)
                .fixedSize(horizontal: false, vertical: true)

            if let body = post.body, !body.isEmpty {
                Text(body)
                    .font(.system(size: 14, weight: .regular))
                    .foregroundStyle(Color(red: 0.32, green: 0.31, blue: 0.36))
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.top, 22)
    }

    private var details: some View {
        VStack(alignment: .leading, spacing: 10) {
            shareDetail(systemImage: "calendar", text: timeLabel)
            shareDetail(systemImage: "mappin.and.ellipse", text: placeLabel)
            shareDetail(systemImage: "person.2", text: groupLabel)
        }
        .padding(.top, 18)
    }

    private var host: some View {
        HStack(spacing: 10) {
            Text(initials)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 34, height: 34)
                .background(SideSeatTheme.AvatarPalette.color(for: post.author.displayName), in: Circle())

            VStack(alignment: .leading, spacing: 2) {
                Text(post.author.displayName)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Color(red: 0.11, green: 0.10, blue: 0.14))
                    .lineLimit(1)
                Text(hostLabel)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(Color(red: 0.36, green: 0.38, blue: 0.44))
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            if post.author.verifiedStudent {
                Label("Verified", systemImage: "checkmark.seal.fill")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(Color(red: 0.18, green: 0.48, blue: 0.88))
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Color(red: 0.96, green: 0.96, blue: 0.98), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private var footer: some View {
        HStack(alignment: .bottom, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("留学生，一起出发")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Color(red: 0.11, green: 0.10, blue: 0.14))
                Text("sideseat.de")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(Color(red: 0.40, green: 0.39, blue: 0.44))
            }
            Spacer(minLength: 0)
            SSQRCode(url: DiscoverPlanShareContent.url(for: post))
                .frame(width: 52, height: 52)
        }
        .padding(.top, 14)
    }

    private func shareDetail(systemImage: String, text: String) -> some View {
        HStack(spacing: 9) {
            Image(systemName: systemImage)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(SideSeatTheme.rose)
                .frame(width: 25, height: 25)
                .background(SideSeatTheme.rose.opacity(0.10), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
            Text(text)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Color(red: 0.18, green: 0.17, blue: 0.22))
                .lineLimit(2)
            Spacer(minLength: 0)
        }
    }

    private var timeLabel: String {
        guard let start = post.startDate else { return String(localized: "Time to be decided") }
        let startLabel = start.formatted(date: .abbreviated, time: .shortened)
        guard let end = post.endDate else { return startLabel }
        return "\(startLabel) - \(end.formatted(date: .omitted, time: .shortened))"
    }

    private var placeLabel: String {
        guard let location = post.location, !location.isEmpty else {
            return "\(String(localized: "Place to be decided")), \(post.city)"
        }
        return "\(location), \(post.city)"
    }

    private var groupLabel: String {
        guard let capacity = post.capacity else {
            return String(localized: "\(post.interestedCount) interested")
        }
        return String(localized: "\(post.interestedCount) interested, up to \(capacity) people")
    }

    private var hostLabel: String {
        [post.author.school, post.author.major]
            .compactMap { value in
                guard let value, !value.isEmpty else { return nil }
                return value
            }
            .joined(separator: " · ")
    }

    private var initials: String {
        let words = post.author.displayName.split(separator: " ")
        let characters = words.prefix(2).compactMap(\.first)
        return characters.isEmpty ? "S" : String(characters)
    }
}
