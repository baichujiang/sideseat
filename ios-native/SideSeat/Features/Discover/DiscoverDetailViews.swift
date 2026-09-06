import SwiftUI
import UIKit

private enum DiscoverDetailAnchor: Hashable {
    case comments
}

struct DiscoverMyResponsesView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    @State private var store = DiscoverMyResponsesStore()

    var body: some View {
        Group {
            if store.isLoading, !store.hasLoaded {
                SSLoadingState("Loading responses")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let issue = store.issue, store.interests.isEmpty {
                ContentUnavailableView {
                    Label("Could not load responses", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(issue)
                } actions: {
                    Button("Try again") {
                        Task { await store.load(using: session) }
                    }
                }
            } else if store.hasLoaded, store.interests.isEmpty {
                ContentUnavailableView {
                    Label("No responses yet", systemImage: "hand.raised")
                } description: {
                    Text("Actions you are interested in will stay available here, including past ones.")
                }
            } else {
                responseList
            }
        }
        .background(SideSeatTheme.bgGrouped)
        .navigationTitle("My responses")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Done") { dismiss() }
            }
        }
        .task { await store.load(using: session) }
        .accessibilityIdentifier("discover-my-responses")
    }

    private var responseList: some View {
        List {
            ForEach(store.interests) { interest in
                Section {
                    responseEntry(interest)

                    if interest.isWithdrawableBeforeConnect {
                        Button(role: .destructive) {
                            Task {
                                await store.withdraw(interestID: interest.id, using: session)
                            }
                        } label: {
                            HStack(spacing: SideSeatTheme.spaceSM) {
                                if store.isMutating(interestID: interest.id) {
                                    ProgressView()
                                        .controlSize(.small)
                                } else {
                                    Image(systemName: "arrow.uturn.backward")
                                }
                                Text("Withdraw response")
                                    .multilineTextAlignment(.leading)
                            }
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                            .contentShape(Rectangle())
                        }
                        .disabled(store.isMutating(interestID: interest.id))
                        .accessibilityIdentifier("discover-my-response-withdraw-\(interest.id)")
                    }
                }
                .onAppear {
                    Task {
                        await store.loadNextPageIfNeeded(
                            after: interest.id,
                            using: session
                        )
                    }
                }
            }

            if store.isLoadingNextPage {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
                .listRowBackground(Color.clear)
                .accessibilityLabel("Loading more responses")
            } else if let issue = store.issue, !store.interests.isEmpty {
                Section {
                    VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                        Text(issue)
                            .font(.footnote)
                            .foregroundStyle(SideSeatTheme.textSecondary)
                        Button("Try again") {
                            Task { await store.loadNextPage(using: session) }
                        }
                    }
                    .padding(.vertical, SideSeatTheme.spaceXS)
                }
            }
        }
        .listStyle(.insetGrouped)
        .refreshable { await store.load(using: session) }
    }

    @ViewBuilder
    private func responseEntry(_ interest: NativeCreatorGatedActionInterest) -> some View {
        if let target = interest.chatTarget {
            Button {
                router.navigate(
                    to: .directChat(
                        connectionID: target.connectionID,
                        focus: target.focus
                    )
                )
                dismiss()
            } label: {
                HStack(spacing: SideSeatTheme.spaceSM) {
                    DiscoverMyResponseRow(interest: interest)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Image(systemName: "chevron.forward")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textSecondary)
                        .accessibilityHidden(true)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens the linked conversation")
            .accessibilityIdentifier("discover-my-response-\(interest.id)")
        } else {
            NavigationLink {
                DiscoverMyResponseDetailView(
                    interestID: interest.id,
                    store: store
                )
            } label: {
                DiscoverMyResponseRow(interest: interest)
            }
            .accessibilityIdentifier("discover-my-response-\(interest.id)")
        }
    }
}

private struct DiscoverMyResponseRow: View {
    let interest: NativeCreatorGatedActionInterest

    var body: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline, spacing: SideSeatTheme.spaceSM) {
                    Text(interest.context.title ?? AppLocalization.string("Action unavailable"))
                        .font(.headline)
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .fixedSize(horizontal: true, vertical: false)
                    Spacer(minLength: SideSeatTheme.spaceSM)
                    DiscoverMyResponseStatus(interest: interest)
                        .fixedSize(horizontal: true, vertical: false)
                }

                VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                    Text(interest.context.title ?? AppLocalization.string("Action unavailable"))
                        .font(.headline)
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    DiscoverMyResponseStatus(interest: interest)
                }
            }

            if let course = interest.context.course {
                Label(courseLabel(course), systemImage: "book.closed")
                    .font(.subheadline)
                    .foregroundStyle(SideSeatTheme.textSecondary)
            }

            if let date = interest.contextStartDate {
                Label(
                    date.formatted(date: .abbreviated, time: .shortened),
                    systemImage: "calendar"
                )
                .font(.subheadline)
                .foregroundStyle(SideSeatTheme.textSecondary)
            }

            if let location = interest.context.location, !location.isEmpty {
                Label(location, systemImage: "mappin.and.ellipse")
                    .font(.subheadline)
                    .foregroundStyle(SideSeatTheme.textSecondary)
            }
        }
        .padding(.vertical, SideSeatTheme.spaceXS)
        .accessibilityElement(children: .combine)
    }

    private func courseLabel(_ course: NativeCreatorGatedActionCourse) -> String {
        guard let code = course.code, !code.isEmpty else { return course.name }
        return "\(code) · \(course.name)"
    }
}

private struct DiscoverMyResponseStatus: View {
    let interest: NativeCreatorGatedActionInterest

    var body: some View {
        Label(status.title, systemImage: status.systemImage)
            .font(.caption.weight(.semibold))
            .foregroundStyle(status.color)
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(status.color.opacity(0.11), in: Capsule())
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityLabel(status.title)
    }

    private var status: (title: LocalizedStringKey, systemImage: String, color: Color) {
        if interest.isWithdrawn {
            return ("Withdrawn", "arrow.uturn.backward.circle", SideSeatTheme.textSecondary)
        }
        switch interest.coordinationState.uppercased() {
        case "WAITING":
            return ("Interested ✓", "checkmark.circle.fill", SideSeatTheme.accentText)
        case "INITIATING":
            return ("Starting chat", "ellipsis.message.fill", SideSeatTheme.accentText)
        case "OPEN":
            return ("Conversation started", "message.fill", SideSeatTheme.success)
        case "ENDED":
            return ("Ended", "checkmark.circle", SideSeatTheme.textSecondary)
        default:
            return ("Action ended", "clock.badge.checkmark", SideSeatTheme.textSecondary)
        }
    }
}

private struct DiscoverMyResponseDetailView: View {
    @Environment(SessionStore.self) private var session
    let interestID: String
    let store: DiscoverMyResponsesStore

    var body: some View {
        Group {
            if let interest = store.interest(id: interestID) {
                ScrollView {
                    VStack(alignment: .leading, spacing: SideSeatTheme.spaceLG) {
                        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                            DiscoverMyResponseStatus(interest: interest)
                            Text(interest.context.title ?? AppLocalization.string("Action unavailable"))
                                .font(.title2.weight(.bold))
                                .foregroundStyle(SideSeatTheme.textPrimary)
                                .multilineTextAlignment(.leading)
                        }

                        responseDetails(interest)

                        Text("This response stays here even if the original action is no longer shown in Discover.")
                            .font(.footnote)
                            .foregroundStyle(SideSeatTheme.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)

                        if interest.isWithdrawableBeforeConnect {
                            Button(role: .destructive) {
                                Task {
                                    await store.withdraw(interestID: interest.id, using: session)
                                }
                            } label: {
                                HStack(spacing: SideSeatTheme.spaceSM) {
                                    if store.isMutating(interestID: interest.id) {
                                        ProgressView()
                                            .controlSize(.small)
                                    } else {
                                        Image(systemName: "arrow.uturn.backward")
                                    }
                                    Text("Withdraw response")
                                        .multilineTextAlignment(.leading)
                                }
                                .frame(maxWidth: .infinity, minHeight: 48)
                            }
                            .buttonStyle(.bordered)
                            .buttonBorderShape(.roundedRectangle(radius: SideSeatTheme.controlRadius))
                            .disabled(store.isMutating(interestID: interest.id))
                            .accessibilityIdentifier("discover-my-response-detail-withdraw")
                        }
                    }
                    .padding(SideSeatTheme.screenHorizontal)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            } else {
                ContentUnavailableView(
                    "Response unavailable",
                    systemImage: "hand.raised.slash",
                    description: Text("Refresh My responses and try again.")
                )
            }
        }
        .background(SideSeatTheme.bgGrouped)
        .navigationTitle("Response details")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func responseDetails(_ interest: NativeCreatorGatedActionInterest) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            if interest.context.isTombstone {
                Label {
                    Text("Details are no longer available.")
                        .fixedSize(horizontal: false, vertical: true)
                } icon: {
                    Image(systemName: "eye.slash")
                }
            } else if let course = interest.context.course {
                Label {
                    Text(course.code.map { "\($0) · \(course.name)" } ?? course.name)
                        .fixedSize(horizontal: false, vertical: true)
                } icon: {
                    Image(systemName: "book.closed")
                }
            }
            if let date = interest.contextStartDate {
                Label(
                    date.formatted(date: .long, time: .shortened),
                    systemImage: "calendar"
                )
            }
            if let location = interest.context.location, !location.isEmpty {
                Label {
                    Text(location)
                        .fixedSize(horizontal: false, vertical: true)
                } icon: {
                    Image(systemName: "mappin.and.ellipse")
                }
            }
        }
        .font(.body)
        .foregroundStyle(SideSeatTheme.textPrimary)
        .padding(SideSeatTheme.spaceMD)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius))
        .accessibilityElement(children: .combine)
    }
}

struct ActionResponsesView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    @State private var store: ActionResponsesStore
    @State private var shellStore = CoordinationShellStore()
    @State private var filter: NativeActionResponsePresentationFilter = .visible
    let focusedInterestID: String?

    init(actionID: String?, focusedInterestID: String?) {
        _store = State(initialValue: ActionResponsesStore(actionID: actionID))
        self.focusedInterestID = focusedInterestID
    }

    var body: some View {
        ScrollViewReader { proxy in
            Group {
                if store.isLoading, !store.hasLoaded {
                    SSLoadingState("Loading responses")
                } else if store.groups.isEmpty {
                    ContentUnavailableView {
                        Label(filter == .visible ? "No responses" : "No hidden responses", systemImage: "person.2")
                    } description: {
                        Text(filter == .visible ? "New responses to your actions will appear here." : "Responses you hide can be restored here.")
                    }
                } else {
                    List {
                        ForEach(store.groups) { group in
                            Section {
                                ForEach(group.responses) { response in
                                    responseRow(response)
                                        .id(response.interestID)
                                }
                            } header: {
                                actionHeader(group)
                                    .task { await store.markSeen(groupID: group.id, using: session) }
                            } footer: {
                                paginationFooter(group)
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .task {
                await store.load(presentation: filter, using: session)
                if let focusedInterestID { proxy.scrollTo(focusedInterestID, anchor: .center) }
            }
            .onChange(of: filter) { _, next in
                Task { await store.load(presentation: next, using: session) }
            }
            .refreshable { await store.load(presentation: filter, using: session) }
            .alert("Responses unavailable", isPresented: Binding(
                get: { store.issue != nil },
                set: { if !$0 { dismissIssue() } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(store.issue ?? "")
            }
        }
        .background(SideSeatTheme.bgGrouped)
        .navigationTitle("People interested")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Picker("Response visibility", selection: $filter) {
                    Text("Visible").tag(NativeActionResponsePresentationFilter.visible)
                    Text("Hidden").tag(NativeActionResponsePresentationFilter.hidden)
                }
                .pickerStyle(.menu)
            }
        }
    }

    private func actionHeader(_ group: NativeActionResponseGroup) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(group.action.title)
                .font(.headline)
                .foregroundStyle(SideSeatTheme.textPrimary)
                .textCase(nil)
            Text("\(displayedCount(group)) people interested")
                .font(.caption)
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .textCase(nil)
        }
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func paginationFooter(_ group: NativeActionResponseGroup) -> some View {
        let isLastGroup = group.id == store.groups.last?.id
        if isLastGroup && store.canLoadMore {
            ProgressView()
                .frame(maxWidth: .infinity)
                .task {
                    await store.loadNextPageIfNeeded(after: group.id, using: session)
                    await store.markSeen(groupID: group.id, using: session)
                }
        }
    }

    private func displayedCount(_ group: NativeActionResponseGroup) -> Int {
        filter == .visible
            ? group.counts.visibleInterestCount
            : max(0, group.counts.totalActiveInterestCount - group.counts.visibleInterestCount)
    }

    private func dismissIssue() {
        store.clearIssue()
    }

    private func responseRow(_ response: NativeActionResponseItem) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
                AsyncImage(url: response.responder.avatarURL.flatMap(URL.init(string:))) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Image(systemName: "person.fill")
                        .foregroundStyle(SideSeatTheme.textSecondary)
                }
                .frame(width: 46, height: 46)
                .background(SideSeatTheme.fillSubtle, in: Circle())
                .clipShape(Circle())
                .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 5) {
                    HStack(spacing: 5) {
                        Text(response.responder.displayName)
                            .font(.body.weight(.semibold))
                        if response.responder.verifiedStudent {
                            Image(systemName: "checkmark.seal.fill")
                                .foregroundStyle(SideSeatTheme.accentText)
                                .accessibilityLabel("Verified student")
                        }
                    }
                    if let course = response.sharedCourse {
                        Label(course.code.map { "\($0) · \(course.name)" } ?? course.name, systemImage: "book.closed")
                    }
                    if !response.sharedLanguages.isEmpty {
                        Label(response.sharedLanguages.joined(separator: " · "), systemImage: "globe")
                    }
                }
                .font(.footnote)
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            ViewThatFits(in: .horizontal) {
                HStack(spacing: SideSeatTheme.spaceSM) { responseActions(response) }
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) { responseActions(response) }
            }
        }
        .padding(.vertical, SideSeatTheme.spaceXS)
        .accessibilityIdentifier("action-response-\(response.interestID)")
    }

    @ViewBuilder
    private func responseActions(_ response: NativeActionResponseItem) -> some View {
        Button("Start chatting") {
            Task {
                guard let reservation = await shellStore.reserve(
                    interestID: response.interestID,
                    using: session
                ) else { return }
                router.navigate(to: .coordinationShell(
                    interestID: response.interestID,
                    reservationID: reservation.id
                ))
            }
        }
            .buttonStyle(.borderedProminent)
            .disabled(!response.canStartCoordination || shellStore.isWorking)
            .accessibilityHint(response.canStartCoordination
                ? "Opens a private coordination draft"
                : "Starting coordination is currently unavailable")

        Text(response.canStartCoordination
            ? "Nothing is sent until you confirm a first message or plan."
            : "Starting a conversation is currently unavailable.")
            .font(.caption)
            .foregroundStyle(SideSeatTheme.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)

        Button(response.isHidden ? "Restore" : "Hide") {
            Task {
                await store.setPresentation(
                    interestID: response.interestID,
                    to: response.isHidden ? .visible : .hidden,
                    using: session
                )
            }
        }
        .buttonStyle(.bordered)
        .disabled(store.isMutating(interestID: response.interestID))
    }
}

