import SwiftUI

struct ExploreIntentListView: View {
    @Environment(SessionStore.self) private var session
    @Environment(ClientConfigurationStore.self) private var clientConfiguration
    @Environment(RouterPath.self) private var router
    var embeddedInTogether = false
    var isPageActive = true
    var onOpportunityChange: ((NativeMutualOpportunity) -> Void)? = nil
    var onBookmarkSaved: ((NativeMutualOpportunity) -> Void)? = nil
    var onShowRecommendations: (() -> Void)? = nil
    var inlineInRecommendations = false
    var resultLimit: Int? = nil
    var opportunities: [NativeMutualOpportunity] = []
    var renderOpportunity: ((NativeMutualOpportunity) -> AnyView)? = nil
    @State var store = ExploreIntentStore()
    @State private var interactionStore = MutualOpportunityStore()
    @State private var messageOpportunity: NativeMutualOpportunity?

    private var effectiveLimit: Int { resultLimit ?? access.resultLimit }
    @State private var searchText = ""
    @State private var selectedTopic: NativeWeeklyIntentTopic? = nil
    @FocusState private var searchIsFocused: Bool
    private let access = ExploreAccessTier.current

    private var isEnabled: Bool {
        clientConfiguration.configuration?.isFeatureEnabled("v2ExploreIntents") == true
    }

