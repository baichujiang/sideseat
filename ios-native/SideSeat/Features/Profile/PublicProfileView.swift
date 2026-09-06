import SwiftUI

struct PublicProfileView: View {
    @Environment(SessionStore.self) private var session
    @Environment(RouterPath.self) private var router
    let userID: String
    @State private var store = PublicProfileStore()

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
                            verifiedStudent: payload.profile.verifiedStudent
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
                                    ? AppLocalization.string( "\(payload.sharedCourses.count) shared course")
                                    : AppLocalization.string( "\(payload.sharedCourses.count) shared courses")
                            )
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }

                    if payload.viewerCanMessage,
                       let connectionID = payload.connectionId
                    {
                        Section {
                            Button {
                                router.navigate(to: .directChat(connectionID: connectionID))
                            } label: {
                                Label("Open chat", systemImage: "message")
                            }
                            .accessibilityIdentifier("public-profile-message")
                        }
                    }
                }
                .accessibilityIdentifier("public-profile")
            } else if let issue = store.issue {
                ContentUnavailableView {
                    Label("Profile unavailable", systemImage: "person.crop.circle.badge.exclamationmark")
                } description: {
                    Text(issue)
                } actions: {
                    Button("Try again") { Task { await load() } }
                }
            } else {
                SSLoadingState("Loading profile")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle("Profile")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        await store.load(userID: userID, using: session)
    }

}


private struct ProfileHeader: View {
    let displayName: String
    let username: String
    let avatarUrl: String?
    let tagline: String?
    let schoolSummary: NativeProfileSchoolSummary
    let verifiedStudent: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 14) {
                ProfileAvatar(url: avatarUrl, name: displayName, size: 56)
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(displayName)
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                        if verifiedStudent {
                            VerifiedSchoolMark(school: schoolSummary.schoolShort, compact: false)
                        }
                    }
                    Text("@\(username)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            Text(schoolSummary.displayLine)
                .font(.subheadline)
                .foregroundStyle(.secondary)
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