struct CoordinationShellView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase

    let interestID: String
    let expectedReservationID: String?
    @State private var store = CoordinationShellStore()
    @State private var draft: NativeCoordinationShellDraft?
    @State private var didRequestRelease = false
    @State private var showPlanSheet = false

    var body: some View {
        Group {
            if let reservation = store.reservation, let draftBinding {
                ScrollView {
                    VStack(alignment: .leading, spacing: SideSeatTheme.spaceLG) {
                        sourcePreview(reservation)
                        messageDraft(draftBinding)
                        planDraft(draftBinding)
                        Label(
                            "This is a private draft. No conversation exists until a first message or plan is sent.",
                            systemImage: "lock.shield"
                        )
                        .font(.footnote)
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(SideSeatTheme.screenHorizontal)
                }
            } else if store.isWorking {
                SSLoadingState("Preparing coordination")
            } else {
                ContentUnavailableView {
                    Label("Coordination unavailable", systemImage: "person.crop.circle.badge.exclamationmark")
                } description: {
                    Text(store.issue ?? "Your response is safe. You can try again later.")
                } actions: {
                    if !store.isReadOnly {
                        Button("Try again") { Task { await prepare() } }
                    }
                }
            }
        }
        .background(SideSeatTheme.bgGrouped)
        .navigationTitle("Start chatting")
        .navigationBarBackButtonHidden(store.reservation != nil)
        .toolbar {
            if store.reservation != nil {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { Task { await releaseAndDismiss() } }
                        .disabled(store.isWorking)
                }
            }
        }
        .task(id: interestID) { await prepare() }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            while !Task.isCancelled, scenePhase == .active, store.reservation != nil {
                await store.heartbeatIfNeeded(using: session)
                try? await Task.sleep(for: .seconds(30))
            }
        }
        .alert("Coordination unavailable", isPresented: Binding(
            get: { store.issue != nil && store.reservation != nil },
            set: { if !$0 { store.clearIssue() } }
        )) { Button("OK", role: .cancel) {} } message: { Text(store.issue ?? "") }
        .sheet(isPresented: $showPlanSheet) {
            if let reservation = store.reservation {
                PlanCreateSheet(
                    target: .coordination(reservationID: reservation.id),
                    recipientName: nil,
                    draft: planDraft(for: reservation),
                    onAmbiguousFailure: { store.markActivationUncertain() }
                ) { result in
                    store.markActivationUncertain()
                    router.replaceTop(with: .directChat(
                        connectionID: result.connectionID,
                        focus: result.focus
                    ))
                }
            }
        }
    }

    private var draftBinding: Binding<NativeCoordinationShellDraft>? {
        guard draft != nil else { return nil }
        return Binding(get: { draft! }, set: { draft = $0 })
    }

    private func prepare() async {
        guard store.reservation == nil else { return }
        guard let reservation = await store.reserve(interestID: interestID, using: session) else { return }
        if let expectedReservationID, expectedReservationID != reservation.id {
            // The server may authoritatively advance an expired lease generation.
        }
        if draft == nil { draft = NativeCoordinationShellDraft(reservation: reservation) }
    }

    private func releaseAndDismiss() async {
        guard !didRequestRelease else { return }
        didRequestRelease = true
        if store.activationMayHaveSucceeded {
            dismiss()
            return
        }
        if await store.release(using: session) {
            dismiss()
        } else {
            didRequestRelease = false
        }
    }

    private func sourcePreview(_ reservation: NativeCoordinationShellReservation) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            Label("From this action", systemImage: "sparkles")
                .font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            Text(reservation.title).font(.headline)
            if let courseName = reservation.courseName { Label(courseName, systemImage: "book.closed") }
            if let location = reservation.location { Label(location, systemImage: "mappin.and.ellipse") }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(SideSeatTheme.spaceMD)
        .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: 12))
    }

    private func messageDraft(_ draft: Binding<NativeCoordinationShellDraft>) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            Text("First message").font(.headline)
            TextField("Write a message", text: draft.message, axis: .vertical)
                .lineLimit(3...7)
                .textFieldStyle(.roundedBorder)
            Button("Send message") {
                Task {
                    guard let activation = await store.activateMessage(draft.wrappedValue.message, using: session)
                    else { return }
                    router.replaceTop(with: .directChat(
                        connectionID: activation.connectionID,
                        focus: .actionContext(id: activation.contextID)
                    ))
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(draft.wrappedValue.message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.isWorking)
        }
    }

    private func planDraft(_ draft: Binding<NativeCoordinationShellDraft>) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            Text("Plan draft").font(.headline)
            Text(draft.wrappedValue.title).font(.body.weight(.semibold))
            if !draft.wrappedValue.location.isEmpty {
                Label(draft.wrappedValue.location, systemImage: "mappin.and.ellipse")
            }
            Text(draft.wrappedValue.start.formatted(date: .abbreviated, time: .shortened))
                .foregroundStyle(.secondary)
            Button("Review and send plan") { showPlanSheet = true }
                .buttonStyle(.borderedProminent)
                .disabled(store.isWorking)
        }
        .padding(SideSeatTheme.spaceMD)
        .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: 12))
    }

    private func planDraft(for reservation: NativeCoordinationShellReservation) -> NativePlanDraft {
        NativePlanDraft(
            title: reservation.planTitle,
            startTime: reservation.planStart?.formatted(.iso8601),
            endTime: reservation.planEnd?.formatted(.iso8601),
            location: reservation.planLocation,
            planType: reservation.planType,
            origin: NativePlanOriginReference(kind: "ACTION_INTEREST", id: reservation.interestID)
        )
    }
}

