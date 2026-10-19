import Foundation
import Observation

struct InboxNotification: Codable, Identifiable, Equatable, Sendable {
    enum Kind: String, Codable, Sendable {
        case invitation, changed, confirmed, cancelled, activityChosen, verificationApproved, verificationRejected, accountUpdated

        var title: String {
            switch self {
            case .invitation: AppLocalization.string("A plan is waiting for you")
            case .changed: AppLocalization.string("Plan time updated")
            case .confirmed: AppLocalization.string("Plan confirmed")
            case .cancelled: AppLocalization.string("Plan cancelled")
            case .activityChosen: AppLocalization.string("Activity chosen")
            case .verificationApproved: AppLocalization.string("Student verification approved")
            case .verificationRejected: AppLocalization.string("Student verification needs attention")
            case .accountUpdated: AppLocalization.string("Account updated")
            }
        }

        var symbol: String {
            switch self {
            case .invitation: "calendar.badge.exclamationmark"
            case .changed: "clock.arrow.circlepath"
            case .confirmed: "calendar.badge.checkmark"
            case .cancelled: "calendar.badge.minus"
            case .activityChosen: "lightbulb"
            case .verificationApproved: "checkmark.shield"
            case .verificationRejected: "exclamationmark.shield"
            case .accountUpdated: "person.crop.circle"
            }
        }
    }

    enum Destination: Codable, Equatable, Sendable {
        case sharedPlan(token: String)
        case chatPlan(connectionID: String, commitmentID: String, revisionID: String)
        case profile
        case settings

        var route: AppRoute? {
            switch self {
            case .sharedPlan(let token): .timePoll(token: token)
            case .chatPlan(let connection, let commitment, let revision):
                .plan(connectionID: connection, commitmentID: commitment, revisionID: revision)
            case .profile: nil
            case .settings: .settings
            }
        }
    }

    let id: String
    let source: String
    let sourceID: String
    let kind: Kind
    let detail: String
    let date: Date
    let destination: Destination
    var expiresAt: Date? = nil
    var isRead = false
}

/// A device-local notification/read history, hydrated from the authenticated domain APIs.
/// Domain snapshots, not unread task counts or raw APNs payloads, establish visible events.
@MainActor @Observable
final class InboxNotificationsStore {
    private struct Snapshot: Codable {
        var items: [InboxNotification] = []
        var fingerprints: [String: String] = [:]
        var sharedInvitationStatusVersion: Int? = 1
    }

    private(set) var items: [InboxNotification] = []
    private(set) var isLoading = false
    private(set) var issue: String?
    private(set) var accountID: String?
    private var fingerprints: [String: String] = [:]
    private var requestID = UUID()
    private var installedFixtures = false
    private let defaults: UserDefaults
    private var key: String { "sideseat.notifications.v1.\(accountID ?? "")" }
    var unreadCount: Int { items.filter { !$0.isRead }.count }
    var nextInvitationExpiry: Date? { items.compactMap(\.expiresAt).min() }

    func expireInvitations(now: Date = Date()) {
        let count = items.count
        items.removeAll { $0.expiresAt.map { $0 <= now } == true }
        if items.count != count { persist() }
    }

    init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    func activate(accountID: String?) {
        guard self.accountID != accountID else { return }
        reset()
        self.accountID = accountID
        guard accountID != nil, let data = defaults.data(forKey: key),
              let snapshot = try? JSONDecoder().decode(Snapshot.self, from: data) else { return }
        items = snapshot.items
        fingerprints = snapshot.fingerprints
        if snapshot.sharedInvitationStatusVersion == nil {
            // Preview 112 observed INVITED without creating a notification.
            // Retry only those missed invitations, preserving existing read history.
            fingerprints = fingerprints.filter { key, value in
                !(key.hasPrefix("shared:") && value.hasSuffix("|INVITING|INVITED"))
            }
        }
    }

    func reset() {
        requestID = UUID()
        accountID = nil
        items = []
        fingerprints = [:]
        isLoading = false
        issue = nil
        installedFixtures = false
    }

    func markRead(_ id: String) {
        guard let index = items.firstIndex(where: { $0.id == id }) else { return }
        items[index].isRead = true
        persist()
    }

    func markAllRead() {
        for index in items.indices { items[index].isRead = true }
        persist()
    }

