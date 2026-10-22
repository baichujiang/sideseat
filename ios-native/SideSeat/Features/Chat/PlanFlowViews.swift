import SwiftUI

enum PlanNextStep: String, Sendable {
    case suggestActivity, chooseActivity, waitForActivity
    case fillAvailability, shareAvailability, chooseTime, confirm, waitForOrganizer, waitForReplies, viewPlan
    case publishPlan, shareInvitation, reviewReplies, declined, notIncluded, viewCalendar, recordOutcome

    var needsYou: Bool { [.suggestActivity, .chooseActivity, .fillAvailability, .shareAvailability, .chooseTime, .confirm, .shareInvitation, .publishPlan].contains(self) }
    var title: String {
        let key: String.LocalizationValue = switch self {
        case .suggestActivity: "Suggest an activity"
        case .chooseActivity: "Choose an activity for everyone"
        case .waitForActivity: "Waiting for the organizer to choose an activity"
        case .fillAvailability: "Fill in your free time"
        case .shareAvailability: "Invite friends to fill in"
        case .chooseTime: "Choose a time for everyone"
        case .confirm: "Does this time work for you?"
        case .waitForOrganizer: "Waiting for the organizer"
        case .waitForReplies: "Waiting for confirmations"
        case .viewPlan: "View plan"
        case .publishPlan: "Send final plan"
        case .shareInvitation: "Invite friends to confirm"
        case .reviewReplies: "Review replies and arrange the next step"
        case .declined: "You’ve replied that you can’t attend"
        case .notIncluded: "You’re not joining this plan"
        case .viewCalendar: "You’re all set"
        case .recordOutcome: "How did the activity go?"
        }
        return AppLocalization.string(key)
    }
    var action: String {
        let key: String.LocalizationValue = switch self {
        case .suggestActivity, .chooseActivity, .waitForActivity: "View activity ideas"
        case .fillAvailability: "Fill in my availability"
        case .shareAvailability: "Share with friends"
        case .chooseTime: "View timetable and choose"
        case .confirm: "View and confirm"
        case .waitForOrganizer: "View saved availability"
        case .waitForReplies: "View confirmation progress"
        case .viewPlan: "View plan"
        case .publishPlan: "Review and send"
        case .shareInvitation: "Share invitation"
        case .reviewReplies: "View confirmation progress"
        case .declined: "View my response"
        case .notIncluded: "View plan"
        case .viewCalendar: "View in Calendar"
        case .recordOutcome: "View activity feedback"
        }
        return AppLocalization.string(key)
    }
    var symbol: String {
        switch self {
        case .suggestActivity, .chooseActivity, .waitForActivity: "lightbulb"
        case .fillAvailability: "hand.tap"
        case .shareAvailability: "square.and.arrow.up"
        case .chooseTime: "calendar.badge.clock"
        case .confirm: "envelope.badge"
        case .waitForOrganizer, .waitForReplies: "hourglass"
        case .viewPlan, .viewCalendar: "calendar"
        case .publishPlan: "paperplane.fill"
        case .shareInvitation: "square.and.arrow.up"
        case .reviewReplies: "person.2.badge.gearshape"
        case .declined, .notIncluded: "person.crop.circle.badge.xmark"
        case .recordOutcome: "checkmark.bubble"
        }
    }
    /// Overview controls open a review surface; they do not execute the next step.
    var cardActionSymbol: String {
        switch self {
        case .suggestActivity, .chooseActivity, .waitForActivity: "lightbulb"
        case .fillAvailability, .waitForOrganizer: "calendar"
        case .publishPlan: "paperplane"
        case .shareAvailability, .shareInvitation: "square.and.arrow.up"
        case .chooseTime: "calendar.badge.clock"
        case .confirm: "envelope.open"
        case .waitForReplies, .reviewReplies: "person.2"
        case .viewPlan, .viewCalendar, .notIncluded: "calendar"
        case .declined: "text.bubble"
        case .recordOutcome: "checkmark.bubble"
        }
    }
}

