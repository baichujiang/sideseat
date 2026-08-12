import SwiftUI

struct PlanCardView: View {
    let plan: NativePlanRequest
    let currentUserID: String
    let isActing: Bool
    let onAccept: () -> Void
    let onDecline: () -> Void
    let onCounter: () -> Void
    let onOpenCalendar: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: statusIcon)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(statusTint)
                    .frame(width: 26, height: 26)
                    .background(statusTint.opacity(0.12), in: Circle())
                Text(statusLabel)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(statusTint)
                Spacer(minLength: 6)
                if plan.counterOfId != nil {
                    Text("New time")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
            }

            Text(plan.title)
                .font(.body.weight(.semibold))
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)

            VStack(alignment: .leading, spacing: 7) {
                if let start = plan.startDate, let end = plan.endDate {
                    Label {
                        Text("\(start.formatted(date: .abbreviated, time: .shortened)) · \(end.formatted(date: .omitted, time: .shortened))")
                    } icon: {
                        Image(systemName: "calendar")
                    }
                }
                if let location = plan.location?.trimmingCharacters(in: .whitespacesAndNewlines), !location.isEmpty {
                    Label(location, systemImage: "mappin.and.ellipse")
                }
            }
            .font(.footnote)
            .foregroundStyle(.secondary)

            if let note = plan.message?.trimmingCharacters(in: .whitespacesAndNewlines), !note.isEmpty {
                Text(note)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Divider()

            if canRespond {
                Text("Accepting adds this plan to both calendars.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: 8) {
                    Button(action: onAccept) {
                        Label("Accept", systemImage: "checkmark")
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                    .disabled(isActing)

                    Button(action: onCounter) {
                        Label("New time", systemImage: "arrow.triangle.2.circlepath")
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .disabled(isActing)

                    Button(role: .destructive, action: onDecline) {
                        Image(systemName: "xmark")
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .disabled(isActing)
                    .accessibilityLabel("Decline")
                }
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("plan-card-actions-\(plan.id)")
            } else if plan.status == "PENDING" {
                Label(
                    plan.proposer.id == currentUserID
                        ? String(localized: "Waiting for a response")
                        : String(localized: "Response pending"),
                    systemImage: "hourglass"
                )
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
            } else if plan.status == "ACCEPTED" {
                HStack(spacing: 8) {
                    Label("Added to both calendars", systemImage: "calendar.badge.checkmark")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.success)
                    Spacer(minLength: 4)
                    Button(action: onOpenCalendar) {
                        Image(systemName: "arrow.up.right")
                            .font(.caption.weight(.bold))
                            .frame(width: 28, height: 28)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .accessibilityLabel("View calendar")
                }
            } else {
                Text(statusDetail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(12)
        .frame(maxWidth: 300, alignment: .leading)
        .background(
            SideSeatTheme.Chat.peerBubble,
            in: RoundedRectangle(cornerRadius: SideSeatTheme.Chat.bubbleRadius, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SideSeatTheme.Chat.bubbleRadius, style: .continuous)
                .strokeBorder(statusTint.opacity(0.16), lineWidth: 1)
        )
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
        case "DECLINED": return String(localized: "Plan declined")
        case "COUNTER_PROPOSED": return String(localized: "Another time suggested")
        default: return String(localized: "Plan")
        }
    }

    private var statusDetail: String {
        switch plan.status {
        case "DECLINED": return String(localized: "This plan was declined.")
        case "COUNTER_PROPOSED": return String(localized: "A new time was proposed in the chat.")
        default: return String(localized: "This plan is no longer active.")
        }
    }

    private var statusIcon: String {
        switch plan.status {
        case "ACCEPTED": "checkmark.circle.fill"
        case "DECLINED": "xmark.circle.fill"
        case "COUNTER_PROPOSED": "arrow.triangle.2.circlepath"
        default: "calendar.badge.clock"
        }
    }

    private var statusTint: Color {
        switch plan.status {
        case "ACCEPTED": SideSeatTheme.success
        case "DECLINED": SideSeatTheme.danger
        case "COUNTER_PROPOSED": SideSeatTheme.warning
        default: SideSeatTheme.warning
        }
    }
}