struct DiscoverBuddyDetailView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    let postID: String
    @State private var store = DiscoverPostDetailStore()
    @State private var openConversation = OpenConversationStore()
    @State private var sharePost: NativeDiscoverBuddyPost?
    @State private var editingPost: NativeDiscoverBuddyPost?
    @State private var reportPost: NativeDiscoverBuddyPost?
    @State private var questionDraft = ""
    @State private var isReplyComposerFocused = false
    @State private var isQuickCommentComposerExpanded = false
    @State private var selectedMediaIndex = 0
    @State private var isMediaPreviewPresented = false
    @State private var isBodyExpanded = false
    @State private var actionFeedbackTrigger = 0
    @State private var dismissCommentInputSignal = 0
    @State private var didReportOpportunityOpen = false
    @FocusState private var isQuickCommentComposerFocused: Bool

    var body: some View {
        Group {
            if let detail = store.detail {
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 0) {
                            media(detail.post)
                            planSummary(detail.post)
                            Divider()
                                .padding(.horizontal, SideSeatTheme.screenHorizontal)
                            questions(detail)
                                .id(DiscoverDetailAnchor.comments)
                            if !detail.post.isOwn {
                                reportPostFooter(detail.post)
                            }
                            if let issue = store.issue {
                                DiscoverInlineIssue(message: issue)
                                    .padding(.horizontal, SideSeatTheme.screenHorizontal)
                                    .padding(.bottom, SideSeatTheme.spaceMD)
                            }
                            if let issue = openConversation.issue {
                                DiscoverInlineIssue(message: issue)
                                    .padding(.horizontal, SideSeatTheme.screenHorizontal)
                                    .padding(.bottom, SideSeatTheme.spaceMD)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .scrollDismissesKeyboard(.interactively)
                    .refreshable { await load() }
                    .background(SideSeatTheme.bg)
                    .accessibilityIdentifier("discover-post-detail")
                    .safeAreaInset(edge: .bottom, spacing: 0) {
                        if !isReplyComposerFocused {
                            actionBar(detail) {
                                showComments(
                                    using: proxy,
                                    shouldFocus: !detail.post.isOwn && BuddyPostDisplay.status(detail.post).isOpen
                                )
                            }
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                        }
                    }
                    .animation(.easeOut(duration: 0.18), value: isReplyComposerFocused)
                }
                .toolbar {
                    ToolbarItem(placement: .principal) {
                        compactHostTitle(detail.post)
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            sharePost = detail.post
                        } label: {
                            Image(systemName: "square.and.arrow.up")
                                .foregroundStyle(SideSeatTheme.textPrimary)
                        }
                        .tint(SideSeatTheme.textPrimary)
                        .accessibilityLabel("Share buddy post")
                        .accessibilityIdentifier("discover-plan-share")
                    }
                }
                .sheet(item: $sharePost) { post in
                    DiscoverPlanSharePreview(post: post)
                }
                .sheet(item: $editingPost) { post in
                    NavigationStack {
                        DiscoverPlanCreateView(
                            editingPost: post,
                            onClose: {
                                await store.closePost(postID: post.id, using: session)
                            }
                        ) { _ in
                            editingPost = nil
                            await load()
                        }
                    }
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
                    .presentationCornerRadius(SideSeatTheme.cardRadius)
                    .presentationBackground(SideSeatTheme.bgGrouped)
                }
                .sheet(item: $reportPost) { post in
                    ChatReportSheet(title: AppLocalization.string( "Report post")) { reason, details in
                        await store.reportPost(post, reason: reason, details: details, using: session)
                    }
                }
                .fullScreenCover(isPresented: $isMediaPreviewPresented) {
                    DiscoverDetailMediaPreview(
                        sources: detail.post.imageUrls,
                        selectedIndex: $selectedMediaIndex
                    )
                }
            } else if let issue = store.issue {
                ContentUnavailableView {
                    Label("Buddy post unavailable", systemImage: "person.crop.circle.badge.exclamationmark")
                } description: {
                    Text(issue)
                } actions: {
                    Button("Try again") { Task { await load() } }
                        .buttonStyle(.borderedProminent)
                        .buttonBorderShape(.capsule)
                        .tint(SideSeatTheme.textPrimary)
                }
            } else {
                DiscoverBuddyDetailLoadingView()
            }
        }
        .navigationTitle("Buddy post")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(SideSeatTheme.bg, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .sensoryFeedback(.selection, trigger: actionFeedbackTrigger)
        .background {
            DiscoverTapOutsideInputObserver(
                isEnabled: isQuickCommentComposerExpanded || isReplyComposerFocused,
                onTapOutside: dismissCommentEditing
            )
        }
        .onChange(of: isQuickCommentComposerFocused) { wasFocused, isFocused in
            if wasFocused, !isFocused, isQuickCommentComposerExpanded {
                closeQuickCommentComposer()
            }
        }
        .task {
            await load()
            await reportOpportunityOpenIfNeeded()
        }
        .onReceive(NotificationCenter.default.publisher(for: .sideSeatDiscoverNeedsRefresh)) { _ in
            Task { await store.loadQuestions(postID: postID, using: session) }
        }
    }

    @ViewBuilder
    private func media(_ post: NativeDiscoverBuddyPost) -> some View {
        if !post.imageUrls.isEmpty {
            ZStack {
                TabView(selection: $selectedMediaIndex) {
                    ForEach(post.imageUrls.indices, id: \.self) { index in
                        DiscoverMediaImage(source: post.imageUrls[index])
                            .frame(maxWidth: .infinity)
                            .frame(height: 220)
                            .clipped()
                            .tag(index)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))

                if post.imageUrls.count > 1 {
                    VStack {
                        HStack {
                            Spacer()
                            Label(
                                "\(selectedMediaIndex + 1) / \(post.imageUrls.count)",
                                systemImage: "photo.on.rectangle"
                            )
                            .font(.caption2.weight(.semibold).monospacedDigit())
                            .foregroundStyle(.white)
                            .padding(.horizontal, 9)
                            .padding(.vertical, 6)
                            .background(.black.opacity(0.58), in: Capsule())
                            .accessibilityHidden(true)
                        }
                        Spacer()
                    }
                    .padding(SideSeatTheme.spaceMD)

                    if post.imageUrls.count <= 8 {
                        VStack {
                            Spacer()
                            HStack(spacing: 5) {
                                ForEach(post.imageUrls.indices, id: \.self) { index in
                                    Circle()
                                        .fill(
                                            index == selectedMediaIndex
                                                ? Color.white
                                                : Color.white.opacity(0.45)
                                        )
                                        .frame(width: 5, height: 5)
                                }
                            }
                            .padding(.horizontal, 8)
                            .padding(.vertical, 6)
                            .background(.black.opacity(0.3), in: Capsule())
                        }
                        .padding(.bottom, 10)
                        .accessibilityHidden(true)
                    }
                }
            }
            .frame(height: 220)
            .contentShape(Rectangle())
            .onTapGesture { isMediaPreviewPresented = true }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(
                post.imageUrls.count == 1
                    ? AppLocalization.string( "1 photo")
                    : AppLocalization.string( "\(post.imageUrls.count) photos")
            )
            .accessibilityHint("Opens the photo viewer")
            .accessibilityIdentifier("discover-plan-media")
        }
    }

    private func planSummary(_ post: NativeDiscoverBuddyPost) -> some View {
        let status = BuddyPostDisplay.status(post)

        return VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            HStack(spacing: 10) {
                DiscoverStatusBadge(status: status)

                ViewThatFits(in: .horizontal) {
                    Label(
                            BuddyPostDisplay.visibilityLabel(post.visibility),
                            systemImage: BuddyPostDisplay.visibilitySystemImage(post.visibility)
                        )
                    Image(systemName: BuddyPostDisplay.visibilitySystemImage(post.visibility))
                        .accessibilityLabel(BuddyPostDisplay.visibilityLabel(post.visibility))
                }
                    .font(.caption.weight(.medium))
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .lineLimit(1)

                Spacer(minLength: 0)

                Label(postCreatedLabel(post), systemImage: "clock")
                    .labelStyle(.titleOnly)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .lineLimit(1)
            }

            VStack(alignment: .leading, spacing: 10) {
                Text(post.title)
                    .font(.title2.weight(.bold))
                    .fixedSize(horizontal: false, vertical: true)

                if let body = post.body, !body.isEmpty {
                    Text(body)
                        .font(.body)
                        .lineSpacing(4)
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .lineLimit(isBodyExpanded ? nil : 5)
                        .fixedSize(horizontal: false, vertical: true)

                    if shouldOfferBodyExpansion(body) {
                        Button {
                            withAnimation(.easeInOut(duration: 0.2)) {
                                isBodyExpanded.toggle()
                            }
                        } label: {
                            Label(
                                isBodyExpanded ? "Show less" : "Show more",
                                systemImage: isBodyExpanded ? "chevron.up" : "chevron.down"
                            )
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                            .frame(minHeight: 44)
                        }
                        .buttonStyle(DiscoverDetailActionButtonStyle())
                        .accessibilityIdentifier("discover-post-body-toggle")
                    }
                }
                if !post.tags.isEmpty {
                    BuddyPostTagChips(tags: post.tags)
                }
            }

            compactPlanFacts(post)

            if post.isOwn, let entry = store.detail?.creatorResponseEntry {
                Button {
                    router.navigate(to: .actionResponses(
                        actionID: entry.focus.actionId,
                        interestID: entry.focus.interestId
                    ))
                } label: {
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: SideSeatTheme.spaceSM) {
                            Label("\(entry.counts.visibleInterestCount) people interested", systemImage: "person.2")
                            Spacer(minLength: SideSeatTheme.spaceSM)
                            Text("View responses")
                            Image(systemName: "chevron.right")
                        }
                        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                            Label("\(entry.counts.visibleInterestCount) people interested", systemImage: "person.2")
                            Label("View responses", systemImage: "arrow.right")
                        }
                    }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.accentText)
                    .padding(.horizontal, SideSeatTheme.spaceMD)
                    .padding(.vertical, SideSeatTheme.spaceSM)
                    .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                    .background(SideSeatTheme.accent.opacity(0.10), in: RoundedRectangle(cornerRadius: 12))
                    .fixedSize(horizontal: false, vertical: true)
                }
                .buttonStyle(SSPressButtonStyle())
                .accessibilityLabel("\(entry.counts.visibleInterestCount) people interested")
                .accessibilityHint("View responses")
                .accessibilityIdentifier("discover-action-responses-entry")
            }

            if !status.isOpen {
                Label("This buddy post is no longer active.", systemImage: status.systemImage)
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .padding(.horizontal, SideSeatTheme.spaceMD)
                    .frame(minHeight: 38)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(SideSeatTheme.fillSubtle, in: RoundedRectangle(cornerRadius: 10))
            }
        }
        .padding(.horizontal, SideSeatTheme.screenHorizontal)
        .padding(.top, SideSeatTheme.spaceLG)
        .padding(.bottom, SideSeatTheme.spaceMD)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func compactPlanFacts(_ post: NativeDiscoverBuddyPost) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            compactFactLine(
                systemImage: "calendar",
                value: scheduleLabel(post)
            )
            compactFactLine(
                systemImage: "mappin.and.ellipse",
                value: locationLabel(post)
            )

            ViewThatFits(in: .horizontal) {
                HStack(spacing: SideSeatTheme.spaceLG) {
                    secondaryFact(
                        systemImage: "person.2",
                        value: groupLabel(post),
                        accessibilityID: "discover-plan-group"
                    )
                    if let courseLabel = linkedCourseLabel(post) {
                        secondaryFact(systemImage: "book.closed", value: courseLabel)
                    }
                }
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                    secondaryFact(
                        systemImage: "person.2",
                        value: groupLabel(post),
                        accessibilityID: "discover-plan-group"
                    )
                    if let courseLabel = linkedCourseLabel(post) {
                        secondaryFact(systemImage: "book.closed", value: courseLabel)
                    }
                }
            }
        }
        .padding(SideSeatTheme.spaceMD)
        .background(
            SideSeatTheme.fillSubtle,
            in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
        )
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func compactFactLine(
        systemImage: String,
        value: String,
        accessibilityID: String? = nil
    ) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: systemImage)
                .font(.caption.weight(.semibold))
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .frame(width: 28, height: 28)
                .background(SideSeatTheme.fillTertiary, in: Circle())

            Text(value)
                .font(.subheadline.weight(.medium))
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 4)
                .ssAccessibilityIdentifier(accessibilityID)

            Spacer(minLength: 0)
        }
        .foregroundStyle(SideSeatTheme.textPrimary)
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    private func secondaryFact(
        systemImage: String,
        value: String,
        accessibilityID: String? = nil
    ) -> some View {
        Label {
            Text(value)
                .lineLimit(1)
                .ssAccessibilityIdentifier(accessibilityID)
        } icon: {
            Image(systemName: systemImage)
        }
        .font(.caption.weight(.medium))
        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
    }

    private func compactHostTitle(_ post: NativeDiscoverBuddyPost) -> some View {
        let author = post.author

        return Button {
            router.navigate(to: .profile(userID: author.id))
        } label: {
            HStack(spacing: 7) {
                InitialAvatar(name: author.displayName, url: author.avatarUrl, size: 30)
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 4) {
                        Text(author.displayName)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                        if author.verifiedStudent {
                            VerifiedSchoolMark(
                                school: author.school,
                                accessibilityID: "discover-plan-verified-host"
                            )
                        }
                        if post.isOwn {
                            Text("You")
                                .font(.caption2.weight(.medium))
                                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        }
                    }

                    Text(author.school ?? author.studentRoleLabel ?? AppLocalization.string( "International student"))
                        .font(.caption2)
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: 170, minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(SSPressButtonStyle())
        .accessibilityElement(children: .combine)
        .accessibilityHint("Opens this profile")
        .accessibilityIdentifier("discover-plan-host")
    }

    private func questions(_ detail: NativeDiscoverBuddyPostDetail) -> some View {
        DiscoverDiscussionSection(
            accessibilityID: "discover-comments-section",
            total: store.questionTotal,
            comments: store.questions,
            canComment: !detail.post.isOwn && BuddyPostDisplay.status(detail.post).isOpen,
            showsClosedState: !BuddyPostDisplay.status(detail.post).isOpen,
            closedMessage: detail.post.isOwn
                ? AppLocalization.string( "Comments from interested people will appear here.")
                : AppLocalization.string( "Comments are closed for this buddy post."),
            isLoading: store.isLoadingQuestions,
            isMutating: store.isMutatingQuestion,
            issue: store.questionIssue,
            onRefresh: {
                await store.loadQuestions(postID: postID, using: session)
            },
            onReply: { commentID, body in
                await store.submitQuestion(
                    body: body,
                    parentID: commentID,
                    postID: postID,
                    using: session
                )
            },
            onDelete: { commentID in
                await store.deleteQuestionComment(
                    commentID: commentID,
                    postID: postID,
                    using: session
                )
            },
            onReport: { target, reason, details in
                await store.reportQuestionComment(
                    commentID: target.id,
                    authorID: target.authorID,
                    isOwn: target.isOwn,
                    reason: reason,
                    details: details,
                    using: session
                )
            },
            dismissInputSignal: dismissCommentInputSignal,
            onFocusChange: { isReplyComposerFocused = $0 }
        )
    }

    private func reportPostFooter(_ post: NativeDiscoverBuddyPost) -> some View {
        Button {
            reportPost = post
        } label: {
            Label("Report this post", systemImage: "flag")
                .font(.footnote.weight(.medium))
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .frame(minHeight: 44)
        }
        .buttonStyle(SSPressButtonStyle())
        .frame(maxWidth: .infinity)
        .padding(.horizontal, SideSeatTheme.screenHorizontal)
        .padding(.vertical, SideSeatTheme.spaceSM)
        .accessibilityIdentifier("discover-plan-report")
    }

    private func submitQuestion() {
        let body = questionDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return }
        Task {
            if await store.submitQuestion(body: body, postID: postID, using: session) {
                questionDraft = ""
                closeQuickCommentComposer()
            }
        }
    }

    @ViewBuilder
    private func actionBar(
        _ detail: NativeDiscoverBuddyPostDetail,
        onComments: @escaping () -> Void
    ) -> some View {
        let isOpen = BuddyPostDisplay.status(detail.post).isOpen
        let canComment = !detail.post.isOwn && isOpen
        let hasSafeDrain = detail.creatorGatedInterest?.isWithdrawableBeforeConnect == true

        VStack(spacing: 0) {
            Divider()
            Group {
                if canComment, isQuickCommentComposerExpanded {
                    DiscoverQuickCommentComposer(
                        draft: $questionDraft,
                        isFocused: $isQuickCommentComposerFocused,
                        isSubmitting: store.isMutatingQuestion,
                        onSubmit: submitQuestion,
                        onCancel: closeQuickCommentComposer
                    )
                } else {
                    VStack(alignment: .trailing, spacing: 6) {
                        if !detail.post.isOwn, isOpen || hasSafeDrain {
                            ViewThatFits(in: .horizontal) {
                                HStack(spacing: SideSeatTheme.spaceSM) {
                                    postCommentAction(canComment: canComment, onComments: onComments)
                                    if isOpen {
                                        postSaveAction(detail.post)
                                    }
                                    postPrimaryAction(detail, expands: false)
                                }
                                .fixedSize(horizontal: true, vertical: false)

                                VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                                    HStack(spacing: SideSeatTheme.spaceSM) {
                                        postCommentAction(
                                            canComment: canComment,
                                            expands: true,
                                            onComments: onComments
                                        )
                                        if isOpen {
                                            postSaveAction(detail.post)
                                        }
                                    }
                                    postPrimaryAction(detail, expands: true)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        } else {
                            HStack(spacing: SideSeatTheme.spaceSM) {
                                postCommentAction(
                                    canComment: canComment,
                                    expands: true,
                                    onComments: onComments
                                )

                                if detail.post.isOwn {
                                    Button {
                                        editingPost = detail.post
                                    } label: {
                                        ViewThatFits(in: .horizontal) {
                                            Label("Edit buddy post", systemImage: "pencil")
                                                .padding(.horizontal, 14)
                                                .frame(height: 44)
                                                .background(SideSeatTheme.accent, in: Capsule())

                                            Image(systemName: "pencil")
                                                .frame(width: 44, height: 44)
                                                .background(SideSeatTheme.accent, in: Circle())
                                        }
                                        .font(.body.weight(.semibold))
                                        .foregroundStyle(SideSeatTheme.onAccent)
                                    }
                                    .buttonStyle(DiscoverDetailActionButtonStyle())
                                    .disabled(store.isMutating || !canEdit(detail.post))
                                    .accessibilityLabel("Edit buddy post")
                                    .accessibilityIdentifier("discover-post-edit-primary")
                                }
                            }
                        }

                        if detail.primaryAction == .waiting,
                           detail.creatorGatedInterest?.isWithdrawableBeforeConnect == true {
                            waitingInterestStatus
                        }
                    }
                }
            }
            .padding(.horizontal, SideSeatTheme.spaceLG)
            .padding(.vertical, SideSeatTheme.spaceSM)
        }
        .background(.bar)
    }

    private func postCommentAction(
        canComment: Bool,
        expands: Bool = false,
        onComments: @escaping () -> Void
    ) -> some View {
        Button(action: onComments) {
            DiscoverCommentShortcutLabel(
                count: store.questionTotal,
                canWrite: canComment,
                controlHeight: 44,
                expands: expands
            )
        }
        .buttonStyle(DiscoverDetailActionButtonStyle())
        .layoutPriority(1)
        .accessibilityLabel(canComment ? "Write a comment" : "Comments")
        .accessibilityHint(
            canComment
                ? "Opens the comment field on this page"
                : "Moves to the comments on this page"
        )
        .accessibilityIdentifier("discover-post-comments")
    }

    private func postSaveAction(_ post: NativeDiscoverBuddyPost) -> some View {
        Button {
            toggleSaved(post)
        } label: {
            Image(systemName: post.savedByViewer ? "heart.fill" : "heart")
                .font(.body.weight(.semibold))
                .frame(width: 44, height: 44)
                .background(
                    post.savedByViewer
                        ? SideSeatTheme.accent.opacity(0.12)
                        : SideSeatTheme.fillTertiary,
                    in: Circle()
                )
        }
        .buttonStyle(DiscoverDetailActionButtonStyle())
        .foregroundStyle(post.savedByViewer ? SideSeatTheme.accentText : SideSeatTheme.textPrimary)
        .disabled(store.isMutating)
        .accessibilityLabel(post.savedByViewer ? "Saved" : "Save")
        .accessibilityIdentifier("discover-post-save")
    }

    private func postPrimaryAction(
        _ detail: NativeDiscoverBuddyPostDetail,
        expands: Bool
    ) -> some View {
        Button {
            Task { await performPrimaryAction(for: detail) }
        } label: {
            HStack(spacing: 6) {
                primaryActionIcon(for: detail)
                Text(primaryActionTitle(for: detail))
                    .lineLimit(expands ? nil : 1)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: !expands, vertical: true)
            }
            .padding(.horizontal, 14)
            .frame(
                minWidth: expands ? nil : 96,
                maxWidth: expands ? .infinity : nil,
                minHeight: 44
            )
            .background(primaryActionBackground(for: detail), in: Capsule())
        }
        .font(.body.weight(.semibold))
        .foregroundStyle(primaryActionForeground(for: detail))
        .buttonStyle(DiscoverDetailActionButtonStyle())
        .layoutPriority(2)
        .disabled(primaryActionDisabled(for: detail))
        .accessibilityLabel(primaryActionTitle(for: detail))
        .accessibilityIdentifier(primaryActionIdentifier(for: detail))
    }

    @ViewBuilder
    private var waitingInterestStatus: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: SideSeatTheme.spaceSM) {
                Text("Waiting for the host to start chatting")
                    .font(.caption)
                    .foregroundStyle(SideSeatTheme.textSecondary)
                    .fixedSize(horizontal: true, vertical: false)

                Button {
                    Task {
                        await store.withdrawInterest(postID: postID, using: session)
                    }
                } label: {
                    Text("Withdraw response")
                        .font(.caption.weight(.semibold))
                        .fixedSize(horizontal: true, vertical: false)
                        .frame(minHeight: 44)
                }
                .foregroundStyle(SideSeatTheme.accentText)
                .disabled(store.isMutating)
                .accessibilityIdentifier("discover-post-interest-withdraw")
            }

            VStack(alignment: .leading, spacing: 2) {
                Text("Waiting for the host to start chatting")
                    .font(.caption)
                    .foregroundStyle(SideSeatTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)

                Button {
                    Task {
                        await store.withdrawInterest(postID: postID, using: session)
                    }
                } label: {
                    Text("Withdraw response")
                        .font(.caption.weight(.semibold))
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                }
                .foregroundStyle(SideSeatTheme.accentText)
                .disabled(store.isMutating)
                .accessibilityIdentifier("discover-post-interest-withdraw")
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
    }

    private func toggleSaved(_ post: NativeDiscoverBuddyPost) {
        actionFeedbackTrigger += 1
        Task {
            await store.setSaved(
                !post.savedByViewer,
                postID: postID,
                using: session
            )
        }
    }

    private func scheduleLabel(_ post: NativeDiscoverBuddyPost) -> String {
        guard let start = post.startDate else {
            return AppLocalization.string( "Time to be decided")
        }
        let startLabel = start.formatted(date: .abbreviated, time: .shortened)
        guard let end = post.endDate else { return startLabel }
        return "\(startLabel) - \(end.formatted(date: .omitted, time: .shortened))"
    }

    private func locationLabel(_ post: NativeDiscoverBuddyPost) -> String {
        guard let location = post.location, !location.isEmpty else {
            return "\(post.city) · \(AppLocalization.string( "Place to be decided"))"
        }
        return "\(location), \(post.city)"
    }

    private func postCreatedLabel(_ post: NativeDiscoverBuddyPost) -> String {
        guard let createdDate = try? Date(post.createdAt, strategy: .iso8601) else {
            return post.city
        }
        return min(createdDate, Date()).formatted(.relative(presentation: .named))
    }

    private func groupLabel(_ post: NativeDiscoverBuddyPost) -> String {
        if let capacity = post.capacity {
            return AppLocalization.string( "\(post.interestedCount) interested, up to \(capacity) people")
        }
        return AppLocalization.string( "\(post.interestedCount) interested")
    }

    private func linkedCourseLabel(_ post: NativeDiscoverBuddyPost) -> String? {
        guard let course = post.linkedCourses.first else { return nil }
        let base = [course.code, course.name]
            .compactMap { value in
                guard let value, !value.isEmpty else { return nil }
                return value
            }
            .joined(separator: " ")
        guard !base.isEmpty else { return nil }
        guard post.linkedCourses.count > 1 else { return base }
        return "\(base) +\(post.linkedCourses.count - 1)"
    }

    private func shouldOfferBodyExpansion(_ body: String) -> Bool {
        body.count > 220 || body.filter(\.isNewline).count >= 4
    }

    private func showComments(using proxy: ScrollViewProxy, shouldFocus: Bool) {
        withAnimation(.easeInOut(duration: 0.28)) {
            proxy.scrollTo(DiscoverDetailAnchor.comments, anchor: .top)
        }

        guard shouldFocus else { return }

        withAnimation(.easeOut(duration: 0.18)) {
            isQuickCommentComposerExpanded = true
        }
        Task { @MainActor in
            await Task.yield()
            try? await Task.sleep(for: .milliseconds(140))
            isQuickCommentComposerFocused = true
            try? await Task.sleep(for: .milliseconds(280))
            withAnimation(.easeOut(duration: 0.18)) {
                proxy.scrollTo(DiscoverDetailAnchor.comments, anchor: .top)
            }
        }
    }

    private func closeQuickCommentComposer() {
        isQuickCommentComposerFocused = false
        withAnimation(.easeOut(duration: 0.18)) {
            isQuickCommentComposerExpanded = false
        }
    }

    private func dismissCommentEditing() {
        guard isQuickCommentComposerExpanded || isReplyComposerFocused else { return }
        dismissCommentInputSignal += 1
        closeQuickCommentComposer()
    }

    private func load() async {
        await store.load(postID: postID, using: session)
    }

    private func reportOpportunityOpenIfNeeded() async {
        guard !didReportOpportunityOpen,
              let post = store.detail?.post,
              !post.isOwn
        else { return }
        didReportOpportunityOpen = true
        let isCourseAction = post.category.uppercased() == "SHARED_COURSES"
            || post.visibility.uppercased() == "COURSEMATES_ONLY"
            || !post.linkedCourses.isEmpty
        await ProductFunnelReporter.record(
            name: "OPPORTUNITY_OPEN",
            surface: "ACTION_DETAIL",
            sourceKind: isCourseAction ? "COURSE_ACTION" : "BUDDY_POST",
            sourceID: post.id,
            using: session
        )
    }

    private func canEdit(_ post: NativeDiscoverBuddyPost) -> Bool {
        post.isOwn && BuddyPostDisplay.status(post).isOpen
    }

    private func primaryActionTitle(for detail: NativeDiscoverBuddyPostDetail) -> String {
        switch detail.primaryAction {
        case .contactAuthor:
            return AppLocalization.string("Contact author")
        case .expressInterest:
            return AppLocalization.string(detail.post.isCourseLinkedAction ? "I want to join" : "Join")
        case .reactivateInterest:
            return AppLocalization.string("Respond again")
        case .waiting:
            return AppLocalization.string("Interested ✓")
        case .readOnly:
            return AppLocalization.string("Temporarily unavailable")
        }
    }

    private func performPrimaryAction(for detail: NativeDiscoverBuddyPostDetail) async {
        switch detail.primaryAction {
        case .contactAuthor:
            await openChat(peerID: detail.post.author.id)
        case .expressInterest, .reactivateInterest:
            await store.expressInterest(postID: postID, using: session)
        case .waiting, .readOnly:
            break
        }
    }

    @ViewBuilder
    private func primaryActionIcon(for detail: NativeDiscoverBuddyPostDetail) -> some View {
        if openConversation.isOpening || store.isMutating {
            ProgressView()
                .tint(primaryActionForeground(for: detail))
        } else {
            Image(systemName: primaryActionSystemImage(for: detail))
        }
    }

    private func primaryActionSystemImage(for detail: NativeDiscoverBuddyPostDetail) -> String {
        switch detail.primaryAction {
        case .contactAuthor:
            return "message.fill"
        case .expressInterest:
            return "person.crop.circle.badge.plus"
        case .reactivateInterest:
            return "arrow.counterclockwise"
        case .waiting:
            return "checkmark"
        case .readOnly:
            return "lock.fill"
        }
    }

    private func primaryActionBackground(for detail: NativeDiscoverBuddyPostDetail) -> Color {
        switch detail.primaryAction {
        case .contactAuthor, .expressInterest, .reactivateInterest:
            return SideSeatTheme.accent
        case .waiting, .readOnly:
            return SideSeatTheme.fillTertiary
        }
    }

    private func primaryActionForeground(for detail: NativeDiscoverBuddyPostDetail) -> Color {
        switch detail.primaryAction {
        case .contactAuthor, .expressInterest, .reactivateInterest:
            return SideSeatTheme.onAccent
        case .waiting, .readOnly:
            return SideSeatTheme.textSecondary
        }
    }

    private func primaryActionDisabled(for detail: NativeDiscoverBuddyPostDetail) -> Bool {
        openConversation.isOpening
            || store.isMutating
            || detail.primaryAction == .waiting
            || detail.primaryAction == .readOnly
    }

    private func primaryActionIdentifier(for detail: NativeDiscoverBuddyPostDetail) -> String {
        switch detail.primaryAction {
        case .contactAuthor:
            return "discover-post-message"
        case .expressInterest, .reactivateInterest, .waiting:
            return "discover-post-interest"
        case .readOnly:
            return "discover-post-read-only"
        }
    }

    private func openChat(peerID: String) async {
        guard let connectionID = await openConversation.open(
            peerID: peerID,
            postID: postID,
            using: session
        ) else {
            return
        }
        router.navigate(to: .directChat(connectionID: connectionID))
    }

}

