import SwiftUI

/// Hub / settings-style row: tinted icon block + title + subtitle + chevron.
struct SSListRow: View {
    let title: String
    let subtitle: String
    let systemImage: String
    let tint: Color
    var showDivider: Bool = true
    var accessibilityID: String? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(
                title: title,
                subtitle: subtitle,
                systemImage: systemImage,
                tint: tint,
                showDivider: showDivider,
                accessibilityID: accessibilityID
            )
        }
        .buttonStyle(SSPressButtonStyle())
        .ssAccessibilityIdentifier(accessibilityID)
    }
}

extension SSListRow {
    /// Visual chrome without the outer `Button` (for custom wrappers).
    struct Label: View {
        let title: String
        let subtitle: String
        let systemImage: String
        let tint: Color
        var showDivider: Bool = true
        var accessibilityID: String? = nil

        var body: some View {
            VStack(spacing: 0) {
                HStack(spacing: SideSeatTheme.spaceMD) {
                    ZStack {
                        Circle()
                            .fill(
                                LinearGradient(
                                    colors: [tint.opacity(0.22), tint.opacity(0.10)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                        Image(systemName: systemImage)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(tint)
                    }
                    .frame(width: 40, height: 40)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(title)
                            .font(.body.weight(.semibold))
                            .foregroundStyle(SideSeatTheme.textPrimary)
                            .ssAccessibilityIdentifier(accessibilityID.map { "\($0)-title-visual" })
                        Text(subtitle)
                            .font(.footnote.weight(.medium))
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                            .fixedSize(horizontal: false, vertical: true)
                            .ssAccessibilityIdentifier(accessibilityID.map { "\($0)-subtitle-visual" })
                    }
                    .layoutPriority(1)

                    Spacer(minLength: SideSeatTheme.spaceSM)

                    Image(systemName: "chevron.right")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.tertiary)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 13)

                if showDivider {
                    Divider()
                        .padding(.leading, 66)
                }
            }
            .contentShape(Rectangle())
        }
    }
}

/// Neutral management row for Me / Settings / campus and safety screens.
/// Icons are deliberately quiet; Rose is reserved for interaction rather than category decoration.
struct SSManagementRow: View {
    let title: String
    var subtitle: String? = nil
    var value: String? = nil
    var systemImage: String? = nil
    var showsChevron = true
    var showDivider = true
    var accessibilityID: String? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 0) {
                HStack(spacing: SideSeatTheme.spaceMD) {
                    if let systemImage {
                        Image(systemName: systemImage)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                            .frame(width: 32, height: 32)
                            .background(
                                SideSeatTheme.fillTertiary,
                                in: RoundedRectangle(cornerRadius: 8, style: .continuous)
                            )
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text(title)
                            .font(.body.weight(.medium))
                            .foregroundStyle(SideSeatTheme.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)

                        if let subtitle, !subtitle.isEmpty {
                            Text(subtitle)
                                .font(.footnote)
                                .foregroundStyle(SideSeatTheme.textSecondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .layoutPriority(1)

                    Spacer(minLength: SideSeatTheme.spaceSM)

                    if let value, !value.isEmpty {
                        Text(value)
                            .font(.subheadline)
                            .foregroundStyle(SideSeatTheme.textSecondary)
                            .multilineTextAlignment(.trailing)
                            .lineLimit(2)
                    }

                    if showsChevron {
                        Image(systemName: "chevron.right")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.tertiary)
                    }
                }
                .padding(.horizontal, SideSeatTheme.spaceLG)
                .padding(.vertical, SideSeatTheme.spaceMD)
                .frame(minHeight: 56)

                if showDivider {
                    Divider()
                        .padding(.leading, systemImage == nil ? SideSeatTheme.spaceLG : 60)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .ssAccessibilityIdentifier(accessibilityID)
    }
}

enum SSInlineStatusTone: Sendable {
    case neutral
    case success
    case warning
    case danger
    case trust

    fileprivate var foreground: Color {
        switch self {
        case .neutral: SideSeatTheme.textSecondaryStrong
        case .success: SideSeatTheme.statusSuccessText
        case .warning: SideSeatTheme.statusWarningText
        case .danger: SideSeatTheme.statusDangerText
        case .trust: SideSeatTheme.verifiedSeal
        }
    }
}

/// Compact semantic state label. It stays inline instead of becoming a decorative badge/card.
struct SSInlineStatus: View {
    let text: String
    var systemImage: String? = nil
    var tone: SSInlineStatusTone = .neutral
    var accessibilityID: String? = nil

    var body: some View {
        HStack(spacing: 5) {
            if let systemImage {
                Image(systemName: systemImage)
                    .imageScale(.small)
            }
            Text(text)
                .fixedSize(horizontal: false, vertical: true)
        }
        .font(.footnote.weight(.semibold))
        .foregroundStyle(tone.foreground)
        .accessibilityElement(children: .combine)
        .ssAccessibilityIdentifier(accessibilityID)
    }
}

/// Product-level verification mark. Trust blue is reserved for identity verification and never
/// inherits the Rose interaction accent.
struct SSVerifiedSeal: View {
    var label: String = "Verified"
    var compact = true
    var accessibilityID: String? = nil

    var body: some View {
        HStack(spacing: compact ? 4 : 6) {
            Image(systemName: "checkmark.seal.fill")
                .font(compact ? .caption : .subheadline)
            Text(label)
                .font(compact ? .caption.weight(.semibold) : .subheadline.weight(.semibold))
                .fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(SideSeatTheme.verifiedSeal)
        .accessibilityElement(children: .combine)
        .ssAccessibilityIdentifier(accessibilityID)
    }
}
