import SwiftUI

struct AppShellTabDefinition: Identifiable, Equatable {
    let tab: AppTab
    let title: String
    let systemImage: String
    let selectedSystemImage: String

    var id: AppTab { tab }
}

private struct AppShellAuthenticatedLoadID: Equatable {
    let userID: String?
    let canMakeAuthenticatedRequests: Bool
}

enum AppShellNavigation {
    /// Product information architecture is stable. Experiment assignment may
    /// change what appears inside Together, but never renames or reorders the
    /// app's primary destinations.
    static let tabs: [AppShellTabDefinition] = [
        .init(
            tab: .discover,
            title: "Together",
            systemImage: "person.2",
            selectedSystemImage: "person.2.fill"
        ),
        .init(
            tab: .home,
            title: "Calendar",
            systemImage: "calendar",
            selectedSystemImage: "calendar"
        ),
        .init(
            tab: .chats,
            title: "Messages",
            systemImage: "bubble.left.and.bubble.right",
            selectedSystemImage: "bubble.left.and.bubble.right.fill"
        ),
        .init(
            tab: .me,
            title: "Me",
            systemImage: "person",
            selectedSystemImage: "person.fill"
        ),
    ]
}

struct AppShellView: View {
    @Environment(SessionStore.self) private var session
    @Environment(DeepLinkRouter.self) private var deepLinkRouter
    @Environment(\.scenePhase) private var scenePhase
    @State private var selectedTab: AppTab = .discover
    @State private var routers = TabRouter()
    @State private var inboxStore = InboxStore()
    @State private var v2Store = ActionToPlanV2Store.shared
    /// Single create flow sheet — chooser and form share one presentation so option → form
    /// never dismisses/re-presents (avoids the 0.28s double-sheet flash).
    @State private var isCreateFlowPresented = false
    @State private var createFlowDestination: CreateDestination?
    @State private var pendingCreatedPostID: String?
    @State private var productTutorial = ProductTutorialController()
    @State private var foregroundPushNotice: ForegroundPushNotice?
    @State private var foregroundPushDismissTask: Task<Void, Never>?

    init() {
        #if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        let initialTab: AppTab =
            if arguments.contains("--ui-testing-public-profile") {
                .discover
            } else if arguments.contains("--ui-testing-chats")
                || arguments.contains("--ui-testing-unread-jump")
            {
                .chats
            } else if arguments.contains("--ui-testing-discover") {
                .discover
            } else {
                .home
            }
        _selectedTab = State(initialValue: initialTab)
        #endif
    }