/// The same short lifecycle appears in creation, availability and confirmation.
struct PlanJourneyProgress: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    var phase: String
    var fixed = false
    private var labels: [String] { fixed ? ["Confirm together", "In your calendars"] : ["Find a time", "Confirm together", "In your calendars"] }
    private var current: Int { phase == "CONFIRMED" ? labels.count - 1 : phase == "INVITING" ? labels.count - 2 : 0 }

    var body: some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8)) : AnyLayout(HStackLayout(alignment: .top, spacing: 8))
        layout {
            ForEach(Array(labels.enumerated()), id: \.offset) { index, label in
                HStack(alignment: .firstTextBaseline, spacing: 5) {
                    Image(systemName: index < current ? "checkmark.circle.fill" : "\(index + 1).circle\(index == current ? ".fill" : "")")
                        .accessibilityHidden(true)
                    Text(LocalizedStringKey(label)).fontWeight(index == current ? .semibold : .regular)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .font(.caption)
                .foregroundStyle(index == current ? SideSeatTheme.textPrimary : SideSeatTheme.textSecondaryStrong)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("plan-journey-progress")
    }
}

/// Filled controls commit a choice; outlined controls edit or share; arrows only open a destination.
enum PlanActionKind: Equatable { case commit, edit, utility, navigate, decline }

struct PlanActionLabel: View {
    @Environment(\.isEnabled) private var isEnabled
    let title: String
    let symbol: String
    var kind: PlanActionKind = .edit
    var isLoading = false

    private var foreground: Color {
        if !isEnabled { return SideSeatTheme.textSecondaryStrong }
        return kind == .commit ? SideSeatTheme.ProductAction.foreground
            : kind == .decline ? SideSeatTheme.danger : SideSeatTheme.textPrimary
    }

    var body: some View {
        HStack(spacing: SideSeatTheme.spaceSM) {
            if isLoading {
                ProgressView().tint(foreground)
            } else {
                Image(systemName: symbol).accessibilityHidden(true)
                Text(title).fixedSize(horizontal: false, vertical: true)
                if kind == .navigate {
                    Spacer(minLength: 0)
                    Image(systemName: "arrow.right").accessibilityHidden(true)
                }
            }
        }
        .font(.subheadline.weight(kind == .commit ? .semibold : .medium))
        .multilineTextAlignment(.center)
        .padding(.horizontal, SideSeatTheme.spaceMD).padding(.vertical, SideSeatTheme.spaceSM)
        .frame(maxWidth: .infinity, minHeight: 48)
        .foregroundStyle(foreground)
        .background(kind == .commit ? (isEnabled ? SideSeatTheme.ProductAction.fill : SideSeatTheme.Interaction.disabledFill) : Color.clear,
                    in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
        .ssActionOutline(destructive: kind == .decline)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore).accessibilityLabel(title)
    }
}

struct PlanActionButton: View {
    let title: String
    let symbol: String
    var kind: PlanActionKind = .edit
    var isLoading = false
    var accessibilityID: String? = nil
    let action: () -> Void

    var body: some View {
        Button(role: kind == .decline ? .destructive : nil, action: action) {
            PlanActionLabel(title: title, symbol: symbol, kind: kind, isLoading: isLoading)
        }
        .buttonStyle(SSPressButtonStyle()).disabled(isLoading)
        .ssAccessibilityIdentifier(accessibilityID)
    }
}

struct PlanShareActions: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dynamicTypeSize) private var typeSize
    let poll: NativeTimePoll
    @Bindable var store: TimePollStore
    @State private var copied = false
    @State private var showsShare = false
    @State private var showsContacts = false
    @State private var sent = false

    var body: some View {
        Button { showsShare = true } label: {
            Label("Share", systemImage: "square.and.arrow.up").labelStyle(.titleAndIcon)
        }.accessibilityIdentifier("plan-share-open")
        .sheet(isPresented: $showsShare) {
            NavigationStack {
                List {
                    Section {
                        Text(poll.title).font(.headline)
                        if let start = poll.chosenStart, let end = poll.chosenEnd {
                            Text(unifiedPlanTimeLabel(start: start, end: end, timeZone: poll.timeZone))
                                .font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                    Section {
                        if poll.isOwner && ["COLLECTING", "INVITING", "CONFIRMED"].contains(poll.planningPhase) {
                            Button { showsContacts = true } label: {
                                Label(sent ? "Sent · invite more" : "Invite App contacts", systemImage: "person.crop.circle.badge.plus")
                            }.accessibilityIdentifier("plan-invite-contacts")
                        }
                        ShareLink(item: poll.shareUrl) {
                            Label("Share web link", systemImage: "square.and.arrow.up")
                        }.accessibilityIdentifier("plan-share-primary")
                        Button {
                            UIPasteboard.general.url = poll.shareUrl; copied = true
                        } label: {
                            Label(copied ? "Link copied" : "Copy link", systemImage: copied ? "checkmark" : "doc.on.doc")
                        }.accessibilityIdentifier("plan-copy-link")
                    }
                }
                .navigationTitle("Share plan").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { showsShare = false } } }
                .sheet(isPresented: $showsContacts) {
                    PlanContactInviteSheet(poll: store.poll ?? poll) {
                        sent = true
                        await store.load(session: session)
                        NotificationCenter.default.post(name: .sideSeatPlansNeedsRefresh, object: nil)
                        NotificationCenter.default.post(name: .sideSeatInboxNeedsRefresh, object: nil)
                    }.dynamicTypeSize(typeSize)
                }
            }.presentationDetents([.medium, .large]).dynamicTypeSize(typeSize)
        }
    }
}

