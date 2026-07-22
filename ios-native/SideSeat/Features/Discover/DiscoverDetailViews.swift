import SwiftUI

struct DiscoverBuddyDetailView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    let postID: String
    @State private var store = DiscoverPostDetailStore()
    @State private var openConversation = OpenConversationStore()

    var body: some View {
        Group {
            if let detail = store.detail {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        header(detail)
                        meta(detail)
                        actions(detail)
                        if let issue = store.issue {
                            Text(issue)
                                .font(.footnote)
                                .foregroundStyle(SideSeatTheme.danger)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                    .padding(.bottom, 24)
                }
                .background(SideSeatTheme.bgGrouped)
                .accessibilityIdentifier("discover-post-detail")
            } else if store.isLoading {
                ProgressView("Loading buddy post")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ContentUnavailableView {
                    Label("Buddy post unavailable", systemImage: "person.crop.circle.badge.exclamationmark")
                } description: {
                    Text(store.issue ?? "This post is no longer available.")
                } actions: {
                    Button("Try again") { Task { await load() } }
                }
            }
        }
        .navigationTitle("Buddy post")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.visible, for: .navigationBar)
        .task { await load() }
    }

    @ViewBuilder
    private func header(_ detail: NativeDiscoverBuddyPostDetail) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Button {
                router.navigate(to: .profile(userID: detail.post.author.id))
            } label: {
                HStack(spacing: 10) {
                    InitialAvatar(name: detail.post.author.displayName, url: detail.post.author.avatarUrl)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(detail.post.author.displayName)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.primary)
                        if let major = detail.post.author.major, !major.isEmpty {
                            Text(major)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    Spacer(minLength: 0)
                }
            }
            .buttonStyle(.plain)

            Text(detail.post.title)
                .font(.title3.weight(.semibold))
                .fixedSize(horizontal: false, vertical: true)

            if let body = detail.post.body, !body.isEmpty {
                Text(body)
                    .font(.body)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous))
    }

    @ViewBuilder
    private func meta(_ detail: NativeDiscoverBuddyPostDetail) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("\(detail.post.interestedCount) interested", systemImage: "heart")
            if let expiry = detail.post.expiryDate {
                Label(expiry.formatted(date: .abbreviated, time: .shortened), systemImage: "clock")
            }
            ForEach(detail.post.linkedCourses) { course in
                Label(course.code ?? course.name, systemImage: "book")
            }
        }
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous))
    }

    @ViewBuilder
    private func actions(_ detail: NativeDiscoverBuddyPostDetail) -> some View {
        VStack(spacing: 0) {
            Button {
                Task {
                    await store.setSaved(
                        !detail.post.savedByViewer,
                        postID: postID,
                        using: session
                    )
                }
            } label: {
                Label(
                    detail.post.savedByViewer ? "Saved" : "Save",
                    systemImage: detail.post.savedByViewer ? "bookmark.fill" : "bookmark"
                )
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 12)
            }
            .disabled(store.isMutating)
            .accessibilityIdentifier("discover-post-save")

            if detail.viewerCanMessage, !detail.post.isOwn {
                Divider()
                Button {
                    Task { await openChat(peerID: detail.post.author.id) }
                } label: {
                    Group {
                        if openConversation.isOpening {
                            ProgressView()
                                .frame(maxWidth: .infinity, alignment: .leading)
                        } else {
                            Label("Message", systemImage: "message")
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    .padding(.vertical, 12)
                }
                .disabled(openConversation.isOpening)
                .accessibilityIdentifier("discover-post-message")

                if let issue = openConversation.issue {
                    Text(issue)
                        .font(.footnote)
                        .foregroundStyle(SideSeatTheme.danger)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.bottom, 8)
                }
            }
        }
        .padding(.horizontal, 16)
        .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous))
    }

    private func load() async {
        await store.load(postID: postID, using: session)
    }

    private func openChat(peerID: String) async {
        guard let connectionID = await openConversation.open(peerID: peerID, using: session) else {
            return
        }
        router.navigate(to: .directChat(connectionID: connectionID))
    }
}