    var body: some View {
        Group {
            if inlineInRecommendations { cardsContent }
            else if embeddedInTogether { content }
            else {
                content.navigationTitle(AppLocalization.string("Explore intentions"))
                    .navigationBarTitleDisplayMode(.inline)
            }
        }
        .background(SideSeatTheme.bgGrouped)
        .tint(SideSeatTheme.utilityAction)
        .task(id: isEnabled && isPageActive) {
            if isEnabled && isPageActive && !inlineInRecommendations {
                await store.load(using: session, limit: effectiveLimit)
            }
        }
        .refreshable { if isEnabled { await store.load(using: session, limit: effectiveLimit) } }
        .sheet(item: $messageOpportunity) { opportunity in
            OpportunityMessageComposer(opportunity: opportunity, onSend: { body in
                let action = opportunity.messageRequest?.isIncoming == true ? "REPLY" : "SEND"
                let result = await interactionStore.interact(action, opportunity: opportunity, body: body, using: session)
                if let result { onOpportunityChange?(result) }
                return result
            }, onConversation: { router.navigate(to: $0.conversationRoute) })
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("explore-intents-list")
    }

    @ViewBuilder
    private var content: some View {
        if !isEnabled {
            ContentUnavailableView {
                Label(AppLocalization.string("Explore is not available yet"), systemImage: "sparkle.magnifyingglass")
            } description: {
                Text(AppLocalization.string("Explore is not enabled in this environment. Your intentions and recommendations remain separate."))
            }
            .accessibilityIdentifier("explore-unavailable")
        } else {
        ScrollView {
            cardsContent
                .padding(.horizontal, SideSeatTheme.screenHorizontal)
                .padding(.vertical, SideSeatTheme.spaceMD)
        }
        .scrollDismissesKeyboard(.interactively)
        }
    }

    private var cardsContent: some View {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                if !inlineInRecommendations {
                Text(AppLocalization.string("Explore what people around campus want to do"))
                    .font(.headline)
                    .foregroundStyle(SideSeatTheme.Together.ink)
                    .fixedSize(horizontal: false, vertical: true)

                Text(AppLocalization.string("Save an intention privately or say hello with a message."))
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .fixedSize(horizontal: false, vertical: true)

                }
                if access.showsAdvancedContext && !inlineInRecommendations {
                    Label(AppLocalization.string("SideSeat Plus exploration"), systemImage: "sparkles")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .accessibilityIdentifier("explore-plus-status")
                    HStack(spacing: SideSeatTheme.spaceSM) {
                        Image(systemName: "magnifyingglass")
                            .foregroundStyle(SideSeatTheme.textSecondary)
                            .accessibilityHidden(true)
                        TextField(AppLocalization.string("Search activities"), text: $searchText)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .submitLabel(.search)
                            .focused($searchIsFocused)
                            .onSubmit { searchIsFocused = false }
                            .accessibilityIdentifier("explore-search")
                        if !searchText.isEmpty {
                            Button { searchText = "" } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundStyle(SideSeatTheme.textSecondary)
                                    .frame(width: 44, height: 44)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Clear search")
                            .accessibilityIdentifier("explore-clear-search")
                        }
                    }
                    .padding(.leading, SideSeatTheme.spaceMD)
                    .padding(.trailing, searchText.isEmpty ? SideSeatTheme.spaceMD : 0)
                    .frame(minHeight: 44)
                    .background(SideSeatTheme.fillTertiary,
                        in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
                    .background(SSPageSwipeExclusion())
                    ScrollView(.horizontal) {
                        HStack(spacing: SideSeatTheme.spaceSM) {
                            topicFilter(nil)
                            ForEach(NativeWeeklyIntentTopic.allCases) { topic in
                                topicFilter(topic)
                            }
                        }
                    }
                    .scrollIndicators(.hidden)
                    .accessibilityIdentifier("explore-topic-filters")
                    .background(SSPageSwipeExclusion())
                }

                if inlineInRecommendations, store.intents.isEmpty {
                    if let issue = store.issue {
                        Text(issue).font(.footnote).foregroundStyle(SideSeatTheme.danger)
                    } else if store.hasLoaded && !store.isLoading {
                        Text("No new recommendations right now.")
                            .font(.footnote).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                            .frame(maxWidth: .infinity)
                            .accessibilityIdentifier("explore-intents-empty")
                        Button(AppLocalization.string("Try again")) {
                            Task { await store.load(using: session, limit: effectiveLimit) }
                        }.buttonStyle(.bordered)
                    }
                } else if store.isLoading, store.intents.isEmpty {
                    ProgressView().frame(maxWidth: .infinity, minHeight: 120)
                } else if let issue = store.issue, store.intents.isEmpty {
                    ContentUnavailableView {
                        Label(AppLocalization.string("Explore couldn't load"), systemImage: "wifi.exclamationmark")
                    } description: { Text(issue) } actions: {
                        Button(AppLocalization.string("Try again")) {
                            Task { await store.load(using: session, limit: effectiveLimit) }
                        }
                        .buttonStyle(.bordered)
                    }
                    .accessibilityIdentifier("explore-error")
                } else if store.intents.isEmpty {
                    ContentUnavailableView {
                        Label(AppLocalization.string("Nothing new to explore right now"), systemImage: "sparkles")
                    } description: {
                        Text(AppLocalization.string("New activity intentions will appear here when students choose to share them."))
                    }
                    .accessibilityIdentifier("explore-intents-empty")
                } else {
                    ForEach(visibleIntents) { intent in
                        if let opportunity = (opportunities + interactionStore.opportunities).first(where: { $0.id == intent.interest?.opportunityId }) {
                            if let renderOpportunity {
                                renderOpportunity(opportunity)
                            } else {
                                MutualOpportunityCard(opportunity: opportunity,
                                    isWorking: interactionStore.mutatingIDs.contains(opportunity.id),
                                    onBookmark: { Task { await toggleBookmark(opportunity) } },
                                    onMessage: { messageOpportunity = opportunity },
                                    onOpenConversation: {
                                        router.navigate(to: opportunity.conversationRoute)
                                    })
                            }
                        } else {
                            ExploreIntentCard(intent: intent, compact: false, showsPlusContext: access.showsAdvancedContext && !inlineInRecommendations,
                                isWorking: store.mutatingIDs.contains(intent.id),
                                onBookmark: { Task { await startInteraction(intent, bookmark: true) } },
                                onMessage: { Task { await startInteraction(intent, bookmark: false) } })
                        }
                    }
                    if visibleIntents.isEmpty && !inlineInRecommendations {
                        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                            Text(AppLocalization.string("No Explore results match these filters"))
                                .font(.subheadline)
                                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                                .fixedSize(horizontal: false, vertical: true)
                            SSSecondaryButton(
                                title: AppLocalization.string("Clear filters"),
                                expands: false,
                                accessibilityID: "explore-clear-filters"
                            ) {
                                searchText = ""
                                selectedTopic = nil
                                searchIsFocused = false
                            }
                        }
                        .padding(.vertical, SideSeatTheme.spaceMD)
                        .accessibilityElement(children: .contain)
                        .accessibilityIdentifier("explore-filter-empty")
                    }
                }

                if !inlineInRecommendations, access == .free, store.hasMore {
                    VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                        Label(AppLocalization.string("Explore more with SideSeat Plus"), systemImage: "sparkles")
                            .font(.headline)
                        Text(AppLocalization.string("Plus can unlock more Explore results, richer activity context, search and filters."))
                            .font(.footnote)
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.vertical, SideSeatTheme.spaceMD)
                    .accessibilityIdentifier("explore-plus-preview")
                }

                if let issue = interactionStore.issue ?? store.issue, !store.intents.isEmpty {
                    Text(issue).font(.footnote).foregroundStyle(SideSeatTheme.danger)
                }
            }
    }

    private func startInteraction(_ intent: NativeExploreIntent, bookmark: Bool) async {
        guard let opportunity = await store.prepareContact(in: intent, using: session) else { return }
        interactionStore.upsert(opportunity)
        onOpportunityChange?(opportunity)
        if bookmark {
            await toggleBookmark(opportunity)
        } else if opportunity.coordination != nil || opportunity.messageRequest != nil {
            router.navigate(to: opportunity.conversationRoute)
        } else if opportunity.messageRequest == nil || opportunity.messageRequest?.isIncoming == true {
            messageOpportunity = opportunity
        }
    }

    private func toggleBookmark(_ opportunity: NativeMutualOpportunity) async {
        if let updated = await interactionStore.interact(opportunity.isBookmarked == true ? "UNBOOKMARK" : "BOOKMARK",
            opportunity: opportunity, using: session) {
            onOpportunityChange?(updated)
            if updated.isBookmarked == true { onBookmarkSaved?(updated) }
        }
    }

    private func topicFilter(_ topic: NativeWeeklyIntentTopic?) -> some View {
        let isSelected = selectedTopic == topic
        let title = topic?.title ?? AppLocalization.string("All activities")
        return Button {
            selectedTopic = topic
            searchIsFocused = false
        } label: {
            HStack(spacing: SideSeatTheme.spaceXS) {
                Image(systemName: "checkmark")
                    .opacity(isSelected ? 1 : 0)
                    .accessibilityHidden(true)
                Text(title)
            }
            .font(.subheadline.weight(isSelected ? .semibold : .regular))
            .foregroundStyle(isSelected ? SideSeatTheme.utilityAction : SideSeatTheme.textPrimary)
            .padding(.horizontal, SideSeatTheme.spaceMD)
            .frame(minHeight: 44)
            .background(isSelected ? SideSeatTheme.Together.navigationSelection : SideSeatTheme.fillTertiary,
                in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityIdentifier("explore-filter-\(topic?.rawValue ?? "all")")
    }

    private var visibleIntents: [NativeExploreIntent] {
        let candidates = store.intents.filter { intent in
            guard let interest = intent.interest else { return true }
            // The parent holds newer changes made from Saved intentions.
            let opportunity = (opportunities + interactionStore.opportunities).first { $0.id == interest.opportunityId }
            return interest.coordination == nil && opportunity?.hasConversation != true
        }
        guard access == .plus && !inlineInRecommendations else { return Array(candidates.prefix(effectiveLimit)) }
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
            .folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
        return candidates.filter { intent in
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
    var isWorking = false
    var onBookmark: (() -> Void)? = nil
    var onMessage: (() -> Void)? = nil

    var body: some View {
        SSFlowCard(
            contentPadding: 0,
            contentSpacing: 0,
            activityTopic: intent.topic
        ) {
            SSActivityHeaderBand(
                topic: intent.topic,
                horizontalPadding: compact ? SideSeatTheme.spaceMD : SideSeatTheme.Together.cardPadding,
                verticalPadding: compact ? SideSeatTheme.spaceSM : SideSeatTheme.spaceMD
            ) {
                header
            }
            .accessibilityIdentifier("explore-intent-header-\(intent.id)")
            details
                .padding(compact ? SideSeatTheme.spaceMD : SideSeatTheme.Together.cardPadding)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("explore-intent-\(intent.id)")
    }

    private var header: some View {
        HStack(alignment: .top, spacing: compact ? SideSeatTheme.spaceSM : SideSeatTheme.spaceMD) {
            VStack(alignment: .leading, spacing: 2) {
                Text(intent.topic.title)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.Together.categoryInk(for: intent.topic))
                Text(intent.activityTitle)
                    .font(compact ? .headline : .title3.weight(.semibold))
                    .lineLimit(compact ? 1 : nil)
                    .fixedSize(horizontal: false, vertical: !compact)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            SSActivityArtwork(topic: intent.topic, size: compact ? 36 : 44)
        }
    }

    private var details: some View {
        VStack(alignment: .leading, spacing: compact ? SideSeatTheme.spaceSM : SideSeatTheme.spaceMD) {
            Label(intent.time.summary, systemImage: "calendar")
                .font(.footnote.weight(.medium))
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .lineLimit(compact ? 1 : nil)
                .fixedSize(horizontal: false, vertical: !compact)
                .padding(.vertical, SideSeatTheme.spaceXS)
                .frame(maxWidth: .infinity, alignment: .leading)

            if intent.isPlus == true { SSPlusBadge() }

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

            if !compact { interestAction }

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
    }

    private var interestAction: some View {
        SSIntentionActionRow(isBookmarked: false, isDisabled: isWorking || intent.isExample == true,
            bookmarkIdentifier: "explore-bookmark-\(intent.id)", onBookmark: { onBookmark?() }) {
            SSIntentionContactButton(title: AppLocalization.string("Say hello"),
                identifier: "explore-message-\(intent.id)", isDisabled: isWorking || intent.isExample == true,
                action: { onMessage?() })
        }
        .padding(.top, SideSeatTheme.spaceXS)
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
