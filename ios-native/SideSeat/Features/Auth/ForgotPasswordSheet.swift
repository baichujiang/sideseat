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
            .navigationTitle(AppLocalization.string( "Reset password"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(AppLocalization.string( "Cancel")) { dismiss() }
                }
            }
            .onAppear { focusedField = .email }
            .onDisappear { resendTickTask?.cancel() }
        }
    }

    private var stepTitle: String {
        switch step {
        case .email:
            AppLocalization.string( "Forgot your password?")
        case .reset:
            AppLocalization.string( "Enter the code")
        }
    }

    private var stepSubtitle: String {
        switch step {
        case .email:
            AppLocalization.string( "We'll email a 6-digit code if an account exists for that address.")
        case .reset:
            AppLocalization.string( "Check your inbox, then choose a new password.")
        }
    }

    private var emailStep: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceLG) {
            SSTextField(
                title: AppLocalization.string( "Email"),
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
                title: AppLocalization.string( "Send code"),
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
                title: AppLocalization.string( "Verification code"),
                text: $code,
                contentType: .oneTimeCode,
                keyboard: .numberPad,
                submitLabel: .next,
                accessibilityID: "forgot-code"
            )
            .focused($focusedField, equals: .code)

            SSSecureField(
                title: AppLocalization.string( "New password"),
                text: $password,
                isVisible: $isPasswordVisible,
                contentType: .newPassword,
                submitLabel: .next,
                isFocused: focusBinding(for: .password),
                accessibilityID: "forgot-password",
                onSubmit: { focusedField = .confirm }
            )
            .focused($focusedField, equals: .password)

            SSSecureField(
                title: AppLocalization.string( "Confirm new password"),
                text: $confirmPassword,
                isVisible: $isPasswordVisible,
                contentType: .newPassword,
                submitLabel: .go,
                isFocused: focusBinding(for: .confirm),
                accessibilityID: "forgot-confirm-password",
                onSubmit: resetPassword
            )
            .focused($focusedField, equals: .confirm)

            feedbackBlock

            SSPrimaryButton(
                title: AppLocalization.string( "Reset & log in"),
                isLoading: isWorking || session.isWorking,
                fill: .brand,
                accessibilityID: "forgot-reset-submit",
                action: resetPassword
            )
            .disabled(!canReset || isWorking || session.isWorking)

            Button(action: resendCode) {
                if resendSecondsRemaining > 0 {
                    Text(AppLocalization.string( "Resend code in \(resendSecondsRemaining)s"))
                } else {
                    Text(AppLocalization.string( "Resend code"))
                        .fontWeight(.medium)
                }
            }
            .buttonStyle(SSPressButtonStyle())
            .foregroundStyle(
                resendSecondsRemaining > 0 ? SideSeatTheme.textSecondary : SideSeatTheme.textPrimary
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

    private func focusBinding(for field: Field) -> Binding<Bool> {
        Binding(
            get: { focusedField == field },
            set: { isFocused in
                if isFocused {
                    focusedField = field
                } else if focusedField == field {
                    focusedField = nil
                }
            }
        )
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
            statusMessage = AppLocalization.string( "If an account exists, a code is on its way.")
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
            statusMessage = AppLocalization.string( "Code resent.")
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
            issue = AppLocalization.string( "Passwords do not match.")
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
