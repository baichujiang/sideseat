import SwiftUI

struct PublicProfileView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    let userID: String
    @State private var store = PublicProfileStore()
    @State private var openConversation = OpenConversationStore()

    var body: some View {
        Group {
            if let payload = store.profile {
                List {
                    Section {
                        ProfileHeader(
                            displayName: payload.profile.displayName,
                            username: payload.profile.username,
                            avatarUrl: payload.profile.avatarUrl,
                            tagline: payload.profile.tagline,
                            schoolSummary: payload.profile.schoolSummary,
                            verifiedStudent: payload.profile.verifiedStudent,
                            verificationStatus: payload.profile.studentVerificationStatus
                        )
                        if let metVia = payload.metVia {
                            Label(metVia, systemImage: "link")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }

                    Section("Courses") {
                        if payload.peerCourses.isEmpty {
                            Text("No courses shown")
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(payload.peerCourses) { course in
                                Label(course.code ?? course.name, systemImage: "book")
                            }
                        }
                        if !payload.sharedCourses.isEmpty {
                            Text(
                                payload.sharedCourses.count == 1
                                    ? String(localized: "\(payload.sharedCourses.count) shared course")
                                    : String(localized: "\(payload.sharedCourses.count) shared courses")
                            )
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }

                    if payload.viewerCanMessage {
                        Section {
                            Button {
                                Task { await openChat(peerID: payload.profile.id) }
                            } label: {
                                if openConversation.isOpening {
                                    ProgressView()
                                        .ssNeutralProgressTint()
                                } else {
                                    Label(
                                        payload.connectionId == nil
                                            ? String(localized: "Message")
                                            : String(localized: "Open chat"),
                                        systemImage: "message"
                                    )
                                }
                            }
                            .disabled(openConversation.isOpening)
                            .accessibilityIdentifier("public-profile-message")

                            if let issue = openConversation.issue {
                                Text(issue)
                                    .font(.footnote)
                                    .foregroundStyle(SideSeatTheme.danger)
                                    .accessibilityIdentifier("public-profile-message-error")
                            }
                        }
                    }
                }
                .accessibilityIdentifier("public-profile")
            } else if store.isLoading {
                SSLoadingState("Loading profile")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ContentUnavailableView {
                    Label("Profile unavailable", systemImage: "person.crop.circle.badge.exclamationmark")
                } description: {
                    Text(store.issue ?? String(localized: "This profile is not available."))
                } actions: {
                    Button("Try again") { Task { await load() } }
                }
            }
        }
        .navigationTitle("Profile")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        await store.load(userID: userID, using: session)
    }

    private func openChat(peerID: String) async {
        guard let connectionID = await openConversation.open(peerID: peerID, using: session) else {
            return
        }
        if let current = store.profile, current.connectionId == nil {
            store.applyOpenedConnection(connectionID)
        }
        router.navigate(to: .directChat(connectionID: connectionID))
    }
}


private struct ProfileHeader: View {
    let displayName: String
    let username: String
    let avatarUrl: String?
    let tagline: String?
    let schoolSummary: NativeProfileSchoolSummary
    let verifiedStudent: Bool
    let verificationStatus: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 14) {
                ProfileAvatar(url: avatarUrl, name: displayName, size: 56)
                VStack(alignment: .leading, spacing: 3) {
                    Text(displayName)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(.primary)
                    Text("@\(username)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            Text(schoolSummary.displayLine)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            SchoolIdentityBadge(
                school: schoolSummary.schoolShort,
                verifiedStudent: verifiedStudent,
                status: verificationStatus
            )
            if let tagline, !tagline.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text(tagline)
                    .font(.body)
            }
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .combine)
    }
}


struct ProfileAvatar: View {
    let url: String?
    let name: String
    var size: CGFloat = 56

    var body: some View {
        Group {
            if let url, let imageURL = URL(string: url) {
                AsyncImage(url: imageURL) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFill()
                    default:
                        InitialAvatar(name: name, size: size)
                    }
                }
            } else {
                InitialAvatar(name: name, size: size)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }
}