struct PlanContactInviteSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    let poll: NativeTimePoll
    let onSent: () async -> Void
    @State private var contacts = ContactsStore()
    @State private var search = ""
    @State private var selected = Set<String>()
    @State private var sending = false
    @State private var issue: String?
    @State private var requestKey = UUID().uuidString

    private var sentTo: Set<String> { Set(poll.sharedWithUserIds ?? []) }
    private var filtered: [NativeContactRow] {
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
        return contacts.contacts.filter { query.isEmpty || $0.displayName.localizedCaseInsensitiveContains(query)
            || $0.peer.username.localizedCaseInsensitiveContains(query) }
    }

    var body: some View {
        NavigationStack {
            Group {
                if contacts.isLoading && !contacts.hasLoaded {
                    ProgressView("Loading contacts")
                } else if let error = contacts.issue {
                    ContentUnavailableView {
                        Label("Couldn't load contacts", systemImage: "wifi.exclamationmark")
                    } description: { Text(error) } actions: {
                        Button("Retry") { Task { await contacts.load(using: session) } }
                    }
                } else if contacts.contacts.isEmpty {
                    ContentUnavailableView("No contacts yet", systemImage: "person.crop.circle.badge.plus",
                        description: Text("Add friends to your contacts to invite them in the App. Use a web link for friends without the App."))
                } else {
                    List {
                        Section {
                            ForEach(filtered) { contact in
                                let alreadySent = sentTo.contains(contact.peer.id)
                                Button {
                                    if selected.contains(contact.id) { selected.remove(contact.id) }
                                    else if selected.count < 19 { selected.insert(contact.id) }
                                    issue = nil; requestKey = UUID().uuidString
                                } label: {
                                    HStack(spacing: SideSeatTheme.spaceSM) {
                                        InitialAvatar(name: contact.displayName, url: contact.peer.avatarUrl, size: 40)
                                        VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                                            Text(contact.displayName).foregroundStyle(SideSeatTheme.textPrimary)
                                            if alreadySent { Text("Already sent").font(.caption).foregroundStyle(.secondary) }
                                        }
                                        Spacer(minLength: 0)
                                        Image(systemName: alreadySent || selected.contains(contact.id) ? "checkmark.circle.fill" : "circle")
                                            .foregroundStyle(alreadySent ? SideSeatTheme.textSecondaryStrong : SideSeatTheme.utilityAction)
                                    }.padding(.vertical, SideSeatTheme.spaceXS)
                                }
                                .disabled(sending || alreadySent || selected.count >= 19 && !selected.contains(contact.id))
                                .accessibilityIdentifier("plan-contact-\(contact.peer.id)")
                                .accessibilityValue(alreadySent ? AppLocalization.string("Already sent") : selected.contains(contact.id) ? "Selected" : "Not selected")
                            }
                            if filtered.isEmpty { Text("No matching contacts").foregroundStyle(.secondary) }
                        } header: { Text(poll.title) } footer: {
                            Text(LocalizedStringKey(poll.planningPhase == "COLLECTING"
                                ? poll.hasFixedTime ? "Friends receive a plan card and suggest activities for the set time." : "Friends receive a plan card and fill their availability in the App."
                                : "Friends receive a plan card and decide whether to attend."))
                        }
                    }
                }
            }
            .searchable(text: $search, prompt: "Search contacts")
            .safeAreaInset(edge: .bottom, spacing: 0) {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                    if let issue { Text(issue).font(.footnote).foregroundStyle(SideSeatTheme.danger).accessibilityIdentifier("plan-contact-error") }
                    PlanActionButton(title: String(format: AppLocalization.string("Send plan to %d contacts"), selected.count),
                        symbol: "paperplane.fill", kind: .commit, isLoading: sending,
                        accessibilityID: "plan-contact-send") { Task { await send() } }
                        .disabled(selected.isEmpty || sending)
                }.padding(SideSeatTheme.spaceMD).background(SideSeatTheme.surface)
                    .overlay(alignment: .top) { Divider() }
            }
            .navigationTitle("Invite contacts").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(sending) } }
            .task { await contacts.load(using: session) }
        }.interactiveDismissDisabled(sending)
    }

    private func send() async {
        guard !sending && !selected.isEmpty else { return }
        sending = true; issue = nil
        defer { sending = false }
        do {
            let _: APIEnvelope<SharePlanContactsResult> = try await session.sendAuthorized(
                "/api/v1/time-polls/\(poll.token)/contacts", method: .post,
                body: SharePlanContactsRequest(connectionIds: selected.sorted(), version: poll.invitationVersion ?? 0), idempotencyKey: requestKey)
            await onSent(); dismiss()
        } catch { issue = AppLocalization.string(String.LocalizationValue(error.localizedDescription)) }
    }
}

