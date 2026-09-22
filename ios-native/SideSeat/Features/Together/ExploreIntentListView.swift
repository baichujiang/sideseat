import SwiftUI

struct ExploreIntentListView: View {
    @Environment(SessionStore.self) private var session
    @Environment(ClientConfigurationStore.self) private var clientConfiguration
    @Environment(RouterPath.self) private var router
    var embeddedInTogether = false
    var isPageActive = true
    var onOpportunityChange: ((NativeMutualOpportunity) -> Void)? = nil
    var onShowRecommendations: (() -> Void)? = nil
    @State private var store = ExploreIntentStore()
    @State private var searchText = ""
    @State private var selectedTopic: NativeWeeklyIntentTopic? = nil
    @FocusState private var searchIsFocused: Bool
    private let access = ExploreAccessTier.current

    private var isEnabled: Bool {
        clientConfiguration.configuration?.isFeatureEnabled("v2ExploreIntents") == true
    }

    var body: some View {
        Group {
            if embeddedInTogether { content }
            else {
                content.navigationTitle(AppLocalization.string("Explore intentions"))
                    .navigationBarTitleDisplayMode(.inline)
            }
        }
        .background(SideSeatTheme.bgGrouped)
        .tint(SideSeatTheme.accentText)
        .task(id: isEnabled && isPageActive) {
            if isEnabled && isPageActive {
                await store.load(using: session, limit: access.resultLimit)
            }
        }
        .refreshable { if isEnabled { await store.load(using: session, limit: access.resultLimit) } }
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
            LazyVStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                Text(AppLocalization.string("Explore what people around campus want to do"))
                    .font(.headline)
                    .foregroundStyle(SideSeatTheme.Together.ink)
                    .fixedSize(horizontal: false, vertical: true)

                Text(AppLocalization.string("Show interest in an activity. Your choice stays private until you both show interest."))
                    .font(.footnote)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .fixedSize(horizontal: false, vertical: true)

                if access.showsAdvancedContext {
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

                if store.isLoading, store.intents.isEmpty {
                    ProgressView().frame(maxWidth: .infinity, minHeight: 120)
                } else if let issue = store.issue, store.intents.isEmpty {
                    ContentUnavailableView {
                        Label(AppLocalization.string("Explore couldn't load"), systemImage: "wifi.exclamationmark")
                    } description: { Text(issue) } actions: {
                        Button(AppLocalization.string("Try again")) {
                            Task { await store.load(using: session, limit: access.resultLimit) }
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
                        ExploreIntentCard(intent: intent, compact: false, showsPlusContext: access.showsAdvancedContext,
                            isWorking: store.mutatingIDs.contains(intent.id),
                            onInterested: {
                                Task {
                                    if let opportunity = await store.expressInterest(in: intent, using: session) {
                                        onOpportunityChange?(opportunity)
                                    }
                                }
                            },
                            onWithdraw: {
                                Task {
                                    if let opportunity = await store.withdrawInterest(in: intent, using: session) {
                                        onOpportunityChange?(opportunity)
                                    }
                                }
                            },
                            onShowRecommendations: onShowRecommendations,
                            onOpenConversation: {
                                if let connectionID = intent.interest?.coordination?.connectionId {
                                    router.navigate(to: .directChat(connectionID: connectionID))
                                }
                            })
                    }
                    if visibleIntents.isEmpty {
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

                if let issue = store.issue, !store.intents.isEmpty {
                    Text(issue).font(.footnote).foregroundStyle(SideSeatTheme.danger)
                }
            }
            .padding(.horizontal, SideSeatTheme.screenHorizontal)
            .padding(.vertical, SideSeatTheme.spaceMD)
        }
        .scrollDismissesKeyboard(.interactively)
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
            .foregroundStyle(isSelected ? SideSeatTheme.accentText : SideSeatTheme.textPrimary)
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
    var isWorking = false
    var onInterested: (() -> Void)? = nil
    var onWithdraw: (() -> Void)? = nil
    var onShowRecommendations: (() -> Void)? = nil
    var onOpenConversation: (() -> Void)? = nil

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

    @ViewBuilder
    private var interestAction: some View {
        if intent.interest?.state == "READY_TO_COORDINATE" {
            Label(AppLocalization.string("You both showed interest"), systemImage: "checkmark.circle.fill")
                .font(.subheadline.weight(.semibold)).foregroundStyle(SideSeatTheme.statusSuccessText)
            if let onOpenConversation {
                actionButton("Chat about the details", icon: "bubble.left.and.bubble.right", identifier: "explore-chat-\(intent.id)", action: onOpenConversation)
            }
        } else if intent.interest?.state == "DECIDED" {
            if let onWithdraw {
                SSOpportunityInterestStatus(id: intent.id, accessibilityPrefix: "explore-interest",
                    isWorking: isWorking, onWithdraw: onWithdraw)
            }
            if let onShowRecommendations {
                Button(AppLocalization.string("View in recommendations"), action: onShowRecommendations)
                    .font(.footnote.weight(.medium)).frame(minHeight: 44)
                    .accessibilityIdentifier("explore-view-recommendations-\(intent.id)")
            }
        } else if intent.interest?.state == "UNAVAILABLE" {
            Label(AppLocalization.string("Details are no longer available."), systemImage: "minus.circle")
                .font(.footnote).foregroundStyle(SideSeatTheme.textSecondaryStrong)
        } else if let onInterested {
            actionButton("Interested", icon: "heart", identifier: "explore-interest-\(intent.id)", action: onInterested)
                .accessibilityHint(AppLocalization.string("Show interest in an activity. Your choice stays private until you both show interest."))
        }
    }

    private func actionButton(_ title: String.LocalizationValue, icon: String, identifier: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: SideSeatTheme.spaceSM) {
                if isWorking { ProgressView().tint(SideSeatTheme.accentText) }
                else { Image(systemName: icon) }
                Text(AppLocalization.string(title))
            }
            .font(.subheadline.weight(.semibold))
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, minHeight: 48)
            .foregroundStyle(SideSeatTheme.accentText)
            .padding(.horizontal, SideSeatTheme.spaceSM)
            .background(SideSeatTheme.Together.selectedTab,
                        in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
            .contentShape(Rectangle())
        }
        .buttonStyle(SSPressButtonStyle())
        .disabled(isWorking)
        .accessibilityIdentifier(identifier)
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
