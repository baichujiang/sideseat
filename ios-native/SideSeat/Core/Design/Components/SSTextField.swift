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
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
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
    var submitLabel: UIReturnKeyType = .go
    let isFocused: Binding<Bool>
    var accessibilityID: String
    var onSubmit: () -> Void = {}

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
            HStack(spacing: SideSeatTheme.spaceSM) {
                SSPreservingSecureTextField(
                    title: title,
                    text: $text,
                    isSecure: !isVisible,
                    contentType: contentType,
                    returnKeyType: submitLabel,
                    isFocused: isFocused,
                    accessibilityID: accessibilityID,
                    onSubmit: onSubmit
                )

                Button {
                    isVisible.toggle()
                } label: {
                    Image(systemName: isVisible ? "eye.slash.fill" : "eye.fill")
                        .font(.body)
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(SSPressButtonStyle())
                .accessibilityLabel(
                    isVisible
                        ? AppLocalization.string( "Hide password")
                        : AppLocalization.string( "Show password")
                )
                .accessibilityIdentifier("\(accessibilityID)-visibility")
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 5)
            .background(SSFieldChrome())
        }
    }
}

/// Keeps secure text intact when editing resumes after a failed authentication attempt.
private struct SSPreservingSecureTextField: UIViewRepresentable {
    let title: String
    @Binding var text: String
    let isSecure: Bool
    let contentType: UITextContentType
    let returnKeyType: UIReturnKeyType
    let isFocused: Binding<Bool>
    let accessibilityID: String
    let onSubmit: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    func makeUIView(context: Context) -> UITextField {
        let textField = UITextField()
        textField.delegate = context.coordinator
        textField.addTarget(
            context.coordinator,
            action: #selector(Coordinator.textDidChange(_:)),
            for: .editingChanged
        )
        textField.backgroundColor = .clear
        textField.font = UIFont.preferredFont(forTextStyle: .body)
        textField.adjustsFontForContentSizeCategory = true
        textField.textColor = .label
        textField.tintColor = .tintColor
        textField.autocapitalizationType = .none
        textField.autocorrectionType = .no
        textField.spellCheckingType = .no
        textField.smartQuotesType = .no
        textField.smartDashesType = .no
        textField.smartInsertDeleteType = .no
        textField.clearsOnBeginEditing = false
        textField.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        textField.setContentHuggingPriority(.defaultLow, for: .horizontal)
        configure(textField, preservingSelection: false)
        return textField
    }

    func updateUIView(_ textField: UITextField, context: Context) {
        context.coordinator.parent = self
        configure(textField, preservingSelection: true)
        context.coordinator.updateFocus(of: textField)
    }

    private func configure(_ textField: UITextField, preservingSelection: Bool) {
        let selection = preservingSelection ? textField.selectedTextRange : nil
        let secureEntryChanged = textField.isSecureTextEntry != isSecure

        textField.textContentType = contentType
        textField.returnKeyType = returnKeyType
        textField.enablesReturnKeyAutomatically = true
        textField.accessibilityLabel = title
        textField.accessibilityIdentifier = accessibilityID
        textField.attributedPlaceholder = NSAttributedString(
            string: title,
            attributes: [.foregroundColor: UIColor.placeholderText]
        )

        if secureEntryChanged {
            textField.isSecureTextEntry = isSecure
        }
        if textField.text != text || secureEntryChanged {
            textField.text = text
        }
        if let selection {
            textField.selectedTextRange = selection
        }
    }

    @MainActor
    final class Coordinator: NSObject, UITextFieldDelegate {
        var parent: SSPreservingSecureTextField

        init(parent: SSPreservingSecureTextField) {
            self.parent = parent
        }

        @objc func textDidChange(_ textField: UITextField) {
            let value = textField.text ?? ""
            if parent.text != value {
                parent.text = value
            }
        }

        func textFieldDidBeginEditing(_ textField: UITextField) {
            if !parent.isFocused.wrappedValue {
                parent.isFocused.wrappedValue = true
            }
        }

        func textFieldDidEndEditing(_ textField: UITextField) {
            if parent.isFocused.wrappedValue {
                parent.isFocused.wrappedValue = false
            }
        }

        func textFieldShouldReturn(_ textField: UITextField) -> Bool {
            parent.onSubmit()
            return false
        }

        func updateFocus(of textField: UITextField) {
            if parent.isFocused.wrappedValue, !textField.isFirstResponder {
                if textField.window != nil {
                    textField.becomeFirstResponder()
                } else {
                    Task { @MainActor [weak self, weak textField] in
                        await Task.yield()
                        guard let self, let textField,
                              self.parent.isFocused.wrappedValue,
                              textField.window != nil
                        else { return }
                        textField.becomeFirstResponder()
                    }
                }
            } else if !parent.isFocused.wrappedValue, textField.isFirstResponder {
                textField.resignFirstResponder()
            }
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
