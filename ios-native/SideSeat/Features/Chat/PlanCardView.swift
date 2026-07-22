import SwiftUI

struct PlanCardView: View {
    let plan: NativePlanRequest
    let currentUserID: String
    let isActing: Bool
    let onAccept: () -> Void
    let onDecline: () -> Void
    let onCounter: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(statusLabel)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(plan.title)
                .font(.body.weight(.semibold))
            if let start = plan.startDate, let end = plan.endDate {
                Text("\(start.formatted(date: .abbreviated, time: .shortened)) – \(end.formatted(date: .omitted, time: .shortened))")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            if let location = plan.location?.trimmingCharacters(in: .whitespacesAndNewlines), !location.isEmpty {
                Label(location, systemImage: "mappin.and.ellipse")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            if let note = plan.message?.trimmingCharacters(in: .whitespacesAndNewlines), !note.isEmpty {
                Text(note)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            if canRespond {
                HStack(spacing: 8) {
                    Button("Accept", action: onAccept)
                        .buttonStyle(.borderedProminent)
                        .controlSize(.small)
                        .disabled(isActing)
                    Button("Decline", action: onDecline)
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .disabled(isActing)
                    Button("Suggest", action: onCounter)
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .disabled(isActing)
                }
                .padding(.top, 2)
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("plan-card-actions-\(plan.id)")
            }
        }
        .padding(12)
        .frame(maxWidth: 280, alignment: .leading)
        .background(SideSeatTheme.Chat.peerBubble, in: RoundedRectangle(cornerRadius: SideSeatTheme.Chat.bubbleRadius, style: .continuous))
        .accessibilityIdentifier("plan-card-\(plan.id)")
    }

    private var canRespond: Bool {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            return plan.isPending
        }
        #endif
        return plan.isPending && plan.receiver.id == currentUserID
    }

    private var statusLabel: String {
        switch plan.status {
        case "PENDING": return String(localized: "Plan invite")
        case "ACCEPTED": return String(localized: "Plan confirmed")
        case "DECLINED": return String(localized: "Declined")
        case "COUNTER_PROPOSED": return String(localized: "Another time suggested")
        default: return String(localized: "Plan")
        }
    }
}