struct SharedPlanChatCard: View {
    @Environment(SessionStore.self) private var session
    @Environment(DeepLinkRouter.self) private var router
    @Environment(\.dynamicTypeSize) private var typeSize
    let token: String
    let title: String
    @State private var store: TimePollStore

    init(token: String, title: String) {
        self.token = token; self.title = title
        _store = State(initialValue: TimePollStore(token: token))
    }

    var body: some View {
        Button { router.handleAppRoute(.timePoll(token: token)) } label: {
            SSFlowCard(contentPadding: 0, contentSpacing: 0, activityTopic: .study) {
                VStack(alignment: .leading, spacing: 0) {
                    SSActivityHeaderBand(topic: .study, verticalPadding: SideSeatTheme.spaceSM) {
                        Text(store.poll?.title ?? title).font(.headline)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                        if let poll = store.poll {
                            if let start = poll.chosenStart, let end = poll.chosenEnd {
                                Text(unifiedPlanTimeLabel(start: start, end: end, timeZone: poll.timeZone))
                                    .font(.subheadline).fixedSize(horizontal: false, vertical: true)
                            }
                            Text(poll.presentation(at: Date()).cardStatusTitle)
                                .font(.caption).foregroundStyle(.secondary)
                            Label(AppLocalization.string(poll.planningPhase == "COLLECTING" && poll.hasFixedTime ? "View activity ideas" : poll.presentation(at: Date()).nextStep == .fillAvailability ? "Fill my availability"
                                  : poll.presentation(at: Date()).nextStep == .confirm ? "View invitation" : "View plan"), systemImage: "arrow.right")
                                .font(.subheadline.weight(.semibold))
                        } else {
                            Label("View plan", systemImage: "calendar.badge.clock").font(.subheadline.weight(.semibold))
                        }
                    }.padding(SideSeatTheme.spaceMD)
                }
            }
        }.buttonStyle(SSPressButtonStyle())
            .frame(maxWidth: typeSize.isAccessibilitySize ? .infinity : 320, alignment: .leading)
            .accessibilityIdentifier("shared-plan-card-\(token)")
            .task { await store.load(session: session) }
            .onReceive(NotificationCenter.default.publisher(for: .sideSeatPlansNeedsRefresh)) { _ in
                Task { await store.load(session: session) }
            }
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { _ in
                Task { await store.load(session: session) }
            }
    }
}

