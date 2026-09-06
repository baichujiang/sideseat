import Foundation
import Photos
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
        lines.append(AppLocalization.string( "Find international student buddies on SideSeat."))
        lines.append("#SideSeat #留学生找搭子 #留学生活")
        lines.append(url(for: post).absoluteString)
        return lines.joined(separator: "\n")
    }
}

struct DiscoverPlanSharePreview: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let post: NativeDiscoverBuddyPost

    @State private var payload: SSSharePayload?
    @State private var cachedPoster: UIImage?
    @State private var posterAction: PosterAction?
    @State private var feedback: String?
    @State private var issue: String?

    private enum PosterAction: Equatable {
        case share
        case save
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: SideSeatTheme.spaceMD) {
                Text("Share buddy post")
                    .font(.headline)
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .accessibilityIdentifier("discover-plan-share-preview")

                Spacer(minLength: 0)

                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.subheadline.weight(.semibold))
                        .frame(width: 36, height: 36)
                        .background(SideSeatTheme.fillTertiary, in: Circle())
                }
                .buttonStyle(SSPressButtonStyle())
                .foregroundStyle(SideSeatTheme.textPrimary)
                .accessibilityLabel("Done")
                .accessibilityIdentifier("discover-plan-share-done")
            }
            .padding(.horizontal, SideSeatTheme.screenHorizontal)
            .padding(.top, SideSeatTheme.spaceMD)
            .padding(.bottom, SideSeatTheme.spaceSM)

            ScrollView {
                VStack(spacing: SideSeatTheme.spaceLG) {
                    postSummary
                    actionGrid
                    statusMessage
                }
                .padding(.horizontal, SideSeatTheme.screenHorizontal)
                .padding(.bottom, SideSeatTheme.spaceLG)
            }
            .scrollIndicators(.hidden)
        }
        .background(SideSeatTheme.bgGrouped)
        .sheet(item: $payload) { payload in
            SSActivityView(items: payload.items)
        }
        .presentationDetents(presentationDetents)
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(SideSeatTheme.cardRadius)
        .presentationBackground(SideSeatTheme.bgGrouped)
        .sensoryFeedback(.success, trigger: feedback)
    }

    private var presentationDetents: Set<PresentationDetent> {
        dynamicTypeSize.isAccessibilitySize ? [.large] : [.height(305), .large]
    }

    private var postSummary: some View {
        HStack(spacing: SideSeatTheme.spaceMD) {
            Group {
                if let source = post.imageUrls.first {
                    DiscoverMediaImage(source: source)
                } else {
                    Image(systemName: "person.2.fill")
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(SideSeatTheme.fillTertiary)
                }
            }
            .frame(width: 58, height: 58)
            .clipped()
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

            VStack(alignment: .leading, spacing: 4) {
                Text(post.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .lineLimit(2)

                Text(postSummaryMetadata)
                    .font(.caption)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .lineLimit(1)
            }

            Spacer(minLength: 0)
        }
        .padding(SideSeatTheme.spaceMD)
        .background(
            SideSeatTheme.bg,
            in: RoundedRectangle(cornerRadius: 8, style: .continuous)
        )
    }

    private var actionGrid: some View {
        LazyVGrid(columns: actionColumns, spacing: SideSeatTheme.spaceSM) {
            shareAction(
                title: "Share post",
                systemImage: "square.and.arrow.up",
                accessibilityID: "discover-plan-share-post"
            ) {
                payload = SSSharePayload(items: [DiscoverPlanShareContent.text(for: post)])
            }

            shareAction(
                title: "Share image",
                systemImage: "photo.on.rectangle.angled",
                isWorking: posterAction == .share,
                isDisabled: posterAction != nil,
                accessibilityID: "discover-plan-share-image"
            ) {
                preparePoster(for: .share)
            }

            shareAction(
                title: "Copy link",
                systemImage: "link",
                accessibilityID: "discover-plan-share-copy"
            ) {
                UIPasteboard.general.string = DiscoverPlanShareContent.url(for: post).absoluteString
                showFeedback(AppLocalization.string("Link copied"))
            }

            shareAction(
                title: "Save image",
                systemImage: "photo.badge.arrow.down",
                isWorking: posterAction == .save,
                isDisabled: posterAction != nil,
                accessibilityID: "discover-plan-share-save"
            ) {
                preparePoster(for: .save)
            }
        }
    }

    private var actionColumns: [GridItem] {
        let count = dynamicTypeSize.isAccessibilitySize ? 2 : 4
        return Array(
            repeating: GridItem(.flexible(), spacing: SideSeatTheme.spaceSM),
            count: count
        )
    }

    @ViewBuilder
    private var statusMessage: some View {
        if let issue {
            Label(issue, systemImage: "exclamationmark.circle.fill")
                .font(.footnote)
                .foregroundStyle(SideSeatTheme.danger)
                .frame(maxWidth: .infinity, alignment: .leading)
        } else if let feedback {
            Label(feedback, systemImage: "checkmark.circle.fill")
                .font(.footnote.weight(.medium))
                .foregroundStyle(SideSeatTheme.success)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func shareAction(
        title: String.LocalizationValue,
        systemImage: String,
        isWorking: Bool = false,
        isDisabled: Bool = false,
        accessibilityID: String,
        action: @escaping () -> Void
    ) -> some View {
        let localizedTitle = AppLocalization.string(title)

        return Button(action: action) {
            VStack(spacing: 8) {
                Group {
                    if isWorking {
                        ProgressView()
                    } else {
                        Image(systemName: systemImage)
                            .font(.body.weight(.semibold))
                    }
                }
                .frame(width: 46, height: 46)
                .background(SideSeatTheme.bg, in: Circle())

                Text(localizedTitle)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, minHeight: 32, alignment: .top)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, SideSeatTheme.spaceSM)
            .contentShape(Rectangle())
        }
        .buttonStyle(SSPressButtonStyle())
        .foregroundStyle(SideSeatTheme.textPrimary)
        .disabled(isDisabled)
        .accessibilityLabel(localizedTitle)
        .accessibilityIdentifier(accessibilityID)
    }

    private var postSummaryMetadata: String {
        [post.author.displayName, post.author.school ?? post.city]
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }

    @MainActor
    private func preparePoster(for action: PosterAction) {
        guard posterAction == nil else { return }
        posterAction = action
        issue = nil

        Task { @MainActor in
            defer { posterAction = nil }
            await Task.yield()

            let image: UIImage?
            if let cachedPoster {
                image = cachedPoster
            } else {
                image = await DiscoverPlanShareRenderer.image(for: post)
            }
            guard let image else {
                issue = AppLocalization.string("The post image could not be created.")
                return
            }
            cachedPoster = image

            switch action {
            case .share:
                payload = SSSharePayload(items: [image])
            case .save:
                await savePosterToPhotos(image)
            }
        }
    }

    @MainActor
    private func savePosterToPhotos(_ image: UIImage) async {
        guard let imageData = image.pngData() else {
            issue = AppLocalization.string("The post image could not be created.")
            return
        }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated"),
           !ProcessInfo.processInfo.arguments.contains("--ui-testing-real-photo-save") {
            showFeedback(AppLocalization.string("Saved to Photos"))
            return
        }
        #endif

        let photoLibrary = SystemScheduleSharePhotoLibraryClient(
            originalFilename: "SideSeat Buddy Post.png"
        )
        let initialAuthorization = photoLibrary.authorizationStatus()
        let authorization = initialAuthorization == .notDetermined
            ? await photoLibrary.requestAuthorization()
            : initialAuthorization

        guard authorization == .authorized || authorization == .limited else {
            issue = AppLocalization.string("Photo access is required to save this image.")
            return
        }

        do {
            try await photoLibrary.save(imageData)
            showFeedback(AppLocalization.string("Saved to Photos"))
        } catch {
            issue = AppLocalization.string("The post image could not be saved.")
        }
    }

    @MainActor
    private func showFeedback(_ message: String) {
        issue = nil
        withAnimation(.easeOut(duration: 0.18)) {
            feedback = message
        }

        Task { @MainActor in
            try? await Task.sleep(for: .seconds(2))
            guard feedback == message else { return }
            withAnimation(.easeIn(duration: 0.18)) {
                feedback = nil
            }
        }
    }
}

@MainActor
enum DiscoverPlanShareRenderer {
    static func image(for post: NativeDiscoverBuddyPost) async -> UIImage? {
        let coverImage = await DiscoverPlanShareCoverLoader.image(for: post.imageUrls.first)
        return image(for: post, coverImage: coverImage)
    }

    static func image(
        for post: NativeDiscoverBuddyPost,
        coverImage: UIImage?
    ) -> UIImage? {
        let card = DiscoverPlanShareCard(post: post, coverImage: coverImage)
            .frame(width: 360, height: 480)
            .environment(\.colorScheme, .light)
        let renderer = ImageRenderer(content: card)
        renderer.scale = 3
        renderer.isOpaque = true
        return renderer.uiImage
    }
}

@MainActor
enum DiscoverPlanShareCoverLoader {
    static func image(for source: String?) async -> UIImage? {
        guard let source, !source.isEmpty else { return nil }

        #if DEBUG
        if let previewAssetName = previewAssetName(for: source),
           let image = UIImage(named: previewAssetName) {
            return image
        }
        #endif

        guard
            let url = URL(string: source),
            let scheme = url.scheme?.lowercased(),
            scheme == "https" || scheme == "http"
        else { return nil }

        let request = URLRequest(
            url: url,
            cachePolicy: .returnCacheDataElseLoad,
            timeoutInterval: 20
        )

        if let cached = URLCache.shared.cachedResponse(for: request) {
            return await decodedImage(from: cached.data)
        }

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard
                !data.isEmpty,
                (response as? HTTPURLResponse).map({ 200..<300 ~= $0.statusCode }) != false
            else { return nil }

            URLCache.shared.storeCachedResponse(
                CachedURLResponse(response: response, data: data),
                for: request
            )
            return await decodedImage(from: data)
        } catch {
            return nil
        }
    }

    private static func decodedImage(from data: Data) async -> UIImage? {
        guard let draft = await DiscoverImagePreprocessor.makeDraftAsync(from: data) else {
            return nil
        }
        return UIImage(data: draft.data)
    }

    #if DEBUG
    private static func previewAssetName(for source: String) -> String? {
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
}

enum DiscoverPlanSharePresentation {
    static func availableSpots(
        for post: NativeDiscoverBuddyPost,
        now: Date = Date()
    ) -> Int? {
        guard
            BuddyPostDisplay.status(post, now: now).isOpen,
            let capacity = post.capacity,
            capacity > 0
        else { return nil }

        return max(0, capacity - max(0, post.interestedCount))
    }

    static func availabilityLabel(
        for post: NativeDiscoverBuddyPost,
        now: Date = Date()
    ) -> String {
        let status = BuddyPostDisplay.status(post, now: now)
        guard status.isOpen else { return status.label }
        guard let spots = availableSpots(for: post, now: now) else {
            return status.label
        }
        if spots == 0 { return AppLocalization.string("Full") }
        if spots == 1 { return AppLocalization.string("Last spot") }
        return AppLocalization.string("\(spots) spots left")
    }
}

private struct DiscoverPlanShareCard: View {
    let post: NativeDiscoverBuddyPost
    let coverImage: UIImage?

    private let ink = Color(red: 0.09, green: 0.08, blue: 0.11)
    private let muted = Color(red: 0.39, green: 0.37, blue: 0.43)
    private let accent = Color(red: 1.00, green: 0.31, blue: 0.53)

    var body: some View {
        VStack(spacing: 0) {
            hero
                .frame(height: 310)
            details
                .frame(height: 170)
        }
        .background(Color.white)
        .frame(width: 360, height: 480)
        .clipped()
    }

    private var hero: some View {
        ZStack {
            heroBackground

            LinearGradient(
                stops: [
                    .init(color: Color.black.opacity(0.30), location: 0),
                    .init(color: Color.clear, location: 0.38),
                    .init(color: Color.black.opacity(0.82), location: 1),
                ],
                startPoint: .top,
                endPoint: .bottom
            )

            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 7) {
                    SideSeatBrandMark(size: 24, showsShadow: false)
                    Text("SideSeat")
                        .font(.system(size: 15, weight: .bold, design: .rounded))
                        .foregroundStyle(Color.white)

                    Spacer(minLength: 10)

                    Text(DiscoverPlanSharePresentation.availabilityLabel(for: post))
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(Color.white)
                        .padding(.horizontal, 10)
                        .frame(height: 26)
                        .background(accent, in: Capsule())
                }

                Spacer(minLength: 16)

                Text(post.title)
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                    .foregroundStyle(Color.white)
                    .lineLimit(2)
                    .minimumScaleFactor(0.72)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 18)
            .padding(.top, 15)
            .padding(.bottom, 17)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .clipped()
    }

    @ViewBuilder
    private var heroBackground: some View {
        if let coverImage {
            Image(uiImage: coverImage)
                .resizable()
                .scaledToFill()
                .frame(width: 360, height: 310)
                .clipped()
        } else {
            ZStack {
                LinearGradient(
                    colors: [
                        Color(red: 1.00, green: 0.66, blue: 0.52),
                        Color(red: 1.00, green: 0.30, blue: 0.55),
                        Color(red: 0.55, green: 0.27, blue: 0.67),
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                Image(systemName: "person.2.wave.2.fill")
                    .font(.system(size: 90, weight: .medium))
                    .foregroundStyle(Color.white.opacity(0.24))
                    .offset(x: 82, y: -18)
            }
            .frame(width: 360, height: 310)
        }
    }

    private var details: some View {
        VStack(spacing: 0) {
            Text("\(timeLabel)  ·  \(placeLabel)")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(ink)
                .lineLimit(1)
                .minimumScaleFactor(0.68)
                .frame(maxWidth: .infinity, alignment: .leading)
                .frame(height: 42)

            divider

            host
                .frame(height: 54)

            divider

            shareCallToAction
                .frame(maxHeight: .infinity)
        }
        .padding(.horizontal, 16)
        .background(Color.white)
    }

    private var host: some View {
        HStack(spacing: 8) {
            Text(initials)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 32, height: 32)
                .background(SideSeatTheme.AvatarPalette.color(for: post.author.displayName), in: Circle())

            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 6) {
                    Text(post.author.displayName)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(ink)
                        .lineLimit(1)

                    if post.author.verifiedStudent {
                        VerifiedSchoolMark(school: post.author.school)
                    }
                }
                Text(post.author.studentRoleLabel ?? AppLocalization.string("Organizer"))
                    .font(.system(size: 9, weight: .medium))
                    .foregroundStyle(muted)
                    .lineLimit(1)
            }

            Spacer(minLength: 0)
        }
    }

    private var shareCallToAction: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 2) {
                Text(AppLocalization.string("Scan for live details"))
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(ink)
                Text("sideseat.de")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(muted)
            }

            Spacer(minLength: 0)

            SSQRCode(url: DiscoverPlanShareContent.url(for: post))
                .frame(width: 46, height: 46)
                .padding(4)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 5, style: .continuous)
                        .strokeBorder(Color.black.opacity(0.12), lineWidth: 0.75)
                }
        }
    }

    private var divider: some View {
        Rectangle()
            .fill(Color.black.opacity(0.09))
            .frame(height: 0.5)
    }

    private var timeLabel: String {
        guard let start = post.startDate else { return AppLocalization.string( "Time to be decided") }
        let startLabel = start.formatted(date: .abbreviated, time: .shortened)
        guard let end = post.endDate else { return startLabel }
        return "\(startLabel) - \(end.formatted(date: .omitted, time: .shortened))"
    }

    private var placeLabel: String {
        guard let location = post.location, !location.isEmpty else {
            return "\(AppLocalization.string( "Place to be decided")), \(post.city)"
        }
        return "\(location), \(post.city)"
    }

    private var initials: String {
        let words = post.author.displayName.split(separator: " ")
        let characters = words.prefix(2).compactMap(\.first)
        return characters.isEmpty ? "S" : String(characters)
    }
}