    var body: some View {
        shellSurface
        .sheet(isPresented: $isCreateFlowPresented, onDismiss: {
            createFlowDestination = nil
            openPendingCreatedPost()
        }) {
            createFlowSheet
        }
        .task {
            routePendingDeepLink()
        }
        .onChange(of: deepLinkRouter.pendingRoute) {
            routePendingDeepLink()
        }
        .onChange(of: deepLinkRouter.navigationEpoch) {
            routePendingDeepLink()
        }
        .onChange(of: session.phase) {
            if session.phase == .signedOut {
                dismissForegroundPush()
                inboxStore.reset()
                v2Store.resetAssignment()
                routers.resetAll()
                selectedTab = .discover
                isCreateFlowPresented = false
                createFlowDestination = nil
                pendingCreatedPostID = nil
                productTutorial.evaluateAutoShow(for: nil)
            } else if session.phase == .signedIn {
                productTutorial.evaluateAutoShow(for: session.currentUser)
                routePendingDeepLink()
                if session.canMakeAuthenticatedRequests {
                    Task {
                        await inboxStore.load(using: session)
                        await v2Store.loadAssignment(using: session)
                    }
                }
            }
        }
        .onChange(of: session.currentUser?.id) {
            guard session.phase == .signedIn else { return }
            productTutorial.evaluateAutoShow(for: session.currentUser)
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active, session.canMakeAuthenticatedRequests else { return }
            Task { await inboxStore.load(using: session) }
        }
        .onReceive(NotificationCenter.default.publisher(for: .sideSeatInboxConversationRead)) { note in
            if let id = note.userInfo?["conversationID"] as? String {
                inboxStore.clearUnread(conversationID: id)
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .sideSeatInboxConversationUpdated)) { note in
            inboxStore.applyOutboundPreview(from: note)
        }
        .onReceive(NotificationCenter.default.publisher(for: .sideSeatInboxNeedsRefresh)) { _ in
            guard session.canMakeAuthenticatedRequests else { return }
            Task { await inboxStore.load(using: session) }
        }
        .onReceive(NotificationCenter.default.publisher(for: .sideSeatForegroundPushReceived)) { note in
            guard let notice = note.object as? ForegroundPushNotice,
                  !ActiveChatPresentation.isDisplaying(notice)
            else { return }
            presentForegroundPush(notice)
        }
        .onReceive(NotificationCenter.default.publisher(for: .sideseatReplayProductTutorial)) { note in
            let userID = (note.userInfo?["userID"] as? String) ?? session.currentUser?.id
            guard let userID else { return }
            productTutorial.replay(for: userID) { tab in
                selectedTab = tab
            }
        }
        .task {
            #if DEBUG
            guard session.phase == .signedIn else { return }
            let arguments = ProcessInfo.processInfo.arguments
            if let deepLinkArgument = arguments.first(where: {
                $0.hasPrefix("--ui-testing-deep-link=")
            }) {
                await Task.yield()
                let path = String(deepLinkArgument.dropFirst("--ui-testing-deep-link=".count))
                deepLinkRouter.handleAppPath(path)
                routePendingDeepLink()
            } else if arguments.contains("--ui-testing-public-profile") {
                await Task.yield()
                routers.router(for: .discover).navigate(to: .profile(userID: "ui-peer"))
            } else if arguments.contains("--ui-testing-create-plan") {
                await Task.yield()
                createFlowDestination = .buddyPost
                isCreateFlowPresented = true
            } else if arguments.contains("--ui-testing-unread-jump") {
                await Task.yield()
                ChatUnreadLaunch.stage(conversationID: "ui-connection", unreadCount: 12)
                routers.router(for: .chats).navigate(to: .directChat(connectionID: "ui-connection"))
            }
            #endif
            if session.phase == .signedIn {
                productTutorial.evaluateAutoShow(for: session.currentUser)
            }
        }
        .task(
            id: AppShellAuthenticatedLoadID(
                userID: session.currentUser?.id,
                canMakeAuthenticatedRequests: session.canMakeAuthenticatedRequests
            )
        ) {
            guard session.canMakeAuthenticatedRequests else { return }
            await inboxStore.load(using: session)
            await v2Store.loadAssignment(using: session)
        }
    }

    private var shellSurface: some View {
        TabView(selection: $selectedTab) {
            ForEach(AppShellNavigation.tabs) { item in
                tab(
                    item.tab,
                    title: LocalizedStringKey(item.title),
                    systemImage: item.systemImage,
                    selectedSystemImage: item.selectedSystemImage,
                    badge: item.tab == .chats ? inboxStore.unreadBadgeLabel : nil
                ) {
                    rootView(for: item.tab)
                }
            }
        }
        .overlay {
            if productTutorial.isPresented {
                ProductTutorialOverlay(
                    controller: productTutorial,
                    session: session,
                    selectTab: { tab in
                        withAnimation(.spring(response: 0.32, dampingFraction: 0.9)) {
                            selectedTab = tab
                        }
                    }
                )
                .transition(
                    .asymmetric(
                        insertion: .opacity.combined(with: .move(edge: .bottom)),
                        removal: .opacity.combined(with: .scale(scale: 0.98))
                    )
                )
                .zIndex(20)
            }
        }
        .overlay(alignment: .top) {
            if let foregroundPushNotice {
                foregroundPushBanner(foregroundPushNotice)
                    .padding(.horizontal, 12)
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .zIndex(30)
            }
        }
        .animation(.spring(response: 0.36, dampingFraction: 0.88), value: productTutorial.isPresented)
        .animation(.spring(response: 0.32, dampingFraction: 0.9), value: foregroundPushNotice)
    }

