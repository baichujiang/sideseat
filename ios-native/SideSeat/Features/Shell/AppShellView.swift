import SwiftUI

struct AppShellView: View {
    @Environment(SessionStore.self) private var session
    @Environment(DeepLinkRouter.self) private var deepLinkRouter
    @State private var selectedTab: AppTab = .home
    @State private var previousTab: AppTab = .home
    @State private var routers = TabRouter()
    @State private var showCreateChooser = false
    @State private var createDestination: CreateDestination?
    @State private var productTutorial = ProductTutorialController()

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
        _previousTab = State(initialValue: initialTab)
        #endif
    }

    var body: some View {
        TabView(selection: tabSelection) {
            tab(.home, title: "Home", systemImage: "house") {
                HomeRootView()
            }
            tab(.discover, title: "Discover", systemImage: "safari") {
                DiscoverRootView(createDestination: $createDestination)
            }

            // Placeholder only — selection never stays here (see `tabSelection`).
            SideSeatTheme.bgGrouped
                .ignoresSafeArea()
                .tabItem { Label("Create", systemImage: "plus.circle.fill") }
                .tag(AppTab.create)
                .accessibilityIdentifier("create-action")

            tab(.chats, title: "Chats", systemImage: "bubble.left.and.bubble.right") {
                ChatsRootView()
            }
            tab(.me, title: "Me", systemImage: "person") {
                MeRootView()
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
                            previousTab = tab
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
        .animation(.spring(response: 0.36, dampingFraction: 0.88), value: productTutorial.isPresented)
        .confirmationDialog("Create", isPresented: $showCreateChooser, titleVisibility: .visible) {
            Button("Find buddies") {
                createDestination = .buddyPost
            }
            .accessibilityIdentifier("create-buddy-post")

            Button("Activity") {
                createDestination = .activity
            }
            .accessibilityIdentifier("create-activity")

            Button("Cancel", role: .cancel) {}
        } message: {
            Text("What do you want to post?")
        }
        .sheet(item: $createDestination) { destination in
            NavigationStack {
                switch destination {
                case .buddyPost:
                    DiscoverBuddyCreateView {
                        createDestination = nil
                    }
                case .activity:
                    DiscoverActivityCreateView {
                        createDestination = nil
                    }
                }
            }
        }
        .onChange(of: deepLinkRouter.pendingRoute) {
            routePendingDeepLink()
        }
        .onChange(of: session.phase) {
            if session.phase == .signedOut {
                routers.resetAll()
                selectedTab = .home
                previousTab = .home
                productTutorial.evaluateAutoShow(for: nil)
            } else if session.phase == .signedIn {
                productTutorial.evaluateAutoShow(for: session.currentUser)
            }
        }
        .onChange(of: session.currentUser?.id) {
            guard session.phase == .signedIn else { return }
            productTutorial.evaluateAutoShow(for: session.currentUser)
        }
        .onReceive(NotificationCenter.default.publisher(for: .sideseatReplayProductTutorial)) { note in
            let userID = (note.userInfo?["userID"] as? String) ?? session.currentUser?.id
            guard let userID else { return }
            productTutorial.replay(for: userID) { tab in
                selectedTab = tab
                previousTab = tab
            }
        }
        .task {
            #if DEBUG
            guard session.phase == .signedIn else { return }
            let arguments = ProcessInfo.processInfo.arguments
            if arguments.contains("--ui-testing-public-profile") {
                await Task.yield()
                routers.router(for: .discover).navigate(to: .profile(userID: "ui-peer"))
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
    }

    /// Create is an action, not a destination — never leave the current tab.
    private var tabSelection: Binding<AppTab> {
        Binding(
            get: { selectedTab },
            set: { next in
                if next == .create {
                    // Re-assert the current tab so TabView does not settle on the blank Create page.
                    selectedTab = previousTab
                    showCreateChooser = true
                } else {
                    selectedTab = next
                    previousTab = next
                }
            }
        )
    }

    private func tab<Content: View>(
        _ tab: AppTab,
        title: LocalizedStringKey,
        systemImage: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        NavigationStack(path: routers.binding(for: tab)) {
            content()
                .withAppDestinations()
        }
        .environment(routers.router(for: tab))
        .tabItem { Label(title, systemImage: systemImage) }
        .tag(tab)
    }

    private func routePendingDeepLink() {
        guard session.phase == .signedIn, let route = deepLinkRouter.consumePendingRoute() else {
            return
        }
        let tab: AppTab
        switch route {
        case .courses:
            tab = .home
        case .directChat, .courseChat, .groupChat, .groupChatInfo, .contacts, .plans, .scheduleShare:
            tab = .chats
        case .profile, .settings, .blockedUsers, .supportStore, .feedback, .feedbackDetail:
            tab = .me
        case .course:
            tab = .home
        case .discoverPost:
            tab = .discover
        case .activity:
            tab = .discover
        }
        selectedTab = tab
        previousTab = tab
        routers.router(for: tab).navigate(to: route)
    }
}

private extension View {
    func withAppDestinations() -> some View {
        navigationDestination(for: AppRoute.self) { route in
            switch route {
            case .courses:
                CourseListView()
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
            case .directChat(let id):
                DirectChatView(connectionID: id)
            case .courseChat(let id):
                CommunityChatView(kind: .course, conversationID: id)
            case .groupChat(let id):
                CommunityChatView(kind: .group, conversationID: id)
            case .groupChatInfo(let id):
                GroupInfoView(groupChatID: id)
            case .course(let id):
                CourseDetailView(courseID: id)
            case .discoverPost(let id):
                DiscoverBuddyDetailView(postID: id)
            case .activity(let id):
                DiscoverActivityDetailView(activityID: id)
            }
        }
    }
}