/// A flat identity header keeps the timetable as the dominant detail surface.
struct PlanDetailHeading: View {
    let poll: NativeTimePoll
    var statusIdentifier = "plan-display-status"
    var edit: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
            PlanAdaptiveRow {
                Text(poll.title).font(.title2.weight(.semibold))
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("time-poll-detail-title")
            } trailing: {
                PlanStatusBadge(status: poll.presentation(at: Date()).status,
                    needsYou: poll.presentation(at: Date()).nextStep.needsYou, identifier: statusIdentifier,
                    titleOverride: poll.planningPhase == "INVITING" ? AppLocalization.string(poll.isOwner
                        ? "Ready to send final plan" : poll.allInvitations.contains { $0.isMe && $0.status == "ACCEPTED" }
                        ? "Waiting for the organizer to send" : "Your confirmation needed") : nil)
            }
            HStack(alignment: .center, spacing: SideSeatTheme.spaceSM) {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: SideSeatTheme.spaceSM) { metadata }
                    VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) { metadata }
                }
                Spacer(minLength: 0)
                if let edit {
                    Button(action: edit) { Label("Edit", systemImage: "pencil").font(.caption).frame(minHeight: 44) }
                        .accessibilityLabel("Edit plan information").accessibilityIdentifier("plan-edit-information")
                }
            }.font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder private var metadata: some View {
        Text(LocalizedStringKey(poll.isOwner ? "Organized by you" : "Shared plan"))
        if let location = poll.location, !location.isEmpty {
            Label(location, systemImage: "mappin.and.ellipse")
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}


/// Shared display only: each caller retains its existing navigation and mutation actions.
struct PlanStatusBadge: View {
    let status: PlanDisplayStatus
    var needsYou = false
    var identifier: String = "plan-display-status"
    var titleOverride: String? = nil

    private var foreground: Color {
        if status == .confirmed || status == .inProgress { return SideSeatTheme.statusSuccessText }
        if needsYou { return SideSeatTheme.statusWarningText }
        return SideSeatTheme.textSecondaryStrong
    }

    var body: some View {
        Label(titleOverride ?? status.title, systemImage: status.symbol)
            .font(.caption.weight(.semibold)).foregroundStyle(foreground)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, SideSeatTheme.spaceSM)
            .padding(.vertical, SideSeatTheme.spaceXS)
            .background(foreground.opacity(0.08), in: Capsule())
            .accessibilityIdentifier(identifier)
    }
}

