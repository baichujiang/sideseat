import Foundation
import Observation
import SwiftUI

struct ConversationPlanGroup: Identifiable {
    let id: String
    let plans: [NativePlanRequest]
    var primary: NativePlanRequest { plans[0] }
}

enum ConversationPlanSelection {
    static func isCurrent(_ plan: NativePlanRequest, at now: Date) -> Bool {
        if plan.cancellation != nil { return false }
        if plan.status == "PENDING" { return (plan.startDate ?? .distantPast) > now }
        return plan.status == "ACCEPTED" && (plan.endDate ?? .distantPast) > now
    }

    static func rank(_ plan: NativePlanRequest, viewerID: String) -> Int {
        if plan.status == "PENDING", plan.receiver.id == viewerID { return 0 }
        return plan.status == "ACCEPTED" ? 1 : 2
    }

    static func groups(_ plans: [NativePlanRequest], viewerID: String, now: Date) -> [ConversationPlanGroup] {
        let current = plans.filter { isCurrent($0, at: now) }
        func ordered(_ lhs: NativePlanRequest, _ rhs: NativePlanRequest) -> Bool {
            let a = rank(lhs, viewerID: viewerID), b = rank(rhs, viewerID: viewerID)
            if a != b { return a < b }
            if lhs.startDate != rhs.startDate { return (lhs.startDate ?? .distantFuture) < (rhs.startDate ?? .distantFuture) }
            return lhs.id < rhs.id
        }
        return Dictionary(grouping: current, by: { $0.commitmentId ?? $0.id })
            .map { ConversationPlanGroup(id: $0.key, plans: $0.value.sorted(by: ordered)) }
            .sorted { ordered($0.primary, $1.primary) }
    }

    static func title(_ plan: NativePlanRequest, viewerID: String, now: Date) -> String {
        if plan.cancellation != nil || plan.status == "CANCELED" { return AppLocalization.string("Viewing · Canceled") }
        if !isCurrent(plan, at: now) { return AppLocalization.string("Viewing · Ended") }
        if plan.status == "ACCEPTED" {
            return AppLocalization.string((plan.startDate ?? .distantFuture) <= now ? "In progress" : "Next meet-up · Confirmed")
        }
        if plan.receiver.id == viewerID { return AppLocalization.string("Waiting for your reply") }
        return String(format: AppLocalization.string("Waiting for %@"), plan.receiver.displayName)
    }

    static func compactTitle(_ plan: NativePlanRequest, viewerID: String, now: Date) -> String {
        if plan.cancellation != nil || plan.status == "CANCELED" { return AppLocalization.string("Canceled") }
        if !isCurrent(plan, at: now) { return AppLocalization.string("Ended") }
        if plan.status == "ACCEPTED" {
            return AppLocalization.string((plan.startDate ?? .distantFuture) <= now ? "In progress" : "Confirmed")
        }
        return AppLocalization.string(plan.receiver.id == viewerID ? "Reply needed (compact)" : "Awaiting reply (compact)")
    }

    static func time(_ plan: NativePlanRequest) -> String {
        guard let start = plan.startDate, let end = plan.endDate else { return "" }
        let format = Date.IntervalFormatStyle(date: .abbreviated, time: .shortened)
            .locale(AppLocalization.selectedLanguage.locale)
        return (start..<end).formatted(format)
    }
}

private struct ConversationPlansPage: Decodable {
    let plans: [NativePlanRequest]
    // Required nullable key: an older server's unscoped response must not look complete.
    let nextCursor: String?
    enum CodingKeys: String, CodingKey { case plans, nextCursor }
    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        plans = try values.decode([NativePlanRequest].self, forKey: .plans)
        nextCursor = try values.decode(String?.self, forKey: .nextCursor)
    }
}

@MainActor @Observable
final class ConversationPlansStore {
    private(set) var plans: [NativePlanRequest] = []
    private(set) var hasLoaded = false
    private(set) var issue: String?
    private var requestID = UUID()