    @ViewBuilder
    private func rootView(for tab: AppTab) -> some View {
        switch tab {
        case .discover:
            TogetherRootView()
        case .home:
            HomeRootView()
        case .chats:
            ChatsRootView(store: inboxStore)
        case .me:
            MeRootView()
        }
    }

    private func foregroundPushBanner(_ notice: ForegroundPushNotice) -> some View {
        Button {
            if let url = notice.navigationURL {
                deepLinkRouter.handleNotificationURL(url)
            }
            dismissForegroundPush()
        } label: {
            HStack(spacing: 11) {
                Image(
                    systemName: notice.isMutualOpportunity
                        ? "person.2.fill"
                        : notice.isPlanUpdate ? "calendar.badge.clock" : "bubble.left.fill"
                )
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(
                        notice.isMutualOpportunity
                            ? SideSeatTheme.accent
                            : notice.isPlanUpdate
                                ? SideSeatTheme.HubTint.plans
                                : SideSeatTheme.HubTint.contacts
                    )
                    .frame(width: 32, height: 32)
                    .background(
                        (
                            notice.isMutualOpportunity
                                ? SideSeatTheme.accent
                                : notice.isPlanUpdate
                                    ? SideSeatTheme.HubTint.plans
                                    : SideSeatTheme.HubTint.contacts
                        ).opacity(0.12),
                        in: Circle()
                    )

                VStack(alignment: .leading, spacing: 2) {
                    Text(notice.title.isEmpty ? AppLocalization.string( "SideSeat") : notice.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                    if !notice.body.isEmpty {
                        Text(notice.body)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                if notice.navigationURL != nil {
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.tertiary)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(SideSeatTheme.separator.opacity(0.7), lineWidth: 0.5)
            }
            .shadow(color: .black.opacity(0.12), radius: 14, y: 5)
            .contentShape(Rectangle())
        }
        .buttonStyle(SSPressButtonStyle())
        .accessibilityIdentifier("foreground-push-notice")
        .accessibilityLabel("\(notice.title), \(notice.body)")
    }

    private func presentForegroundPush(_ notice: ForegroundPushNotice) {
        foregroundPushDismissTask?.cancel()
        foregroundPushNotice = notice
        foregroundPushDismissTask = Task {
            try? await Task.sleep(for: .seconds(4))
            guard !Task.isCancelled else { return }
            await MainActor.run {
                if foregroundPushNotice == notice {
                    foregroundPushNotice = nil
                }
            }
        }
    }

    private func dismissForegroundPush() {
        foregroundPushDismissTask?.cancel()
        foregroundPushDismissTask = nil
        foregroundPushNotice = nil
    }

    @ViewBuilder
    private var createFlowSheet: some View {
        Group {
            if let createFlowDestination {
                NavigationStack {
                    switch createFlowDestination {
                    case .courseAction:
                        DiscoverPlanCreateView(mode: .courseAction) { postID in
                            pendingCreatedPostID = postID
                            dismissCreateFlow()
                        }
                    case .buddyPost:
                        DiscoverPlanCreateView { postID in
                            pendingCreatedPostID = postID
                            dismissCreateFlow()
                        }
                    case .activity:
                        DiscoverActivityCreateView {
                            NotificationCenter.default.post(
                                name: .sideSeatDiscoverFeedNeedsRefresh,
                                object: nil
                            )
                            dismissCreateFlow()
                        }
                    }
                }
            } else {
                CreateChooserSheet(
                    onChoose: { destination in
                        withAnimation(.easeInOut(duration: 0.22)) {
                            createFlowDestination = destination
                        }
                    },
                    onCancel: dismissCreateFlow
                )
            }
        }
        .presentationDetents(createFlowDestination == nil ? [SSSheetPresentation.chooser, .large] : [.large])
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(SideSeatTheme.cardRadius)
        .presentationBackground(
            createFlowDestination == nil ? SideSeatTheme.bg : SideSeatTheme.bgGrouped
        )
        .animation(.easeInOut(duration: 0.22), value: createFlowDestination)
    }

    private func openPendingCreatedPost() {
        guard let postID = pendingCreatedPostID else { return }
        pendingCreatedPostID = nil
        selectedTab = .discover
        routers.router(for: .discover).navigate(to: .discoverPost(postID: postID))
    }

    private func dismissCreateFlow() {
        isCreateFlowPresented = false
        createFlowDestination = nil
    }

    private func tab<Content: View>(
        _ tab: AppTab,
        title: LocalizedStringKey,
        systemImage: String,
        selectedSystemImage: String,
        badge: String? = nil,
        @ViewBuilder content: () -> Content
    ) -> some View {
        NavigationStack(path: routers.binding(for: tab)) {
            content()
                .withAppDestinations()
        }
        .environment(routers.router(for: tab))
        .tabItem {
            Label(
                title,
                systemImage: selectedTab == tab ? selectedSystemImage : systemImage
            )
        }
        .badge(badge.map { Text(verbatim: $0) })
        .tag(tab)
    }

    private func routePendingDeepLink() {
        guard session.phase == .signedIn else { return }
        let route = deepLinkRouter.consumePendingRoute()
        let explicitTab = deepLinkRouter.consumePendingTab()
        guard route != nil || explicitTab != nil else { return }
        let tab: AppTab
        if let explicitTab {
            tab = explicitTab
        } else if let route {
            tab = tabForRoute(route)
        } else {
            return
        }
        selectedTab = tab
        if let route {
            routers.router(for: tab).navigate(to: route)
        }
    }

    private func tabForRoute(_ route: AppRoute) -> AppTab {
        switch route {
        case .courses, .archivedCourses, .course:
            return .me
        case .directChat, .courseChat, .groupChat, .groupChatInfo, .contacts, .plans, .scheduleShare,
             .actionResponses, .coordinationShell:
            return .chats
        case .eventShare:
            return .home
        case .myPosts, .savedPosts, .profile, .settings, .blockedUsers, .supportStore, .feedback, .feedbackDetail:
            return .me
        case .discoverPost, .activity:
            return .discover
        }
    }
}

private extension View {
    func withAppDestinations() -> some View {
        navigationDestination(for: AppRoute.self) { route in
            switch route {
            case .courses:
                CourseListView()
            case .archivedCourses:
                ArchivedCourseListView()
            case .myPosts:
                MyPostsView()
            case .savedPosts:
                SavedPostsView()
            case .profile(let id):
                PublicProfileView(userID: id)
            case .contacts:
                ContactsView()
            case .plans:
                PlansRootView()
            case .settings:
                SettingsRootView()
            case .blockedUsers:
                BlockedUsersView()
            case .supportStore:
                SupportStoreView()
            case .feedback:
                FeedbackRootView()
            case .feedbackDetail(let id):
                FeedbackDetailView(feedbackID: id)
            case .scheduleShare(let token):
                ScheduleShareRecipientView(token: token)
            case .eventShare(let token):
                CalendarEventShareRecipientView(token: token)
            case .directChat(let id, let focus):
                DirectChatView(connectionID: id, initialFocus: focus)
                    .toolbar(.hidden, for: .tabBar)
            case .courseChat(let id):
                CommunityChatView(kind: .course, conversationID: id)
                    .toolbar(.hidden, for: .tabBar)
            case .groupChat(let id):
                CommunityChatView(kind: .group, conversationID: id)
                    .toolbar(.hidden, for: .tabBar)
            case .groupChatInfo(let id):
                GroupInfoView(groupChatID: id)
                    .toolbar(.hidden, for: .tabBar)
            case .course(let id):
                CourseDetailView(courseID: id)
            case .discoverPost(let id):
                DiscoverBuddyDetailView(postID: id)
                    .toolbar(.hidden, for: .tabBar)
            case .activity(let id):
                DiscoverActivityDetailView(activityID: id)
                    .toolbar(.hidden, for: .tabBar)
            case .actionResponses(let actionID, let interestID):
                ActionResponsesView(actionID: actionID, focusedInterestID: interestID)
                    .toolbar(.hidden, for: .tabBar)
            case .coordinationShell(let interestID, let reservationID):
                CoordinationShellView(interestID: interestID, expectedReservationID: reservationID)
                    .toolbar(.hidden, for: .tabBar)
            }
        }
    }
}
