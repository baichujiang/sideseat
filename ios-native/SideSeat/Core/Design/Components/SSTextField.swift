import SwiftUI

/// Labeled text field with SideSeat control chrome.
struct SSTextField: View {
    let title: String
    var placeholder: String? = nil
    @Binding var text: String
    var contentType: UITextContentType? = nil
    var keyboard: UIKeyboardType = .default
    var submitLabel: SubmitLabel = .next
    var accessibilityID: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(SideSeatTheme.placeholderText)
            TextField(
                title,
                text: $text,
                prompt: Text(placeholder ?? title).foregroundStyle(SideSeatTheme.placeholderText)
            )
                .textContentType(contentType)
                .keyboardType(keyboard)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(submitLabel)
                .accessibilityLabel(title)
                .accessibilityIdentifier(accessibilityID)
                .padding(.horizontal, 14)
                .padding(.vertical, 13)
                .background(SSFieldChrome())
        }
    }
}

/// Password field with show/hide toggle.
struct SSSecureField: View {
    let title: String
    @Binding var text: String
    @Binding var isVisible: Bool
    var contentType: UITextContentType = .password
    var submitLabel: SubmitLabel = .go
    var accessibilityID: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(SideSeatTheme.placeholderText)
            HStack(spacing: SideSeatTheme.spaceSM) {
                Group {
                    if isVisible {
                        TextField(
                            title,
                            text: $text,
                            prompt: Text(title).foregroundStyle(SideSeatTheme.placeholderText)
                        )
                    } else {
                        SecureField(
                            title,
                            text: $text,
                            prompt: Text(title).foregroundStyle(SideSeatTheme.placeholderText)
                        )
                    }
                }
                .textContentType(contentType)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(submitLabel)
                .accessibilityIdentifier(accessibilityID)

                Button {
                    isVisible.toggle()
                } label: {
                    Image(systemName: isVisible ? "eye.slash.fill" : "eye.fill")
                        .font(.body)
                        .foregroundStyle(SideSeatTheme.textSecondary)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(
                    isVisible
                        ? String(localized: "Hide password")
                        : String(localized: "Show password")
                )
                .accessibilityIdentifier("\(accessibilityID)-visibility")
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 5)
            .background(SSFieldChrome())
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