    func load(connectionID: String, using session: SessionStore, fixturePlans: [NativePlanRequest] = []) async {
        let request = UUID()
        requestID = request
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            plans = Array(Dictionary(fixturePlans.map { ($0.id, $0) }, uniquingKeysWith: { _, new in new }).values)
            hasLoaded = true
            return
        }
        #endif
        do {
            var result: [NativePlanRequest] = []
            var cursor: String?
            repeat {
                var query = [URLQueryItem(name: "connectionId", value: connectionID)]
                if let cursor { query.append(URLQueryItem(name: "cursor", value: cursor)) }
                let response: APIEnvelope<ConversationPlansPage> = try await session.sendAuthorized("api/v1/plans", queryItems: query)
                result.append(contentsOf: response.data.plans)
                cursor = response.data.nextCursor
                try Task.checkCancellation()
            } while cursor != nil
            guard requestID == request else { return }
            plans = Array(Dictionary(result.map { ($0.id, $0) }, uniquingKeysWith: { _, new in new }).values)
            hasLoaded = true
            issue = nil
        } catch is CancellationError {
            return
        } catch {
            guard requestID == request else { return }
            issue = error.localizedDescription
            if case APIClientError.server(let status, _) = error, status == 403 || status == 404 {
                plans = []
                hasLoaded = false
            }
        }
    }
}

struct ConversationPlanBar: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var expandedHeight: CGFloat = 0
    let plan: NativePlanRequest
    let viewerID: String
    let now: Date
    let showsAll: Bool
    let isFocused: Bool
    let hasCurrent: Bool
    var maximumHeight: CGFloat = .infinity
    let onOpen: () -> Void
    let onAll: () -> Void
    let onCurrent: () -> Void

    private var usesCompactLayout: Bool { dynamicTypeSize.isAccessibilitySize || expandedHeight > maximumHeight }
    private var fullTitle: String {
        isFocused && plan.status == "ACCEPTED" && ConversationPlanSelection.isCurrent(plan, at: now)
            ? AppLocalization.string("Viewing · Confirmed")
            : ConversationPlanSelection.title(plan, viewerID: viewerID, now: now)
    }
    private var participant: String { (plan.proposer.id == viewerID ? plan.receiver : plan.proposer).displayName }

    var body: some View {
        Group {
            if usesCompactLayout {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 8) {
                        compactPlanButton.fixedSize(horizontal: true, vertical: true)
                        Spacer(minLength: 0)
                        actions.fixedSize(horizontal: true, vertical: true)
                    }
                    // Keep a single icon action beside a wrapping status. A separate
                    // current-plan action still gets its own row when width is tight.
                    if isFocused && hasCurrent {
                        VStack(alignment: .leading, spacing: 0) {
                            compactPlanButton
                            HStack(spacing: 8) { actions; Spacer(minLength: 0) }
                        }
                    } else {
                        HStack(alignment: .top, spacing: 8) {
                            compactPlanButton.frame(maxWidth: .infinity, alignment: .leading)
                            actions.fixedSize(horizontal: true, vertical: true)
                        }
                    }
                }
                .padding(.horizontal, SideSeatTheme.screenHorizontal)
                .padding(.vertical, 4)
            } else {
                expandedContent
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .background(alignment: .top) {
            // Measure the full summary at this width, independently of the height offered by chat.
            expandedContent.fixedSize(horizontal: false, vertical: true)
                .hidden().accessibilityHidden(true).allowsHitTesting(false)
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { expandedHeight = $0 }
        }
        .background(.bar)
        .overlay(alignment: .bottom) { Divider() }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("conversation-plan-bar")
    }

    private var compactPlanButton: some View {
        Button(action: onOpen) {
            HStack(spacing: 8) {
                Image(systemName: "calendar").font(.system(size: 20)).accessibilityHidden(true)
                Text(ConversationPlanSelection.compactTitle(plan, viewerID: viewerID, now: now))
                    .font(.subheadline.weight(.semibold))
                    .fixedSize(horizontal: false, vertical: true)
                Image(systemName: "chevron.right").font(.system(size: 12)).accessibilityHidden(true)
            }
            .frame(minHeight: 44, alignment: .leading).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(SideSeatTheme.utilityAction)
        .accessibilityLabel([AppLocalization.string("View plans"), fullTitle, plan.title, participant,
                             ConversationPlanSelection.time(plan)].joined(separator: ", "))
        .accessibilityIdentifier("conversation-current-plan")
    }

    private var expandedContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: onOpen) {
                HStack(spacing: 10) {
                    Image(systemName: "calendar").font(.body).dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                        .foregroundStyle(SideSeatTheme.utilityAction)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(fullTitle).font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        Text(plan.title).font(.subheadline.weight(.semibold)).foregroundStyle(SideSeatTheme.textPrimary)
                        Text(ConversationPlanSelection.time(plan)).font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    }
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Image(systemName: "chevron.right").font(.caption)
                        .dynamicTypeSize(...DynamicTypeSize.xxxLarge).foregroundStyle(.secondary)
                }
                .padding(.horizontal, SideSeatTheme.screenHorizontal).padding(.vertical, 8)
                .frame(minHeight: 44).contentShape(Rectangle())
            }
            .buttonStyle(.plain).accessibilityIdentifier("conversation-current-plan")
            if (isFocused && hasCurrent) || showsAll {
                HStack(spacing: 8) { actions; Spacer(minLength: 0) }
                    .padding(.horizontal, SideSeatTheme.screenHorizontal)
            }
        }
    }

    @ViewBuilder private var actions: some View {
        if isFocused && hasCurrent {
            Button(action: onCurrent) {
                Text(AppLocalization.string("Current plan (compact)"))
                    .font(.caption.weight(.medium)).fixedSize(horizontal: false, vertical: true)
                    .frame(minHeight: 44).contentShape(Rectangle())
            }
            .buttonStyle(.plain).foregroundStyle(SideSeatTheme.utilityAction)
            .accessibilityLabel(AppLocalization.string("View current plans"))
            .accessibilityIdentifier("conversation-view-current")
        }
        if showsAll {
            Menu {
                Button("View plans", action: onAll).accessibilityIdentifier("conversation-all-plans")
            } label: {
                Image(systemName: "ellipsis").font(.system(size: 20))
                    .frame(width: 44, height: 44).contentShape(Rectangle())
            }
            .foregroundStyle(SideSeatTheme.utilityAction)
            .accessibilityLabel(AppLocalization.string("More plan actions"))
            .accessibilityIdentifier("conversation-plan-menu")
        }
    }
}

