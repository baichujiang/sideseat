import SwiftUI

struct SignupSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    var onSignedUp: (String, String) -> Void

    @State private var username = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var isPasswordVisible = false
    @State private var issue: String?
    @State private var isWorking = false
    @FocusState private var focusedField: Field?

    private enum Field {
        case username
        case password
        case confirm
    }

    var body: some View {
        NavigationStack {
            SSScreen(surface: .brand) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        Text(String(localized: "Create your SideSeat"))
                            .font(SideSeatTheme.Text.title)
                        Text(String(localized: "Pick a username and password to get started."))
                            .font(.subheadline)
                            .foregroundStyle(SideSeatTheme.textSecondary)

                        SSTextField(
                            title: String(localized: "Username"),
                            text: $username,
                            contentType: .username,
                            submitLabel: .next,
                            accessibilityID: "signup-username"
                        )
                        .focused($focusedField, equals: .username)
                        .onSubmit { focusedField = .password }

                        SSSecureField(
                            title: String(localized: "Password"),
                            text: $password,
                            isVisible: $isPasswordVisible,
                            submitLabel: .next,
                            accessibilityID: "signup-password"
                        )
                        .focused($focusedField, equals: .password)
                        .onSubmit { focusedField = .confirm }

                        SSSecureField(
                            title: String(localized: "Confirm password"),
                            text: $confirmPassword,
                            isVisible: $isPasswordVisible,
                            submitLabel: .go,
                            accessibilityID: "signup-confirm-password"
                        )
                        .focused($focusedField, equals: .confirm)
                        .onSubmit(submit)

                        if let issue {
                            SSFieldMessage(text: issue, accessibilityID: "signup-error")
                        }

                        SSPrimaryButton(
                            title: String(localized: "Create account"),
                            isLoading: isWorking || session.isWorking,
                            fill: .brand,
                            accessibilityID: "signup-submit",
                            action: submit
                        )
                        .disabled(!canSubmit || isWorking || session.isWorking)
                    }
                    .padding(22)
                    .padding(.top, SideSeatTheme.spaceSM)
                }
                .scrollDismissesKeyboard(.interactively)
            }
            .navigationTitle(String(localized: "Sign up"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "Cancel")) { dismiss() }
                }
            }
            .onAppear { focusedField = .username }
        }
    }

    private var canSubmit: Bool {
        !username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && password.count >= 8
            && password == confirmPassword
    }

    private func submit() {
        issue = nil
        if let usernameIssue = AuthFieldValidation.usernameIssue(username) {
            issue = usernameIssue
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
            let normalized = AuthFieldValidation.normalizeUsername(username)
            if let error = await session.signup(username: normalized, password: password) {
                issue = error
                isWorking = false
                return
            }
            onSignedUp(normalized, password)
            isWorking = false
            dismiss()
        }
    }
}