    func refresh(using session: SessionStore) async {
        activate(accountID: session.currentUser?.id)
        guard let owner = accountID, session.canMakeAuthenticatedRequests, !isLoading else { return }
        let generation = session.authorizationGeneration
        let request = UUID()
        requestID = request
        isLoading = true
        issue = nil
        defer { if requestID == request { isLoading = false } }
        func isCurrent() -> Bool {
            requestID == request && accountID == owner && session.currentUser?.id == owner
                && session.authorizationGeneration == generation
        }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated"),
           !ProcessInfo.processInfo.arguments.contains("--ui-testing-notifications-live") {
            if ProcessInfo.processInfo.arguments.contains("--ui-testing-notifications-empty") {
                items = []; fingerprints = [:]; installedFixtures = true
            }
            if ProcessInfo.processInfo.arguments.contains("--ui-testing-notifications"), !installedFixtures {
                installedFixtures = true
                if ProcessInfo.processInfo.arguments.contains("--ui-testing-notifications-reset") {
                    items = []; fingerprints = [:]
                }
                for item in Self.fixtures { insert(item) }
                persist()
            }
            if ProcessInfo.processInfo.arguments.contains("--ui-testing-notifications-error") {
                issue = AppLocalization.string("Notifications could not be refreshed. Please try again.")
            }
            return
        }
        #endif

        do {
            let result: APIEnvelope<NativePlansListPayload> = try await session.sendAuthorized("api/v1/plans")
            guard isCurrent() else { return }
            reconcile(plans: result.data.plans, userID: owner)
        } catch {
            guard isCurrent() else { return }
            issue = AppLocalization.string("Notifications could not be refreshed. Please try again.")
        }
        guard isCurrent() else { return }
        do {
            let result: APIEnvelope<NativeTimePollList> = try await session.sendAuthorized("api/v1/time-polls")
            guard isCurrent() else { return }
            reconcile(polls: result.data.polls)
        } catch {
            guard isCurrent() else { return }
            issue = AppLocalization.string("Notifications could not be refreshed. Please try again.")
        }
        guard isCurrent() else { return }
        do {
            let result: APIEnvelope<NativeCurrentProfile> = try await session.sendAuthorized("api/v1/me")
            guard isCurrent() else { return }
            observe(profile: result.data)
        } catch {
            guard isCurrent() else { return }
            issue = AppLocalization.string("Notifications could not be refreshed. Please try again.")
        }
    }

    func reconcile(plans: [NativePlanRequest], userID: String, now: Date = Date()) {
        let visible = plans.filter { $0.status != "EXPIRED" && !($0.status == "PENDING" && ($0.startDate ?? .distantPast) <= now) }
        prune(source: "chat", visibleIDs: Set(visible.map(\.id)))
        for plan in visible {
            let sourceID = plan.id
            let fingerprint = "\(plan.status)|\(plan.startTime)|\(plan.endTime)|\(plan.cancellation?.canceledAt ?? "")"
            let previous = fingerprints["chat:\(sourceID)"]
            let kind: InboxNotification.Kind?
            if plan.cancellation != nil || ["CANCELLED", "CANCELED"].contains(plan.status) {
                kind = .cancelled
            } else if plan.status == "PENDING", plan.receiver.id == userID,
               (plan.startDate ?? .distantPast) > now {
                kind = plan.counterOfId != nil ? .changed : .invitation
            } else if plan.status == "ACCEPTED", (plan.endDate ?? .distantPast) > now {
                kind = .confirmed
            } else { kind = nil }
            fingerprints["chat:\(sourceID)"] = fingerprint
            guard previous != fingerprint, let kind else { continue }
            insert(.init(id: "chat:\(sourceID):\(fingerprint):\(plan.updatedAt)", source: "chat", sourceID: sourceID,
                kind: kind, detail: plan.title, date: Date.sideSeatChatISO8601(plan.cancellation?.canceledAt ?? plan.updatedAt) ?? now,
                destination: .chatPlan(connectionID: plan.connectionId, commitmentID: plan.commitmentId ?? plan.id, revisionID: plan.id),
                expiresAt: [.invitation, .changed].contains(kind) ? plan.startDate : nil))
        }
        persist()
    }