struct ConversationPlansSheet: View {
    @Environment(\.dismiss) private var dismiss
    let groups: [ConversationPlanGroup]
    let viewerID: String
    let now: Date
    let onSelect: (NativePlanRequest) -> Void

    var body: some View {
        NavigationStack {
            List {
                ForEach([0, 1, 2], id: \.self) { rank in
                    let matching = groups.filter { ConversationPlanSelection.rank($0.primary, viewerID: viewerID) == rank }
                    if !matching.isEmpty {
                        Section(AppLocalization.string(rank == 0 ? "Waiting for your reply" : rank == 1 ? "Confirmed" : "Awaiting their response")) {
                            ForEach(matching) { group in
                                VStack(alignment: .leading, spacing: 8) {
                                    ForEach(group.plans) { plan in
                                        Button {
                                            dismiss()
                                            onSelect(plan)
                                        } label: {
                                            VStack(alignment: .leading, spacing: 4) {
                                                Text(plan.title).font(.headline)
                                                if group.plans.count > 1 {
                                                    Text(plan.status == "ACCEPTED" ? "Confirmed time" : "Proposed new time")
                                                        .font(.caption.weight(.semibold))
                                                }
                                                Text(ConversationPlanSelection.time(plan)).font(.subheadline)
                                                if let location = plan.location, !location.isEmpty { Text(location).font(.footnote) }
                                            }
                                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                                            .contentShape(Rectangle())
                                        }.buttonStyle(.plain)
                                        .accessibilityIdentifier("conversation-select-plan-\(plan.id)")
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Your plans together").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .ssFlowSheet(isSaving: false)
    }
}