private struct DiscoverQuestionReportTarget: Identifiable {
    let id: String
    let authorID: String
    let isOwn: Bool
}

private struct DiscoverQuestionDeleteTarget: Identifiable {
    let id: String
    let kind: String
}

private struct DiscoverPlanDetailRow: View {
    let systemImage: String
    let title: LocalizedStringKey
    let value: String
    var accessibilityID: String? = nil

    var body: some View {
        HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
            Image(systemName: systemImage)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .frame(width: 32, height: 32)
                .background(
                    SideSeatTheme.fillTertiary,
                    in: RoundedRectangle(cornerRadius: 8, style: .continuous)
                )

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(value)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
                    .ssAccessibilityIdentifier(accessibilityID)
            }
            .padding(.top, 1)

            Spacer(minLength: 0)
        }
        .padding(.vertical, SideSeatTheme.spaceSM)
    }
}

private struct BuddyPostTagChips: View {
    let tags: [String]

    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 7) {
                ForEach(Array(tags.prefix(8).enumerated()), id: \.offset) { _, tag in
                    Text("#\(tag)")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .padding(.horizontal, 9)
                        .frame(height: 28)
                        .background(SideSeatTheme.fillTertiary, in: Capsule())
                }
            }
        }
        .scrollIndicators(.hidden)
        .contentMargins(.horizontal, 0, for: .scrollContent)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(tags.prefix(8).joined(separator: ", "))
    }
}