struct PlanNextStepSummary: View {
    let presentation: PlanPresentation
    var showsDetail = true

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(presentation.nextStep.title).font(.subheadline.weight(.semibold))
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("plan-next-step")
            if showsDetail {
                Text(presentation.detail).font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct PlanOpenActionLabel: View {
    let step: PlanNextStep
    var body: some View {
        HStack {
            Text(step.action).font(.subheadline.weight(.semibold)).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
            Image(systemName: "arrow.right").accessibilityHidden(true)
        }
        .foregroundStyle(step.needsYou ? SideSeatTheme.ProductAction.foreground : SideSeatTheme.textPrimary)
        .padding(.horizontal, step.needsYou ? 12 : 0).frame(minHeight: 46)
        .background(step.needsYou ? SideSeatTheme.ProductAction.fill : Color.clear,
                    in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
    }
}

/// Shared card anatomy only; callers own navigation and all plan mutations.
struct PlanCardHeading: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    let title: String
    let presentation: PlanPresentation
    var context: String? = nil
    var titleIdentifier: String? = nil
    var statusIdentifier = "plan-display-status"

    var body: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            let layout = typeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: SideSeatTheme.spaceXS))
                : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: SideSeatTheme.spaceSM))
            layout {
                PlanStatusBadge(status: presentation.status, needsYou: presentation.nextStep.needsYou,
                                identifier: statusIdentifier)
                if let context {
                    if !typeSize.isAccessibilitySize { Spacer(minLength: 4) }
                    Text(context).font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            if let titleIdentifier {
                titleText.accessibilityIdentifier(titleIdentifier)
            } else { titleText }
        }
    }

    private var titleText: some View {
        Text(title).font(.title3.weight(.semibold)).foregroundStyle(SideSeatTheme.textPrimary)
            .fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct PlanCardSchedule: View {
    let start: Date
    let end: Date
    var timeZone: String = TimeZone.current.identifier
    var location: String? = nil
    var relative: String? = nil
    var compact = false

    var body: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            if compact {
                Text(dateText + " · " + clockText).font(.footnote)
                    .fixedSize(horizontal: false, vertical: true)
                Text(timeZone).font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
            } else { HStack(alignment: .top, spacing: SideSeatTheme.spaceSM) {
                Image(systemName: "calendar").font(.subheadline)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong).padding(.top, 2).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                    Text(dateText).font(.subheadline.weight(.medium)).fixedSize(horizontal: false, vertical: true)
                    Text(clockText).font(.title3.weight(.semibold).monospacedDigit())
                        .fixedSize(horizontal: false, vertical: true)
                    if let relative {
                        Text(relative).font(.caption.weight(.medium)).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    }
                    Text(timeZone).font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                }.frame(maxWidth: .infinity, alignment: .leading)
            } }
            if let location = location?.trimmingCharacters(in: .whitespacesAndNewlines), !location.isEmpty {
                Label(location, systemImage: "mappin.and.ellipse").font(.subheadline)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong).fixedSize(horizontal: false, vertical: true)
            }
        }.foregroundStyle(SideSeatTheme.textPrimary)
    }

    private func formatter(_ template: String) -> DateFormatter {
        let format = DateFormatter()
        format.locale = AppLocalization.selectedLanguage.locale
        format.timeZone = TimeZone(identifier: timeZone) ?? .current
        format.setLocalizedDateFormatFromTemplate(template)
        return format
    }
    private var dateText: String {
        let format = formatter("yMMMdEEE")
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = format.timeZone
        let first = format.string(from: start)
        return calendar.isDate(start, inSameDayAs: end) ? first : first + " – " + format.string(from: end)
    }
    private var clockText: String {
        let format = formatter("jmm")
        return format.string(from: start) + " – " + format.string(from: end)
    }
}

struct PlanCardProgress: View {
    let title: String
    var confirmed: Int? = nil
    var target: Int? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            Label(title, systemImage: "person.2")
                .font(.caption.weight(.medium)).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .fixedSize(horizontal: false, vertical: true)
            if let confirmed, let target, target > 0 {
                ProgressView(value: Double(min(confirmed, target)), total: Double(target))
                    .tint(SideSeatTheme.utilityAction).accessibilityHidden(true)
            }
        }
    }
}

struct PlanCardActionFooter: View {
    let presentation: PlanPresentation

    private var step: PlanNextStep { presentation.nextStep == .viewCalendar ? .viewPlan : presentation.nextStep }
    var body: some View {
        HStack(alignment: .center, spacing: SideSeatTheme.spaceMD) {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                if presentation.nextStep.title != step.action {
                    Text(presentation.nextStep.title).font(.caption)
                        .fixedSize(horizontal: false, vertical: true).accessibilityIdentifier("plan-next-step")
                }
                Text(step.action).font(.subheadline.weight(.semibold)).fixedSize(horizontal: false, vertical: true)
            }.frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "arrow.right").font(.subheadline.weight(.semibold)).accessibilityHidden(true)
        }
        .foregroundStyle(step.needsYou ? SideSeatTheme.ProductAction.foreground : SideSeatTheme.textPrimary)
        .padding(SideSeatTheme.spaceMD).frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
        .background(step.needsYou ? SideSeatTheme.ProductAction.fill : SideSeatTheme.bgGrouped,
                    in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
    }
}