    func reconcile(polls: [NativeTimePollList.Item], now: Date = Date()) {
        let visible = polls.filter { ($0.isIncluded == true || $0.activitySelection?.hasParticipated == true) && $0.planningPhase(at: now) != "EXPIRED" }
        prune(source: "shared", visibleIDs: Set(visible.map(\.token)))
        for poll in visible {
            let sourceID = poll.token
            let timing = "\(poll.chosenStart?.timeIntervalSince1970 ?? 0)|\(poll.chosenEnd?.timeIntervalSince1970 ?? 0)"
            let fingerprint = "\(timing)|\(poll.phase ?? "COLLECTING")|\(poll.myInvitationStatus ?? "")"
                + (poll.activitySelection.map { "|activity:\($0.selectedIdeaId ?? "open")" } ?? "")
            let previous = fingerprints["shared:\(sourceID)"]
            let kind: InboxNotification.Kind?
            if poll.planningPhase(at: now) == "INVITING", poll.myInvitationStatus == "INVITED",
               (poll.chosenStart ?? .distantPast) > now {
                kind = previous.map { $0.contains("|INVITING|") && !$0.hasPrefix(timing + "|") } == true ? .changed : .invitation
            } else if poll.phase == "COLLECTING", poll.isOwner != true,
                      let activity = poll.activitySelection, !activity.isOpen, activity.hasParticipated {
                kind = .activityChosen
            } else if poll.phase == "CONFIRMED", (poll.chosenEnd ?? .distantPast) > now {
                kind = .confirmed
            } else if poll.phase == "CANCELLED", now.timeIntervalSince(poll.updatedAt) < 30 * 86400 {
                kind = .cancelled
            } else { kind = nil }
            fingerprints["shared:\(sourceID)"] = fingerprint
            guard previous != fingerprint, let kind else { continue }
            insert(.init(id: "shared:\(sourceID):\(fingerprint):\(poll.updatedAt.timeIntervalSince1970)", source: "shared", sourceID: sourceID,
                kind: kind, detail: poll.title, date: poll.updatedAt, destination: .sharedPlan(token: poll.token),
                expiresAt: kind == .activityChosen ? poll.expiresAt : [.invitation, .changed].contains(kind) ? poll.chosenStart : nil))
        }
        persist()
    }

    func observe(profile: NativeCurrentProfile) {
        guard profile.id == accountID else { return }
        let statusKey = "account:verification"
        let status = profile.studentVerificationStatus
        let previous = fingerprints[statusKey]
        fingerprints[statusKey] = status
        if let previous, previous != status, ["VERIFIED", "REJECTED"].contains(status) {
            let kind: InboxNotification.Kind = status == "VERIFIED" ? .verificationApproved : .verificationRejected
            insert(.init(id: "verification:\(UUID())", source: "account", sourceID: statusKey,
                kind: kind, detail: "", date: Date(), destination: .profile))
        }
        let usernameKey = "account:username"
        let updated = profile.usernameUpdatedAt ?? ""
        if !updated.isEmpty {
            if let previous = fingerprints[usernameKey], previous != updated {
                insert(.init(id: "username:\(updated)", source: "account", sourceID: usernameKey,
                    kind: .accountUpdated, detail: profile.username,
                    date: Date.sideSeatChatISO8601(updated) ?? Date(), destination: .settings))
            }
        }
        fingerprints[usernameKey] = updated
        persist()
    }

    private func insert(_ item: InboxNotification) {
        guard !items.contains(where: { $0.id == item.id }) else { return }
        items.append(item)
        items.sort { $0.date > $1.date }
        items = Array(items.prefix(100))
    }

    private func prune(source: String, visibleIDs: Set<String>) {
        items.removeAll { $0.source == source && !visibleIDs.contains($0.sourceID) }
        // Keep observed fingerprints so a removed/reappearing record does not replay read events.
    }

    private func persist() {
        guard accountID != nil, let data = try? JSONEncoder().encode(Snapshot(items: items, fingerprints: fingerprints)) else { return }
        defaults.set(data, forKey: key)
    }

    #if DEBUG
    static var fixtures: [InboxNotification] {
        [
            .init(id: "fixture-invitation", source: "fixture", sourceID: "1", kind: .invitation, detail: "周末一起去湖边", date: Date(),
                destination: .chatPlan(connectionID: "ui-connection", commitmentID: "ui-plan-1", revisionID: "ui-plan-1")),
            .init(id: "fixture-changed", source: "fixture", sourceID: "2", kind: .changed, detail: "图书馆一起复习", date: Date().addingTimeInterval(-3600),
                destination: .chatPlan(connectionID: "ui-connection", commitmentID: "ui-plan-1", revisionID: "ui-plan-1")),
            .init(id: "fixture-verification", source: "fixture", sourceID: "3", kind: .verificationApproved, detail: "", date: Date().addingTimeInterval(-86400), destination: .profile)
        ]
    }
    #endif
}