private struct DiscoverDetailMediaPreview: View {
    @Environment(\.dismiss) private var dismiss
    let sources: [String]
    @Binding var selectedIndex: Int

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            TabView(selection: $selectedIndex) {
                ForEach(sources.indices, id: \.self) { index in
                    DiscoverZoomableMedia(
                        source: sources[index],
                        isActive: selectedIndex == index,
                        onDismiss: { dismiss() }
                    )
                        .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .background(Color.black)
            .accessibilityIdentifier("discover-media-preview")

            VStack {
                HStack {
                    Spacer()
                    Button { dismiss() } label: {
                        Image(systemName: "xmark")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(.white)
                            .frame(width: 44, height: 44)
                            .background(.black.opacity(0.55), in: Circle())
                    }
                    .accessibilityLabel("Close photo viewer")
                    .accessibilityIdentifier("discover-media-preview-close")
                }

                Spacer()

                if sources.count > 1 {
                    Text("\(selectedIndex + 1) / \(sources.count)")
                        .font(.caption.weight(.semibold).monospacedDigit())
                        .foregroundStyle(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(.black.opacity(0.55), in: Capsule())
                        .accessibilityLabel("Photo \(selectedIndex + 1) of \(sources.count)")
                        .accessibilityValue("\(selectedIndex + 1) / \(sources.count)")
                        .accessibilityIdentifier("discover-media-preview-page")
                }
            }
            .padding(SideSeatTheme.spaceLG)
        }
        .statusBarHidden()
        .task(id: selectedIndex) {
            await DiscoverMediaPrefetcher.shared.prefetch(
                adjacentSources(from: selectedIndex)
            )
        }
    }

    private func adjacentSources(from index: Int) -> [String] {
        [index + 1, index - 1]
            .filter { sources.indices.contains($0) }
            .map { sources[$0] }
    }
}

private actor DiscoverMediaPrefetcher {
    static let shared = DiscoverMediaPrefetcher()

    private var completed = Set<URL>()

    func prefetch(_ sources: [String]) async {
        for source in sources {
            guard
                let url = URL(string: source),
                let scheme = url.scheme?.lowercased(),
                scheme == "https" || scheme == "http",
                !completed.contains(url)
            else { continue }

            let request = URLRequest(
                url: url,
                cachePolicy: .returnCacheDataElseLoad,
                timeoutInterval: 20
            )
            if URLCache.shared.cachedResponse(for: request) != nil {
                completed.insert(url)
                continue
            }

            do {
                let (data, response) = try await URLSession.shared.data(for: request)
                guard
                    !data.isEmpty,
                    (response as? HTTPURLResponse).map({ 200..<300 ~= $0.statusCode }) != false
                else { continue }

                URLCache.shared.storeCachedResponse(
                    CachedURLResponse(response: response, data: data),
                    for: request
                )
                completed.insert(url)
            } catch {
                // The visible image loader keeps its retry/error state; prefetch is best effort.
            }
        }
    }
}

private struct DiscoverInlineIssue: View {
    let message: String

    var body: some View {
        HStack(alignment: .top, spacing: SideSeatTheme.spaceSM) {
            Image(systemName: "exclamationmark.circle.fill")
                .foregroundStyle(SideSeatTheme.danger)
            Text(message)
                .font(.footnote)
                .foregroundStyle(SideSeatTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(SideSeatTheme.spaceMD)
        .background(SideSeatTheme.danger.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
    }
}

private struct DiscoverBuddyDetailLoadingView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Rectangle()
                    .fill(SideSeatTheme.fillSubtle)
                    .frame(height: 220)

                VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                    HStack(spacing: SideSeatTheme.spaceSM) {
                        Capsule().frame(width: 68, height: 24)
                        Capsule().frame(width: 88, height: 18)
                        Spacer()
                        Capsule().frame(width: 48, height: 14)
                    }
                    RoundedRectangle(cornerRadius: 5).frame(height: 25)
                    RoundedRectangle(cornerRadius: 4).frame(height: 16)
                    RoundedRectangle(cornerRadius: 4).frame(width: 240, height: 16)
                    RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius)
                        .frame(height: 118)
                }
                .foregroundStyle(SideSeatTheme.fillTertiary)
                .padding(SideSeatTheme.screenHorizontal)

                Divider()

                VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                    RoundedRectangle(cornerRadius: 4).frame(width: 110, height: 19)
                    HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
                        Circle().frame(width: 36, height: 36)
                        VStack(alignment: .leading, spacing: 7) {
                            RoundedRectangle(cornerRadius: 4).frame(width: 95, height: 14)
                            RoundedRectangle(cornerRadius: 4).frame(height: 14)
                            RoundedRectangle(cornerRadius: 4).frame(width: 180, height: 14)
                        }
                    }
                }
                .foregroundStyle(SideSeatTheme.fillTertiary)
                .padding(SideSeatTheme.screenHorizontal)
            }
        }
        .background(SideSeatTheme.bg)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Loading buddy post")
        .accessibilityIdentifier("discover-buddy-detail-loading")
    }
}

private struct DiscoverZoomableMedia: View {
    let source: String
    let isActive: Bool
    let onDismiss: () -> Void
    @State private var scale: CGFloat = 1
    @State private var settledScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var settledOffset: CGSize = .zero

    var body: some View {
        ZStack {
            Color.black
            DiscoverMediaImage(
                source: source,
                contentMode: .fit,
                placeholderBackground: .black,
                placeholderForeground: .white.opacity(0.72)
            )
        }
            .scaleEffect(scale)
            .offset(offset)
            .contentShape(Rectangle())
            .simultaneousGesture(zoomGesture)
            .gesture(
                panGesture,
                including: scale > 1.001 ? .gesture : .none
            )
            .highPriorityGesture(photoTapGesture)
            .onChange(of: isActive) { _, isActive in
                if !isActive { resetTransform() }
            }
            .accessibilityLabel("Post photo")
            .accessibilityHint("Pinch or double tap to zoom")
    }

    private var zoomGesture: some Gesture {
        MagnifyGesture()
            .onChanged { value in
                scale = min(max(settledScale * value.magnification, 1), 4)
                if scale == 1 { offset = .zero }
            }
            .onEnded { _ in
                settledScale = scale
                if scale <= 1 { resetTransform() }
            }
    }

    private var photoTapGesture: some Gesture {
        TapGesture(count: 2)
            .exclusively(before: TapGesture(count: 1))
            .onEnded { result in
                switch result {
                case .first:
                    withAnimation(.snappy(duration: 0.22)) {
                        if scale > 1 {
                            resetTransform()
                        } else {
                            scale = 2
                            settledScale = 2
                        }
                    }
                case .second:
                    onDismiss()
                }
            }
    }

    private var panGesture: some Gesture {
        DragGesture(minimumDistance: 8)
            .onChanged { value in
                guard scale > 1 else { return }
                offset = CGSize(
                    width: settledOffset.width + value.translation.width,
                    height: settledOffset.height + value.translation.height
                )
            }
            .onEnded { _ in
                guard scale > 1 else {
                    resetTransform()
                    return
                }
                settledOffset = offset
            }
    }

    private func resetTransform() {
        scale = 1
        settledScale = 1
        offset = .zero
        settledOffset = .zero
    }
}

