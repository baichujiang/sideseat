import SwiftUI

struct ForgotPasswordSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    var onReset: (String, String) -> Void

    @State private var step: Step = .email
    @State private var email = ""
    @State private var code = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var isPasswordVisible = false
    @State private var issue: String?
    @State private var statusMessage: String?
    @State private var isWorking = false
    @State private var resendSecondsRemaining = 0
    @State private var resendTickTask: Task<Void, Never>?
    @FocusState private var focusedField: Field?

    private enum Step {
        case email
        case reset
    }

    private enum Field {
        case email
        case code
        case password
        case confirm
    }

    var body: some View {
        NavigationStack {
            SSScreen(surface: .brand) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        Text(stepTitle)
                            .font(SideSeatTheme.Text.title)
                        Text(stepSubtitle)
                            .font(.subheadline)
                            .foregroundStyle(SideSeatTheme.textSecondary)

                        switch step {
                        case .email:
                            emailStep
                        case .reset:
                            resetStep
                        }
                    }
                    .padding(22)
                    .padding(.top, SideSeatTheme.spaceSM)
                    .animation(.easeInOut(duration: 0.22), value: step)
                }
                .scrollDismissesKeyboard(.interactively)
            }
            .navigationTitle(String(localized: "Reset password"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "Cancel")) { dismiss() }
                }
            }
            .onAppear { focusedField = .email }
            .onDisappear { resendTickTask?.cancel() }
        }
    }

    private var stepTitle: String {
        switch step {
        case .email:
            String(localized: "Forgot your password?")
        case .reset:
            String(localized: "Enter the code")
        }
    }

    private var stepSubtitle: String {
        switch step {
        case .email:
            String(localized: "We'll email a 6-digit code if an account exists for that address.")
        case .reset:
            String(localized: "Check your inbox, then choose a new password.")
        }
    }

    private var emailStep: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceLG) {
            SSTextField(
                title: String(localized: "Email"),
                text: $email,
                contentType: .emailAddress,
                keyboard: .emailAddress,
                submitLabel: .go,
                accessibilityID: "forgot-email"
            )
            .focused($focusedField, equals: .email)
            .onSubmit(sendCode)

            feedbackBlock

            SSPrimaryButton(
                title: String(localized: "Send code"),
                isLoading: isWorking,
                fill: .brand,
                accessibilityID: "forgot-send-code",
                action: sendCode
            )
            .disabled(!canSendCode || isWorking)
        }
    }

    private var resetStep: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceLG) {
            SSTextField(
                title: String(localized: "Verification code"),
                text: $code,
                contentType: .oneTimeCode,
                keyboard: .numberPad,
                submitLabel: .next,
                accessibilityID: "forgot-code"
            )
            .focused($focusedField, equals: .code)

            SSSecureField(
                title: String(localized: "New password"),
                text: $password,
                isVisible: $isPasswordVisible,
                submitLabel: .next,
                accessibilityID: "forgot-password"
            )
            .focused($focusedField, equals: .password)
            .onSubmit { focusedField = .confirm }

            SSSecureField(
                title: String(localized: "Confirm new password"),
                text: $confirmPassword,
                isVisible: $isPasswordVisible,
                submitLabel: .go,
                accessibilityID: "forgot-confirm-password"
            )
            .focused($focusedField, equals: .confirm)
            .onSubmit(resetPassword)

            feedbackBlock

            SSPrimaryButton(
                title: String(localized: "Reset & log in"),
                isLoading: isWorking || session.isWorking,
                fill: .brand,
                accessibilityID: "forgot-reset-submit",
                action: resetPassword
            )
            .disabled(!canReset || isWorking || session.isWorking)

            Button(action: resendCode) {
                if resendSecondsRemaining > 0 {
                    Text(String(localized: "Resend code in \(resendSecondsRemaining)s"))
                } else {
                    Text(String(localized: "Resend code"))
                        .fontWeight(.medium)
                }
            }
            .buttonStyle(.plain)
            .foregroundStyle(
                resendSecondsRemaining > 0 ? SideSeatTheme.textSecondary : SideSeatTheme.accent
            )
            .disabled(resendSecondsRemaining > 0 || isWorking)
            .frame(maxWidth: .infinity)
            .accessibilityIdentifier("forgot-resend-code")
        }
    }

    @ViewBuilder
    private var feedbackBlock: some View {
        if let issue {
            SSFieldMessage(text: issue, accessibilityID: "forgot-error")
        } else if let statusMessage {
            SSFieldMessage(text: statusMessage, kind: .success, accessibilityID: "forgot-status")
        }
    }

    private var canSendCode: Bool {
        AuthFieldValidation.emailIssue(email) == nil
    }

    private var canReset: Bool {
        AuthFieldValidation.otpIssue(code) == nil
            && AuthFieldValidation.passwordIssue(password) == nil
            && password == confirmPassword
    }

    private func sendCode() {
        issue = nil
        statusMessage = nil
        if let emailIssue = AuthFieldValidation.emailIssue(email) {
            issue = emailIssue
            return
        }
        isWorking = true
        Task {
            if let error = await session.sendPasswordResetOTP(email: email) {
                issue = error
                isWorking = false
                return
            }
            statusMessage = String(localized: "If an account exists, a code is on its way.")
            step = .reset
            startResendCooldown()
            focusedField = .code
            isWorking = false
        }
    }

    private func resendCode() {
        guard resendSecondsRemaining == 0 else { return }
        issue = nil
        statusMessage = nil
        isWorking = true
        Task {
            if let error = await session.sendPasswordResetOTP(email: email) {
                issue = error
                isWorking = false
                return
            }
            statusMessage = String(localized: "Code resent.")
            startResendCooldown()
            isWorking = false
        }
    }

    private func resetPassword() {
        issue = nil
        statusMessage = nil
        if let otpIssue = AuthFieldValidation.otpIssue(code) {
            issue = otpIssue
            return
        }
        if let passwordIssue = AuthFieldValidation.passwordIssue(password) {
            issue = passwordIssue
            return
        }
        if password != confirmPassword {
            issue = String(localized: "Passwords do not match.")
            return
        }

        isWorking = true
        Task {
            let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if let error = await session.resetPassword(
                email: normalizedEmail,
                code: code,
                password: password,
                confirmPassword: confirmPassword
            ) {
                issue = error
                isWorking = false
                return
            }
            onReset(normalizedEmail, password)
            isWorking = false
            dismiss()
        }
    }

    private func startResendCooldown(seconds: Int = 60) {
        resendTickTask?.cancel()
        resendSecondsRemaining = seconds
        resendTickTask = Task { @MainActor in
            while resendSecondsRemaining > 0 {
                try? await Task.sleep(for: .seconds(1))
                if Task.isCancelled { return }
                resendSecondsRemaining -= 1
            }
        }
    }
}
