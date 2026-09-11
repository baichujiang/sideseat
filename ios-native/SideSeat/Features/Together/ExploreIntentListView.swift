import SwiftUI

struct ExploreIntentListView: View {
    @Environment(SessionStore.self) private var session
    @State private var store = ExploreIntentStore()
    @State private var searchText = ""
    @State private var selectedTopic: NativeWeeklyIntentTopic? = nil
    private let access = ExploreAccessTier.current

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                Text(AppLocalization.string("Explore what people around campus want to do"))
                    .font(.subheadline)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .fixedSize(horizontal: false, vertical: true)

                if access.showsAdvancedContext {
                    Label(AppLocalization.string("SideSeat Plus exploration"), systemImage: "sparkles")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .accessibilityIdentifier("explore-plus-status")
                    TextField(AppLocalization.string("Search activities"), text: $searchText)
                        .textFieldStyle(.roundedBorder)
                        .accessibilityIdentifier("explore-search")
                    ScrollView(.horizontal) {
                        HStack(spacing: SideSeatTheme.spaceSM) {
                            Button(AppLocalization.string("All activities")) { selectedTopic = nil }
                                .buttonStyle(.bordered)
                            ForEach(NativeWeeklyIntentTopic.allCases) { topic in
                                Button(topic.title) { selectedTopic = topic }
                                    .buttonStyle(.bordered)
                            }
                        }
                    }
                    .scrollIndicators(.hidden)
                    .accessibilityIdentifier("explore-topic-filters")
                }

                if store.isLoading, store.intents.isEmpty {
                    ProgressView().frame(maxWidth: .infinity, minHeight: 120)
                } else if store.intents.isEmpty {
                    ContentUnavailableView {
                        Label(AppLocalization.string("Nothing new to explore right now"), systemImage: "sparkles")
                    } description: {
                        Text(AppLocalization.string("New activity intentions will appear here when students choose to share them."))
                    }
                    .accessibilityIdentifier("explore-intents-empty")
                } else {
                    ForEach(visibleIntents) { intent in
                        ExploreIntentCard(intent: intent, compact: false, showsPlusContext: access.showsAdvancedContext)
                    }
                    if visibleIntents.isEmpty {
                        Text(AppLocalization.string("No Explore results match these filters"))
                            .font(.subheadline)
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                            .padding(.vertical, SideSeatTheme.spaceMD)
                            .accessibilityIdentifier("explore-filter-empty")
                    }
                }

                if access == .free, store.hasMore {
                    VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                        Label(AppLocalization.string("Explore more with SideSeat Plus"), systemImage: "sparkles")
                            .font(.headline)
                        Text(AppLocalization.string("Plus can unlock more Explore results, richer activity context, search and filters. Identity stays hidden until mutual interest."))
                            .font(.footnote)
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.vertical, SideSeatTheme.spaceMD)
                    .accessibilityIdentifier("explore-plus-preview")
                }

                if let issue = store.issue {
                    Text(issue).font(.footnote).foregroundStyle(SideSeatTheme.danger)
                }
            }
            .padding(.horizontal, SideSeatTheme.screenHorizontal)
            .padding(.vertical, SideSeatTheme.spaceMD)
        }
        .background(SideSeatTheme.bgGrouped)
        .navigationTitle(AppLocalization.string("Explore intentions"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await store.load(using: session, limit: access.resultLimit) }
        .refreshable { await store.load(using: session, limit: access.resultLimit) }
        .accessibilityIdentifier("explore-intents-list")
    }
    private var visibleIntents: [NativeExploreIntent] {
        guard access == .plus else { return store.intents }
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
            .folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
        return store.intents.filter { intent in
            if let selectedTopic, intent.topic != selectedTopic { return false }
            guard !query.isEmpty else { return true }
            let haystack = [intent.activityTitle, intent.descriptionPreview ?? "", intent.course?.title ?? ""]
                .joined(separator: " ")
                .folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
            return haystack.contains(query)
        }
    }

}

struct ExploreIntentCard: View {
    let intent: NativeExploreIntent
    let compact: Bool
    let showsPlusContext: Bool

    var body: some View {
        SSFlowCard(
            contentPadding: compact ? SideSeatTheme.spaceMD : SideSeatTheme.spaceLG,
            contentSpacing: compact ? SideSeatTheme.spaceSM : SideSeatTheme.spaceMD
        ) {
            HStack(alignment: .top, spacing: compact ? SideSeatTheme.spaceSM : SideSeatTheme.spaceMD) {
                Image(systemName: intent.topic.systemImage)
                    .font((compact ? Font.subheadline : Font.title3).weight(.semibold))
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .frame(width: compact ? 36 : 42, height: compact ? 36 : 42)
                    .background(SideSeatTheme.fillTertiary, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(intent.topic.title)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    Text(intent.activityTitle)
                        .font(.headline)
                        .lineLimit(compact ? 1 : nil)
                        .fixedSize(horizontal: false, vertical: !compact)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            Label(intent.time.summary, systemImage: "calendar")
                .font(.subheadline)
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .lineLimit(compact ? 1 : nil)
                .fixedSize(horizontal: false, vertical: !compact)

            if compact {
                Label(compactContext, systemImage: "building.columns")
                    .font(.caption)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .lineLimit(1)
                    .minimumScaleFactor(0.82)
            } else {
                HStack(spacing: SideSeatTheme.spaceSM) {
                    Label(intent.campus, systemImage: "building.columns")
                    if intent.verifiedStudent {
                        Label(AppLocalization.string("Verified student"), systemImage: "checkmark.seal.fill")
                    }
                }
                .font(.caption)
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)

                if let language = intent.primaryLanguageTitle {
                    Label(language, systemImage: "character.bubble")
                        .font(.caption)
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                }
            }

            if let course = intent.course, !compact {
                Label(course.title, systemImage: "book.closed")
                    .font(.caption)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
            }

            if let description = intent.descriptionPreview, !description.isEmpty {
                Text(description)
                    .font(.subheadline)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .lineLimit(compact ? 1 : 4)
                    .fixedSize(horizontal: false, vertical: !compact)
            }

            if showsPlusContext, !compact {
                Divider()
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                    Text(AppLocalization.string("Why this might fit"))
                        .font(.subheadline.weight(.semibold))
                    Text(AppLocalization.string("Plus can use your active intentions to explain activity and broad timing relevance without rating the person."))
                        .font(.footnote)
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("explore-intent-\(intent.id)")
    }

    private var compactContext: String {
        var parts = [intent.campus]
        if intent.verifiedStudent {
            parts.append(AppLocalization.string("Verified student"))
        }
        if let language = intent.primaryLanguageTitle {
            parts.append(language)
        }
        return parts.joined(separator: " · ")
    }
}