struct DiscoverActivityDetailView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    let activityID: String
    @State private var store = DiscoverActivityDetailStore()
    @State private var openConversation = OpenConversationStore()
    @State private var showsCancelSignupConfirmation = false
    @State private var showsCloseConfirmation = false
    @State private var showsCancelActivityConfirmation = false
    @State private var activityMessageDraft = ""
    @State private var isReplyComposerFocused = false
    @State private var isQuickCommentComposerExpanded = false
    @State private var dismissCommentInputSignal = 0
    @FocusState private var isQuickCommentComposerFocused: Bool

    var body: some View {
        Group {
            if let detail = store.detail {
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 0) {
                            activitySummary(detail.activity)

                            Divider()
                                .padding(.horizontal, SideSeatTheme.screenHorizontal)

                            activityDetails(detail.activity)

                            Divider()
                                .padding(.horizontal, SideSeatTheme.screenHorizontal)

                            attendees(detail.goingAttendees, activity: detail.activity)

                            Divider()
                                .padding(.horizontal, SideSeatTheme.screenHorizontal)

                            activityMessages(detail)
                                .id(DiscoverDetailAnchor.comments)

                            if let issue = store.issue {
                                DiscoverInlineIssue(message: issue)
                                    .padding(.horizontal, SideSeatTheme.screenHorizontal)
                                    .padding(.bottom, SideSeatTheme.spaceMD)
                            }
                            if let issue = openConversation.issue {
                                DiscoverInlineIssue(message: issue)
                                    .padding(.horizontal, SideSeatTheme.screenHorizontal)
                                    .padding(.bottom, SideSeatTheme.spaceMD)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .scrollDismissesKeyboard(.interactively)
                    .refreshable { await load() }
                    .background(SideSeatTheme.bg)
                    .accessibilityIdentifier("discover-activity-detail")
                    .safeAreaInset(edge: .bottom, spacing: 0) {
                        if !detail.activity.isOrganizer, !isReplyComposerFocused {
                            activityActionBar(detail) {
                                showComments(using: proxy, shouldFocus: canLeaveMessage(detail.activity))
                            }
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                        }
                    }
                    .animation(.easeOut(duration: 0.18), value: isReplyComposerFocused)
                }
                .toolbar {
                    ToolbarItem(placement: .principal) {
                        compactOrganizerTitle(detail.activity)
                    }
                    ToolbarItemGroup(placement: .topBarTrailing) {
                        ShareLink(item: activityShareURL(detail.activity)) {
                            Image(systemName: "square.and.arrow.up")
                                .foregroundStyle(SideSeatTheme.textPrimary)
                        }
                        .tint(SideSeatTheme.textPrimary)
                        .accessibilityLabel("Share activity")
                        .accessibilityIdentifier("discover-activity-share")

                        if detail.activity.isOrganizer {
                            activityMenu(detail)
                        }
                    }
                }
                .ssActionPrompt(
                    isPresented: $showsCancelSignupConfirmation,
                    title: AppLocalization.string("Cancel your signup?"),
                    systemImage: "person.badge.minus",
                    tint: SideSeatTheme.danger,
                    dismissOnTapOutside: true,
                    onDismiss: { showsCancelSignupConfirmation = false },
                    accessibilityIdentifier: "discover-activity-cancel-signup-prompt"
                ) {
                    [
                        SSActionPromptAction(
                            id: "discover-activity-keep-signup",
                            title: AppLocalization.string("Keep signup"),
                            role: .cancel,
                            perform: {}
                        ),
                        SSActionPromptAction(
                            id: "discover-activity-cancel-signup-confirm",
                            title: AppLocalization.string("Cancel signup"),
                            systemImage: "person.badge.minus",
                            role: .destructive,
                            perform: {
                                Task {
                                    await store.setSignup(false, activityID: activityID, using: session)
                                }
                            }
                        ),
                    ]
                }
                .ssActionPrompt(
                    isPresented: $showsCloseConfirmation,
                    title: AppLocalization.string("Close sign-ups?"),
                    systemImage: "lock.fill",
                    tint: SideSeatTheme.danger,
                    dismissOnTapOutside: true,
                    onDismiss: { showsCloseConfirmation = false },
                    accessibilityIdentifier: "discover-activity-close-signups-prompt"
                ) {
                    [
                        SSActionPromptAction(
                            id: "discover-activity-close-signups-cancel",
                            title: AppLocalization.string("Cancel"),
                            role: .cancel,
                            perform: {}
                        ),
                        SSActionPromptAction(
                            id: "discover-activity-close-signups-confirm",
                            title: AppLocalization.string("Close sign-ups"),
                            systemImage: "lock",
                            role: .destructive,
                            perform: {
                                Task {
                                    await store.setStatus("CLOSED", activityID: activityID, using: session)
                                }
                            }
                        ),
                    ]
                }
                .ssActionPrompt(
                    isPresented: $showsCancelActivityConfirmation,
                    title: AppLocalization.string("Cancel this activity?"),
                    systemImage: "calendar.badge.exclamationmark",
                    tint: SideSeatTheme.danger,
                    dismissOnTapOutside: true,
                    onDismiss: { showsCancelActivityConfirmation = false },
                    accessibilityIdentifier: "discover-activity-cancel-prompt"
                ) {
                    [
                        SSActionPromptAction(
                            id: "discover-activity-cancel-dismiss",
                            title: AppLocalization.string("Keep activity"),
                            role: .cancel,
                            perform: {}
                        ),
                        SSActionPromptAction(
                            id: "discover-activity-cancel-confirm",
                            title: AppLocalization.string("Cancel activity"),
                            systemImage: "xmark.circle",
                            role: .destructive,
                            perform: {
                                Task {
                                    await store.setStatus("CANCELED", activityID: activityID, using: session)
                                }
                            }
                        ),
                    ]
                }
            } else if let issue = store.issue {
                ContentUnavailableView {
                    Label("Activity unavailable", systemImage: "calendar.badge.exclamationmark")
                } description: {
                    Text(issue)
                } actions: {
                    Button("Try again") { Task { await load() } }
                        .buttonStyle(.borderedProminent)
                        .buttonBorderShape(.capsule)
                        .tint(SideSeatTheme.textPrimary)
                }
            } else {
                SSLoadingState("Loading activity")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle("Activity")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(SideSeatTheme.bg, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .background {
            DiscoverTapOutsideInputObserver(
                isEnabled: isQuickCommentComposerExpanded || isReplyComposerFocused,
                onTapOutside: dismissCommentEditing
            )
        }
        .onChange(of: isQuickCommentComposerFocused) { wasFocused, isFocused in
            if wasFocused, !isFocused, isQuickCommentComposerExpanded {
                closeQuickCommentComposer()
            }
        }
        .task { await load() }
        .onReceive(NotificationCenter.default.publisher(for: .sideSeatDiscoverNeedsRefresh)) { _ in
            Task { await store.loadMessages(activityID: activityID, using: session) }
        }
    }

    private func activitySummary(_ activity: NativeDiscoverActivity) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            HStack(spacing: SideSeatTheme.spaceSM) {
                DiscoverStatusBadge(status: DiscoverActivityDisplay.status(activity))
                Spacer(minLength: 0)
                Text(activity.city)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
            }

            VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                Text(activity.title)
                    .font(.title2.weight(.bold))
                    .fixedSize(horizontal: false, vertical: true)

                if let description = activity.description, !description.isEmpty {
                    Text(description)
                        .font(.body)
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(.horizontal, SideSeatTheme.screenHorizontal)
        .padding(.vertical, SideSeatTheme.spaceLG)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func compactOrganizerTitle(_ activity: NativeDiscoverActivity) -> some View {
        Button {
            router.navigate(to: .profile(userID: activity.organizer.id))
        } label: {
            HStack(spacing: 7) {
                InitialAvatar(
                    name: activity.organizer.displayName,
                    url: activity.organizer.avatarUrl,
                    size: 28
                )
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 4) {
                        Text(activity.organizer.displayName)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                        if activity.organizer.verifiedStudent {
                            VerifiedSchoolMark(
                                school: activity.school,
                                accessibilityID: "discover-activity-organizer-verified"
                            )
                        }
                    }
                    Text("\(AppLocalization.string( "Organizer")) · \(activity.school)")
                        .font(.caption2)
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: 190)
            .contentShape(Rectangle())
        }
        .buttonStyle(DiscoverDetailActionButtonStyle())
        .accessibilityIdentifier("discover-activity-organizer")
    }

    private func activityDetails(_ activity: NativeDiscoverActivity) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Activity details")
                .font(.headline)
                .padding(.bottom, SideSeatTheme.spaceSM)

            VStack(alignment: .leading, spacing: 0) {
                if let start = activity.startDate {
                    DiscoverPlanDetailRow(
                        systemImage: "calendar",
                        title: "When",
                        value: scheduleLabel(activity, start: start)
                    )
                }
                DiscoverPlanDetailRow(
                    systemImage: "mappin.and.ellipse",
                    title: "Where",
                    value: locationLabel(activity)
                )
                DiscoverPlanDetailRow(
                    systemImage: "person.2",
                    title: "Attendance",
                    value: capacityLabel(activity)
                )
            }
            .padding(.horizontal, SideSeatTheme.spaceMD)
            .padding(.vertical, SideSeatTheme.spaceXS)
            .background(
                SideSeatTheme.fillSubtle,
                in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
            )
        }
        .padding(.horizontal, SideSeatTheme.screenHorizontal)
        .padding(.vertical, SideSeatTheme.spaceXL)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func attendees(
        _ attendees: [NativeDiscoverActivityAttendee],
        activity: NativeDiscoverActivity
    ) -> some View {
        let visibleAttendees = Array(attendees.prefix(4))
        let remainingCount = max(0, activity.goingCount - visibleAttendees.count)

        return HStack(spacing: SideSeatTheme.spaceMD) {
            if attendees.isEmpty {
                Image(systemName: "person.2")
                    .font(.body.weight(.medium))
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .frame(width: 38, height: 38)
                    .background(SideSeatTheme.fillTertiary, in: Circle())
            } else {
                HStack(spacing: -8) {
                    ForEach(visibleAttendees) { attendee in
                        InitialAvatar(name: attendee.displayName, url: attendee.avatarUrl, size: 34)
                            .overlay(Circle().stroke(SideSeatTheme.bg, lineWidth: 2))
                    }
                    if remainingCount > 0 {
                        Text("+\(remainingCount)")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                            .frame(width: 34, height: 34)
                            .background(SideSeatTheme.fillTertiary, in: Circle())
                            .overlay(Circle().stroke(SideSeatTheme.bg, lineWidth: 2))
                    }
                }
            }

            VStack(alignment: .leading, spacing: 2) {
                Text("Participants")
                    .font(.subheadline.weight(.semibold))
                Text(
                    attendees.isEmpty
                        ? AppLocalization.string( "No attendees yet")
                        : attendees.prefix(3).map(\.displayName).joined(separator: ", ")
                )
                    .font(.caption)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .lineLimit(1)
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, SideSeatTheme.screenHorizontal)
        .padding(.vertical, SideSeatTheme.spaceLG)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            String.localizedStringWithFormat(
                AppLocalization.string( "%lld going"),
                Int64(activity.goingCount)
            )
        )
        .accessibilityIdentifier("discover-activity-participants-summary")
    }

    private func activityMessages(_ detail: NativeDiscoverActivityDetail) -> some View {
        DiscoverDiscussionSection(
            accessibilityID: "discover-activity-comments-section",
            total: store.messageTotal,
            comments: store.messages,
            canComment: !detail.activity.isOrganizer && canLeaveMessage(detail.activity),
            showsClosedState: !canLeaveMessage(detail.activity),
            closedMessage: detail.activity.isOrganizer
                ? AppLocalization.string( "Comments from interested people will appear here.")
                : AppLocalization.string( "Comments are closed for this activity."),
            isLoading: store.isLoadingMessages,
            isMutating: store.isMutatingMessage,
            issue: store.messageIssue,
            onRefresh: {
                await store.loadMessages(activityID: activityID, using: session)
            },
            onReply: { commentID, body in
                await store.submitMessage(
                    body: body,
                    parentID: commentID,
                    activityID: activityID,
                    using: session
                )
            },
            onDelete: { commentID in
                await store.deleteMessage(
                    commentID: commentID,
                    activityID: activityID,
                    using: session
                )
            },
            onReport: { target, reason, details in
                await store.reportMessage(
                    commentID: target.id,
                    authorID: target.authorID,
                    isOwn: target.isOwn,
                    reason: reason,
                    details: details,
                    using: session
                )
            },
            dismissInputSignal: dismissCommentInputSignal,
            onFocusChange: { isReplyComposerFocused = $0 }
        )
    }

    private func submitActivityMessage() {
        let body = activityMessageDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return }
        Task {
            if await store.submitMessage(
                body: body,
                activityID: activityID,
                using: session
            ) {
                activityMessageDraft = ""
                closeQuickCommentComposer()
            }
        }
    }

    private func activityActionBar(
        _ detail: NativeDiscoverActivityDetail,
        onComments: @escaping () -> Void
    ) -> some View {
        let canComment = canLeaveMessage(detail.activity)

        return VStack(spacing: 0) {
            Divider()

            VStack(spacing: 6) {
                if detail.calendarEntryId != nil, !isQuickCommentComposerExpanded {
                    HStack(spacing: 5) {
                        Image(systemName: "calendar.badge.checkmark")
                        Text("On SideSeat calendar")
                            .accessibilityIdentifier("discover-activity-calendar-status")
                    }
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.statusSuccessText)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }

                if canComment, isQuickCommentComposerExpanded {
                    DiscoverQuickCommentComposer(
                        draft: $activityMessageDraft,
                        isFocused: $isQuickCommentComposerFocused,
                        isSubmitting: store.isMutatingMessage,
                        onSubmit: submitActivityMessage,
                        onCancel: closeQuickCommentComposer
                    )
                } else {
                    HStack(spacing: SideSeatTheme.spaceSM) {
                        Button(action: onComments) {
                            DiscoverCommentShortcutLabel(
                                count: store.messageTotal,
                                canWrite: canComment,
                                controlHeight: 44
                            )
                        }
                        .buttonStyle(DiscoverDetailActionButtonStyle())
                        .layoutPriority(1)
                        .accessibilityLabel(canComment ? "Write a comment" : "Comments")
                        .accessibilityHint(
                            canComment
                                ? "Opens the comment field on this page"
                                : "Moves to the comments on this page"
                        )
                        .accessibilityIdentifier("discover-activity-comments")

                        if canContactOrganizer(detail.activity) {
                            Button {
                                Task { await openChat(peerID: detail.activity.organizer.id) }
                            } label: {
                                Group {
                                    if openConversation.isOpening {
                                        ProgressView()
                                    } else {
                                        Image(systemName: "message.fill")
                                            .font(.body.weight(.semibold))
                                    }
                                }
                                .frame(width: 44, height: 44)
                                .background(SideSeatTheme.fillTertiary, in: Circle())
                            }
                            .buttonStyle(DiscoverDetailActionButtonStyle())
                            .foregroundStyle(SideSeatTheme.textPrimary)
                            .disabled(openConversation.isOpening)
                            .accessibilityLabel(detail.viewerHasExistingChat ? "Message organizer" : "Contact organizer")
                            .accessibilityIdentifier("discover-activity-message")
                        }

                        if canAddToCalendar(detail) {
                            Button {
                                Task { await store.addToCalendar(activityID: activityID, using: session) }
                            } label: {
                                Image(systemName: detail.calendarEntryId == nil ? "calendar.badge.plus" : "calendar.badge.checkmark")
                                    .font(.body.weight(.semibold))
                                    .frame(width: 44, height: 44)
                                    .background(
                                        detail.calendarEntryId == nil
                                            ? SideSeatTheme.fillTertiary
                                            : SideSeatTheme.success.opacity(0.12),
                                        in: Circle()
                                    )
                            }
                            .buttonStyle(DiscoverDetailActionButtonStyle())
                            .foregroundStyle(
                                detail.calendarEntryId == nil
                                    ? SideSeatTheme.textPrimary
                                    : SideSeatTheme.statusSuccessText
                            )
                            .disabled(store.isMutating || detail.calendarEntryId != nil)
                            .accessibilityLabel(detail.calendarEntryId == nil ? "Add to SideSeat calendar" : "On SideSeat calendar")
                            .accessibilityIdentifier("discover-activity-add-calendar")
                        }

                        if detail.activity.viewerSignupStatus == "GOING" {
                            Button {
                                showsCancelSignupConfirmation = true
                            } label: {
                                Label("Joined", systemImage: "checkmark")
                                    .font(.body.weight(.semibold))
                                    .foregroundStyle(SideSeatTheme.statusSuccessText)
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 44)
                                    .background(
                                        SideSeatTheme.success.opacity(0.12),
                                        in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                                    )
                            }
                            .buttonStyle(DiscoverDetailActionButtonStyle())
                            .disabled(store.isMutating)
                            .accessibilityHint("Double tap to cancel your signup")
                            .accessibilityIdentifier("discover-activity-cancel-signup")
                        } else {
                            Button {
                                Task { await store.setSignup(true, activityID: activityID, using: session) }
                            } label: {
                                HStack(spacing: SideSeatTheme.spaceSM) {
                                    if store.isMutating {
                                        ProgressView().tint(SideSeatTheme.onAccent)
                                    } else {
                                        Image(systemName: "person.badge.plus")
                                        Text("Join activity")
                                    }
                                }
                                .font(.body.weight(.semibold))
                                .foregroundStyle(SideSeatTheme.onAccent)
                                .frame(maxWidth: .infinity)
                                .frame(height: 44)
                                .background(
                                    SideSeatTheme.accent,
                                    in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                                )
                            }
                            .buttonStyle(DiscoverDetailActionButtonStyle())
                            .disabled(store.isMutating || detail.activity.phase != "bookable")
                            .accessibilityIdentifier("discover-activity-join")
                        }
                    }
                }
            }
            .padding(.horizontal, SideSeatTheme.spaceLG)
            .padding(.vertical, SideSeatTheme.spaceSM)
        }
        .background(.bar)
    }

    private func activityMenu(_ detail: NativeDiscoverActivityDetail) -> some View {
        Menu {
            if detail.activity.isOrganizer {
                Button {
                    showsCloseConfirmation = true
                } label: {
                    Label("Close sign-ups", systemImage: "lock")
                }
                .disabled(store.isMutating || !canClose(detail.activity))
                .accessibilityIdentifier("discover-activity-close")

                Button(role: .destructive) {
                    showsCancelActivityConfirmation = true
                } label: {
                    Label("Cancel activity", systemImage: "xmark.circle")
                }
                .disabled(store.isMutating || detail.activity.phase == "canceled")
                .accessibilityIdentifier("discover-activity-cancel")
            }
        } label: {
            Image(systemName: "ellipsis")
                .foregroundStyle(SideSeatTheme.textPrimary)
        }
        .tint(SideSeatTheme.textPrimary)
        .accessibilityLabel("Activity actions")
        .accessibilityIdentifier("discover-activity-actions")
    }

    private func load() async {
        await store.load(activityID: activityID, using: session)
    }

    private func openChat(peerID: String) async {
        guard let connectionID = await openConversation.open(peerID: peerID, using: session) else {
            return
        }
        router.navigate(to: .directChat(connectionID: connectionID))
    }

    private func capacityLabel(_ activity: NativeDiscoverActivity) -> String {
        if let capacity = activity.capacity {
            return String.localizedStringWithFormat(
                AppLocalization.string( "%lld/%lld people going"),
                Int64(activity.goingCount),
                Int64(capacity)
            )
        }
        return String.localizedStringWithFormat(
            AppLocalization.string( "%lld people going"),
            Int64(activity.goingCount)
        )
    }

    private func scheduleLabel(_ activity: NativeDiscoverActivity, start: Date) -> String {
        guard let end = activity.endDate else {
            return start.formatted(date: .abbreviated, time: .shortened)
        }

        if Calendar.autoupdatingCurrent.isDate(start, inSameDayAs: end) {
            let day = start.formatted(date: .abbreviated, time: .omitted)
            let startTime = start.formatted(date: .omitted, time: .shortened)
            let endTime = end.formatted(date: .omitted, time: .shortened)
            return "\(day) · \(startTime)–\(endTime)"
        }

        return "\(start.formatted(date: .abbreviated, time: .shortened)) – \(end.formatted(date: .abbreviated, time: .shortened))"
    }

    private func locationLabel(_ activity: NativeDiscoverActivity) -> String {
        guard !activity.location.localizedCaseInsensitiveContains(activity.city) else {
            return activity.location
        }
        return "\(activity.location), \(activity.city)"
    }

    private func activityShareURL(_ activity: NativeDiscoverActivity) -> URL {
        URL(string: "https://www.sideseat.de")!
            .appendingPathComponent("discover")
            .appendingPathComponent("activities")
            .appendingPathComponent(activity.id)
    }

    private func canClose(_ activity: NativeDiscoverActivity) -> Bool {
        let phase = activity.phase.lowercased()
        return phase == "bookable" || phase == "full"
    }

    private func canLeaveMessage(_ activity: NativeDiscoverActivity) -> Bool {
        let phase = activity.phase.lowercased()
        return phase == "bookable" || phase == "full"
    }

    private func canContactOrganizer(_ activity: NativeDiscoverActivity) -> Bool {
        let phase = activity.phase.lowercased()
        return !activity.isOrganizer && phase != "canceled" && phase != "expired"
    }

    private func canAddToCalendar(_ detail: NativeDiscoverActivityDetail) -> Bool {
        !detail.activity.isOrganizer
            && (detail.activity.viewerSignupStatus == "GOING" || detail.calendarEntryId != nil)
    }

    private func showComments(using proxy: ScrollViewProxy, shouldFocus: Bool) {
        withAnimation(.easeInOut(duration: 0.28)) {
            proxy.scrollTo(DiscoverDetailAnchor.comments, anchor: .top)
        }

        guard shouldFocus else { return }

        withAnimation(.easeOut(duration: 0.18)) {
            isQuickCommentComposerExpanded = true
        }
        Task { @MainActor in
            await Task.yield()
            try? await Task.sleep(for: .milliseconds(140))
            isQuickCommentComposerFocused = true
            try? await Task.sleep(for: .milliseconds(280))
            withAnimation(.easeOut(duration: 0.18)) {
                proxy.scrollTo(DiscoverDetailAnchor.comments, anchor: .top)
            }
        }
    }

    private func closeQuickCommentComposer() {
        isQuickCommentComposerFocused = false
        withAnimation(.easeOut(duration: 0.18)) {
            isQuickCommentComposerExpanded = false
        }
    }

    private func dismissCommentEditing() {
        guard isQuickCommentComposerExpanded || isReplyComposerFocused else { return }
        dismissCommentInputSignal += 1
        closeQuickCommentComposer()
    }
}