struct DiscoverActivityDetailView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    let activityID: String
    @State private var store = DiscoverActivityDetailStore()
    @State private var openConversation = OpenConversationStore()

    var body: some View {
        Group {
            if let detail = store.detail {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(detail.activity.title)
                                .font(.title3.weight(.semibold))
                                .fixedSize(horizontal: false, vertical: true)
                            if let description = detail.activity.description, !description.isEmpty {
                                Text(description)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous))

                        VStack(alignment: .leading, spacing: 10) {
                            if let start = detail.activity.startDate {
                                Label(start.formatted(date: .abbreviated, time: .shortened), systemImage: "calendar")
                            }
                            Label(detail.activity.location, systemImage: "mappin.and.ellipse")
                            Label(capacityLabel(detail.activity), systemImage: "person.2")
                            Label(detail.activity.organizer.displayName, systemImage: "person.crop.circle")
                        }
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous))

                        VStack(alignment: .leading, spacing: 10) {
                            Text("Going")
                                .font(.subheadline.weight(.semibold))
                            if detail.goingAttendees.isEmpty {
                                Text("No attendees yet")
                                    .foregroundStyle(.secondary)
                            } else {
                                ForEach(detail.goingAttendees) { attendee in
                                    Label(attendee.displayName, systemImage: "person")
                                }
                            }
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous))

                        activityActions(detail)

                        if let issue = store.issue {
                            Text(issue)
                                .font(.footnote)
                                .foregroundStyle(SideSeatTheme.danger)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                    .padding(.bottom, 24)
                }
                .background(SideSeatTheme.bgGrouped)
                .accessibilityIdentifier("discover-activity-detail")
            } else if store.isLoading {
                ProgressView("Loading activity")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ContentUnavailableView {
                    Label("Activity unavailable", systemImage: "calendar.badge.exclamationmark")
                } description: {
                    Text(store.issue ?? "This activity is no longer available.")
                } actions: {
                    Button("Try again") { Task { await load() } }
                }
            }
        }
        .navigationTitle("Activity")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.visible, for: .navigationBar)
        .task { await load() }
    }

    @ViewBuilder
    private func activityActions(_ detail: NativeDiscoverActivityDetail) -> some View {
        VStack(spacing: 0) {
            if detail.activity.isOrganizer {
                Button {
                    Task { await store.setStatus("CLOSED", activityID: activityID, using: session) }
                } label: {
                    Label("Close activity", systemImage: "lock")
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 12)
                }
                .disabled(store.isMutating || !canClose(detail.activity))
                .accessibilityIdentifier("discover-activity-close")

                Divider()

                Button(role: .destructive) {
                    Task { await store.setStatus("CANCELED", activityID: activityID, using: session) }
                } label: {
                    Label("Cancel activity", systemImage: "xmark.circle")
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 12)
                }
                .disabled(store.isMutating || detail.activity.phase == "canceled")
                .accessibilityIdentifier("discover-activity-cancel")
            } else {
                if canContactOrganizer(detail.activity) {
                    Button {
                        Task { await openChat(peerID: detail.activity.organizer.id) }
                    } label: {
                        Group {
                            if openConversation.isOpening {
                                ProgressView()
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            } else {
                                Label(
                                    detail.viewerHasExistingChat ? "Message organizer" : "Contact organizer",
                                    systemImage: "message"
                                )
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                        .padding(.vertical, 12)
                    }
                    .disabled(openConversation.isOpening)
                    .accessibilityIdentifier("discover-activity-message")

                    if let issue = openConversation.issue {
                        Text(issue)
                            .font(.footnote)
                            .foregroundStyle(SideSeatTheme.danger)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.bottom, 8)
                    }

                    Divider()
                }

                if canAddToCalendar(detail) {
                    Button {
                        Task { await store.addToCalendar(activityID: activityID, using: session) }
                    } label: {
                        Label(
                            detail.calendarEntryId == nil
                                ? "Add to SideSeat calendar"
                                : "On SideSeat calendar",
                            systemImage: detail.calendarEntryId == nil
                                ? "calendar.badge.plus"
                                : "calendar.badge.checkmark"
                        )
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 12)
                    }
                    .disabled(store.isMutating || detail.calendarEntryId != nil)
                    .accessibilityIdentifier("discover-activity-add-calendar")

                    Divider()
                }

                if detail.activity.viewerSignupStatus == "GOING" {
                    Button(role: .destructive) {
                        Task { await store.setSignup(false, activityID: activityID, using: session) }
                    } label: {
                        Label("Cancel signup", systemImage: "person.badge.minus")
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 12)
                    }
                    .disabled(store.isMutating)
                    .accessibilityIdentifier("discover-activity-cancel-signup")
                } else {
                    Button {
                        Task { await store.setSignup(true, activityID: activityID, using: session) }
                    } label: {
                        Label("Join activity", systemImage: "person.badge.plus")
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 12)
                    }
                    .disabled(store.isMutating || detail.activity.phase != "bookable")
                    .accessibilityIdentifier("discover-activity-join")
                }
            }
        }
        .padding(.horizontal, 16)
        .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous))
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
            return "\(activity.goingCount)/\(capacity) going"
        }
        return "\(activity.goingCount) going"
    }

    private func canClose(_ activity: NativeDiscoverActivity) -> Bool {
        activity.phase == "bookable" || activity.phase == "full"
    }

    private func canContactOrganizer(_ activity: NativeDiscoverActivity) -> Bool {
        !activity.isOrganizer && activity.phase != "canceled" && activity.phase != "expired"
    }

    private func canAddToCalendar(_ detail: NativeDiscoverActivityDetail) -> Bool {
        !detail.activity.isOrganizer
            && (detail.activity.viewerSignupStatus == "GOING" || detail.calendarEntryId != nil)
    }
}
