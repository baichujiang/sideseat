import SwiftUI

/// Labeled text field with SideSeat control chrome.
struct SSTextField: View {
    let title: String
    @Binding var text: String
    var contentType: UITextContentType? = nil
    var keyboard: UIKeyboardType = .default
    var submitLabel: SubmitLabel = .next
    var accessibilityID: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(SideSeatTheme.textSecondary)
            TextField(title, text: $text)
                .textContentType(contentType)
                .keyboardType(keyboard)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(submitLabel)
                .padding(.horizontal, 14)
                .padding(.vertical, 13)
                .background(SSFieldChrome())
                .accessibilityIdentifier(accessibilityID)
        }
    }
}

/// Password field with show/hide toggle.
struct SSSecureField: View {
    let title: String
    @Binding var text: String
    @Binding var isVisible: Bool
    var submitLabel: SubmitLabel = .go
    var accessibilityID: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(SideSeatTheme.textSecondary)
            HStack(spacing: SideSeatTheme.spaceSM) {
                Group {
                    if isVisible {
                        TextField(title, text: $text)
                    } else {
                        SecureField(title, text: $text)
                    }
                }
                .textContentType(.password)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(submitLabel)

                Button {
                    isVisible.toggle()
                } label: {
                    Image(systemName: isVisible ? "eye.slash.fill" : "eye.fill")
                        .font(.body)
                        .foregroundStyle(SideSeatTheme.textSecondary)
                        .frame(width: 28, height: 28)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(
                    isVisible
                        ? String(localized: "Hide password")
                        : String(localized: "Show password")
                )
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 13)
            .background(SSFieldChrome())
            .accessibilityIdentifier(accessibilityID)
        }
    }
}

/// Footnote status under forms (validation / success).
struct SSFieldMessage: View {
    enum Kind {
        case error
        case success
    }

    let text: String
    var kind: Kind = .error
    var accessibilityID: String? = nil

    var body: some View {
        Label(
            text,
            systemImage: kind == .error ? "exclamationmark.circle.fill" : "checkmark.circle.fill"
        )
        .font(SideSeatTheme.Text.footnote)
        .foregroundStyle(kind == .error ? SideSeatTheme.danger : SideSeatTheme.success)
        .ssAccessibilityIdentifier(accessibilityID)
    }
}

private struct SSFieldChrome: View {
    var body: some View {
        RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
            .fill(SideSeatTheme.fillTertiary)
    }
}