private struct DiscoverTapOutsideInputObserver: UIViewControllerRepresentable {
    let isEnabled: Bool
    let onTapOutside: () -> Void

    func makeUIViewController(context: Context) -> ObserverViewController {
        ObserverViewController()
    }

    func updateUIViewController(_ controller: ObserverViewController, context: Context) {
        controller.update(isEnabled: isEnabled, onTapOutside: onTapOutside)
    }

    static func dismantleUIViewController(
        _ controller: ObserverViewController,
        coordinator: Void
    ) {
        controller.detach()
    }

    @MainActor
    final class ObserverViewController: UIViewController, UIGestureRecognizerDelegate {
        private weak var installedWindow: UIWindow?
        private var onTapOutside: () -> Void = {}
        private lazy var recognizer: UITapGestureRecognizer = {
            let recognizer = UITapGestureRecognizer(target: self, action: #selector(handleTap))
            recognizer.cancelsTouchesInView = false
            recognizer.delegate = self
            recognizer.isEnabled = false
            return recognizer
        }()

        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            attachIfNeeded()
        }

        override func viewDidLayoutSubviews() {
            super.viewDidLayoutSubviews()
            attachIfNeeded()
        }

        func update(isEnabled: Bool, onTapOutside: @escaping () -> Void) {
            self.onTapOutside = onTapOutside
            recognizer.isEnabled = isEnabled
            attachIfNeeded()
        }

        func detach() {
            installedWindow?.removeGestureRecognizer(recognizer)
            installedWindow = nil
        }

        func gestureRecognizer(
            _ gestureRecognizer: UIGestureRecognizer,
            shouldReceive touch: UITouch
        ) -> Bool {
            var candidate = touch.view
            while let view = candidate {
                if view is UITextField || view is UITextView {
                    return false
                }
                candidate = view.superview
            }
            if let window = installedWindow,
               let firstResponder = firstResponder(in: window) {
                let inputFrame = firstResponder.convert(firstResponder.bounds, to: window)
                let composerFrame = CGRect(
                    x: 0,
                    y: inputFrame.minY - 12,
                    width: window.bounds.width,
                    height: inputFrame.height + 72
                )
                if composerFrame.contains(touch.location(in: window)) {
                    return false
                }
            }
            return true
        }

        @objc private func handleTap() {
            onTapOutside()
        }

        private func attachIfNeeded() {
            guard let window = view.window, installedWindow !== window else { return }
            detach()
            window.addGestureRecognizer(recognizer)
            installedWindow = window
        }

        private func firstResponder(in view: UIView) -> UIView? {
            if view.isFirstResponder { return view }
            for subview in view.subviews {
                if let responder = firstResponder(in: subview) {
                    return responder
                }
            }
            return nil
        }
    }
}

private struct DiscoverCommentPreviewRow: View {
    let comment: NativeDiscoverPostQuestion

    var body: some View {
        HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
            InitialAvatar(name: comment.author.displayName, url: comment.author.avatarUrl, size: 34)

            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: SideSeatTheme.spaceXS) {
                    Text(comment.author.displayName)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    if let school = comment.author.school, !school.isEmpty {
                        Text(school)
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    if comment.author.verifiedStudent {
                        VerifiedSchoolMark(school: comment.author.school)
                    }
                }

                Text(comment.body)
                    .font(.subheadline)
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .lineLimit(2)

                if let reply = comment.reply {
                    Text(
                        String.localizedStringWithFormat(
                            AppLocalization.string( "Organizer: %@"),
                            reply.body
                        )
                    )
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 0)
        }
        .padding(.vertical, SideSeatTheme.spaceMD)
    }
}

private enum DiscoverCommentFocus: Hashable {
    case reply(String)
}

private struct DiscoverCommentShortcutLabel: View {
    let count: Int
    let canWrite: Bool
    var controlHeight: CGFloat = 46
    var expands = false

    private var title: LocalizedStringKey {
        canWrite ? "Write a comment" : "Comments"
    }

    private var countLabel: String {
        count > 99 ? "99+" : "\(count)"
    }

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "square.and.pencil")
                .font(.subheadline.weight(.semibold))

            Text(title)
                .lineLimit(expands ? nil : 1)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: !expands, vertical: true)

            if count > 0 {
                Text(countLabel)
                    .font(.caption.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
            }
        }
        .font(.subheadline.weight(.medium))
        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
        .padding(.horizontal, 12)
        .frame(minHeight: controlHeight)
        .frame(maxWidth: expands ? .infinity : nil, alignment: .leading)
        .background(
            SideSeatTheme.fillTertiary,
            in: Capsule()
        )
        .contentShape(Rectangle())
    }
}

private struct DiscoverDetailActionButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? SideSeatTheme.Interaction.pressedScale : 1)
            .opacity(
                isEnabled
                    ? (configuration.isPressed ? SideSeatTheme.Interaction.pressedOpacity : 1)
                    : 0.46
            )
            .animation(
                .easeOut(duration: SideSeatTheme.Interaction.pressDuration),
                value: configuration.isPressed
            )
            .animation(
                .easeOut(duration: SideSeatTheme.Interaction.pressDuration),
                value: isEnabled
            )
    }
}

private struct DiscoverQuickCommentComposer: View {
    @Binding var draft: String
    @FocusState.Binding var isFocused: Bool
    let isSubmitting: Bool
    let onSubmit: () -> Void
    let onCancel: () -> Void

    private var trimmedDraft: String {
        draft.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: SideSeatTheme.spaceSM) {
            Button(action: onCancel) {
                Image(systemName: "keyboard.chevron.compact.down")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .frame(width: 44, height: 44)
                    .background(SideSeatTheme.fillTertiary, in: Circle())
            }
            .buttonStyle(DiscoverDetailActionButtonStyle())
            .accessibilityLabel("Hide comment field")
            .accessibilityIdentifier("discover-comment-cancel")

            TextField("Add a public comment", text: $draft, axis: .vertical)
                .lineLimit(1...4)
                .textFieldStyle(.plain)
                .padding(.horizontal, SideSeatTheme.spaceMD)
                .padding(.vertical, 11)
                .background(
                    SideSeatTheme.fillTertiary,
                    in: RoundedRectangle(
                        cornerRadius: SideSeatTheme.controlRadius,
                        style: .continuous
                    )
                )
                .focused($isFocused)
                .submitLabel(.send)
                .onSubmit(onSubmit)
                .onChange(of: draft) { _, value in
                    if value.count > 500 { draft = String(value.prefix(500)) }
                }
                .accessibilityIdentifier("discover-comment-input")

            Button(action: onSubmit) {
                Group {
                    if isSubmitting {
                        ProgressView().tint(SideSeatTheme.onAccent)
                    } else {
                        Image(systemName: "arrow.up")
                            .font(.body.weight(.bold))
                    }
                }
                .foregroundStyle(SideSeatTheme.onAccent)
                .frame(width: 44, height: 44)
                .background(
                    trimmedDraft.isEmpty ? Color.secondary.opacity(0.45) : SideSeatTheme.accent,
                    in: Circle()
                )
            }
            .buttonStyle(DiscoverDetailActionButtonStyle())
            .disabled(trimmedDraft.isEmpty || isSubmitting)
            .accessibilityLabel("Post comment")
            .accessibilityIdentifier("discover-comment-send")
        }
    }
}

private struct DiscoverDiscussionSection: View {
    let accessibilityID: String
    let total: Int
    let comments: [NativeDiscoverPostQuestion]
    let canComment: Bool
    let showsClosedState: Bool
    let closedMessage: String
    let isLoading: Bool
    let isMutating: Bool
    let issue: String?
    let onRefresh: () async -> Void
    let onReply: (String, String) async -> Bool
    let onDelete: (String) async -> Void
    let onReport: (
        DiscoverQuestionReportTarget,
        NativeReportReason,
        String
    ) async -> String?
    let dismissInputSignal: Int
    let onFocusChange: (Bool) -> Void

    @State private var replyDraft = ""
    @State private var replyTargetID: String?
    @State private var reportTarget: DiscoverQuestionReportTarget?
    @State private var deleteTarget: DiscoverQuestionDeleteTarget?
    @FocusState private var focusedField: DiscoverCommentFocus?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: SideSeatTheme.spaceSM) {
                Label("Comments", systemImage: "bubble.left.and.bubble.right")
                    .font(.headline)
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .accessibilityIdentifier(accessibilityID)

                if total > 0 {
                    Text("\(total)")
                        .font(.caption.weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .padding(.horizontal, 7)
                        .frame(height: 22)
                        .background(SideSeatTheme.fillTertiary, in: Capsule())
                }

                Spacer(minLength: 0)
            }
            .padding(.horizontal, SideSeatTheme.screenHorizontal)
            .padding(.top, SideSeatTheme.spaceLG)
            .padding(.bottom, SideSeatTheme.spaceSM)

            if showsClosedState {
                closedFooter
            }

            Group {
                if isLoading, comments.isEmpty {
                    DiscoverCommentLoadingRows()
                } else if comments.isEmpty {
                    VStack(spacing: SideSeatTheme.spaceSM) {
                        Image(systemName: "bubble.left.and.bubble.right")
                            .font(.title2)
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                            .frame(width: 44, height: 44)
                            .background(SideSeatTheme.fillTertiary, in: Circle())
                        Text("No comments yet")
                            .font(.subheadline.weight(.semibold))
                        Text(canComment ? "Start the conversation." : closedMessage)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, SideSeatTheme.spaceXL)
                } else {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(comments.enumerated()), id: \.element.id) { index, comment in
                            commentThread(comment)
                            if index < comments.count - 1 {
                                Divider()
                                    .padding(.leading, 48)
                            }
                        }

                        if total > comments.count {
                            Text(
                                String.localizedStringWithFormat(
                                    AppLocalization.string( "Showing the latest %lld comments"),
                                    Int64(comments.count)
                                )
                            )
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, SideSeatTheme.spaceLG)
                        }
                    }
                    .accessibilityIdentifier("discover-comments-list")
                }
            }
            .padding(.horizontal, SideSeatTheme.screenHorizontal)

            if let issue {
                HStack(spacing: SideSeatTheme.spaceSM) {
                    DiscoverInlineIssue(message: issue)
                    Button {
                        Task { await onRefresh() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                            .frame(width: 44, height: 44)
                            .background(SideSeatTheme.fillTertiary, in: Circle())
                    }
                    .buttonStyle(DiscoverDetailActionButtonStyle())
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .accessibilityLabel("Retry")
                }
                .padding(.horizontal, SideSeatTheme.screenHorizontal)
                .padding(.bottom, SideSeatTheme.spaceLG)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SideSeatTheme.bg)
        .sheet(item: $reportTarget) { target in
            ChatReportSheet(title: AppLocalization.string( "Report comment")) { reason, details in
                await onReport(target, reason, details)
            }
        }
        .ssActionPrompt(
            isPresented: Binding(
                get: { deleteTarget != nil },
                set: { isPresented in
                    if !isPresented { deleteTarget = nil }
                }
            ),
            title: deleteTarget?.kind == AppLocalization.string("reply")
                ? AppLocalization.string("Delete this reply?")
                : AppLocalization.string("Delete this comment?"),
            systemImage: "trash.fill",
            tint: SideSeatTheme.danger,
            dismissOnTapOutside: true,
            onDismiss: { deleteTarget = nil },
            accessibilityIdentifier: deleteTarget?.kind == AppLocalization.string("reply")
                ? "discover-reply-delete-prompt"
                : "discover-comment-delete-prompt"
        ) {
            guard let target = deleteTarget else { return [] }
            let kindID = target.kind == AppLocalization.string("reply") ? "reply" : "comment"
            return [
                SSActionPromptAction(
                    id: "discover-\(kindID)-delete-cancel",
                    title: AppLocalization.string("Cancel"),
                    role: .cancel,
                    perform: {}
                ),
                SSActionPromptAction(
                    id: "discover-\(kindID)-delete-confirm",
                    title: AppLocalization.string("Delete"),
                    systemImage: "trash",
                    role: .destructive,
                    perform: {
                        Task { await onDelete(target.id) }
                    }
                ),
            ]
        }
        .onChange(of: focusedField) { _, field in
            onFocusChange(field != nil)
            if field == nil, replyTargetID != nil {
                withAnimation(.easeOut(duration: 0.18)) {
                    replyTargetID = nil
                }
            }
        }
        .onChange(of: dismissInputSignal) { _, _ in
            focusedField = nil
            withAnimation(.easeOut(duration: 0.18)) {
                replyTargetID = nil
            }
        }
        .onDisappear {
            onFocusChange(false)
        }
    }

    private var closedFooter: some View {
        HStack(spacing: SideSeatTheme.spaceSM) {
            Image(systemName: "lock")
            Text(closedMessage)
        }
        .font(.footnote)
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, SideSeatTheme.screenHorizontal)
        .padding(.bottom, SideSeatTheme.spaceMD)
    }

    private func commentThread(_ comment: NativeDiscoverPostQuestion) -> some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
            commentContent(
                id: comment.id,
                body: comment.body,
                createdDate: comment.createdDate,
                isOwn: comment.isOwn,
                canDelete: comment.canDelete,
                author: comment.author,
                kind: AppLocalization.string( "comment")
            )

            if let reply = comment.reply {
                commentContent(
                    id: reply.id,
                    body: reply.body,
                    createdDate: reply.createdDate,
                    isOwn: reply.isOwn,
                    canDelete: reply.canDelete,
                    author: reply.author,
                    kind: AppLocalization.string( "reply"),
                    compactAvatar: true,
                    roleBadge: AppLocalization.string( "Organizer")
                )
                .padding(SideSeatTheme.spaceMD)
                .background(
                    SideSeatTheme.fillSubtle,
                    in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                )
                .padding(.leading, 46)
                .accessibilityIdentifier("discover-comment-organizer-reply")
            } else if comment.canReply {
                replyControl(for: comment)
            }
        }
        .padding(.vertical, 14)
        .id(comment.id)
    }

    private func commentContent(
        id: String,
        body: String,
        createdDate: Date?,
        isOwn: Bool,
        canDelete: Bool,
        author: NativeDiscoverQuestionAuthor,
        kind: String,
        compactAvatar: Bool = false,
        roleBadge: String? = nil
    ) -> some View {
        HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
            InitialAvatar(name: author.displayName, url: author.avatarUrl, size: compactAvatar ? 28 : 36)

            VStack(alignment: .leading, spacing: 5) {
                HStack(alignment: .top, spacing: SideSeatTheme.spaceSM) {
                    VStack(alignment: .leading, spacing: 1) {
                        HStack(spacing: SideSeatTheme.spaceXS) {
                            Text(author.displayName)
                                .font(.subheadline.weight(.semibold))
                                .lineLimit(1)
                            if author.verifiedStudent {
                                VerifiedSchoolMark(school: author.school)
                            }
                            if let roleBadge {
                                Text(roleBadge)
                                    .font(.caption2.weight(.semibold))
                                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(SideSeatTheme.fillTertiary, in: Capsule())
                                    .accessibilityElement(children: .ignore)
                                    .accessibilityLabel(roleBadge)
                            }
                        }

                        if let school = author.school, !school.isEmpty {
                            Text(school)
                                .font(.caption2.weight(.medium))
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }

                    Spacer(minLength: 0)
                    commentActions(
                        id: id,
                        authorID: author.id,
                        isOwn: isOwn,
                        canDelete: canDelete,
                        kind: kind
                    )
                }

                Text(body)
                    .font(.subheadline)
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)

                if let createdDate {
                    Text(createdDate.formatted(.relative(presentation: .named)))
                        .font(.caption.weight(.medium))
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                }
            }
        }
    }

    @ViewBuilder
    private func replyControl(for comment: NativeDiscoverPostQuestion) -> some View {
        if replyTargetID == comment.id {
            VStack(alignment: .trailing, spacing: SideSeatTheme.spaceSM) {
                TextField("Write a public reply", text: $replyDraft, axis: .vertical)
                    .lineLimit(1...4)
                    .textFieldStyle(.plain)
                    .padding(.horizontal, SideSeatTheme.spaceMD)
                    .padding(.vertical, 10)
                    .background(
                        SideSeatTheme.fillTertiary,
                        in: RoundedRectangle(
                            cornerRadius: SideSeatTheme.controlRadius,
                            style: .continuous
                        )
                    )
                    .focused($focusedField, equals: .reply(comment.id))
                    .onChange(of: replyDraft) { _, value in
                        if value.count > 500 { replyDraft = String(value.prefix(500)) }
                    }
                    .accessibilityIdentifier("discover-comment-reply-input")

                HStack(spacing: SideSeatTheme.spaceLG) {
                    Button("Cancel") {
                        replyDraft = ""
                        replyTargetID = nil
                        focusedField = nil
                    }
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)

                    Button("Reply") { submitReply(to: comment.id) }
                        .fontWeight(.semibold)
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .disabled(trimmedReply.isEmpty || isMutating)
                }
                .font(.footnote)
            }
            .padding(.leading, 48)
        } else {
            Button {
                replyDraft = ""
                replyTargetID = comment.id
                focusedField = .reply(comment.id)
            } label: {
                Label("Reply as organizer", systemImage: "arrowshape.turn.up.left")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .padding(.horizontal, 10)
                    .frame(height: 36)
                    .background(SideSeatTheme.fillTertiary, in: Capsule())
            }
            .buttonStyle(DiscoverDetailActionButtonStyle())
            .frame(minHeight: 44)
            .padding(.leading, 48)
            .accessibilityIdentifier("discover-comment-reply")
        }
    }

    @ViewBuilder
    private func commentActions(
        id: String,
        authorID: String,
        isOwn: Bool,
        canDelete: Bool,
        kind: String
    ) -> some View {
        if canDelete || !isOwn {
            Menu {
                if canDelete {
                    Button(role: .destructive) {
                        deleteTarget = DiscoverQuestionDeleteTarget(id: id, kind: kind)
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                }
                if !isOwn {
                    Button(role: .destructive) {
                        reportTarget = DiscoverQuestionReportTarget(
                            id: id,
                            authorID: authorID,
                            isOwn: isOwn
                        )
                    } label: {
                        Label("Report", systemImage: "flag")
                    }
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 44, height: 44)
            }
            .tint(SideSeatTheme.textSecondaryStrong)
            .accessibilityLabel("Comment actions")
        }
    }

    private var trimmedReply: String {
        replyDraft.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func submitReply(to commentID: String) {
        let body = trimmedReply
        guard !body.isEmpty else { return }
        Task {
            if await onReply(commentID, body) {
                replyDraft = ""
                replyTargetID = nil
                focusedField = nil
            }
        }
    }
}

private struct DiscoverCommentLoadingRows: View {
    var body: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceLG) {
            ForEach(0..<2, id: \.self) { index in
                HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
                    Circle()
                        .frame(width: 36, height: 36)
                    VStack(alignment: .leading, spacing: 7) {
                        RoundedRectangle(cornerRadius: 4)
                            .frame(width: index == 0 ? 88 : 112, height: 14)
                        RoundedRectangle(cornerRadius: 4)
                            .frame(height: 14)
                        RoundedRectangle(cornerRadius: 4)
                            .frame(width: index == 0 ? 210 : 160, height: 14)
                    }
                }
            }
        }
        .foregroundStyle(SideSeatTheme.fillTertiary)
        .padding(.vertical, SideSeatTheme.spaceLG)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Loading comments")
    }
}
