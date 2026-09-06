import SwiftUI

struct SignupSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    var onSignedUp: (String, String) -> Void

    @State private var displayName = ""
    @State private var username = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var school = "TUM"
    @State private var studentStatus = "CURRENT_STUDENT"
    @State private var degreeLevel = "BACHELOR"
    @State private var semester = 1
    @State private var graduationYear = Calendar.current.component(.year, from: Date())
    @State private var isPasswordVisible = false
    @State private var isConfirmPasswordVisible = false
    @State private var issue: String?
    @State private var isWorking = false
    @FocusState private var focusedField: Field?

    private enum Field {
        case displayName
        case username
        case password
        case confirm
    }

    var body: some View {
        NavigationStack {
            SSScreen(surface: .brand) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        Text(AppLocalization.string( "Create your SideSeat"))
                            .font(SideSeatTheme.Text.title)
                        Text(AppLocalization.string( "Create your account and add the school identity shown on your posts."))
                            .font(.subheadline)
                            .foregroundStyle(SideSeatTheme.textSecondary)

                        SSTextField(
                            title: AppLocalization.string( "Nickname"),
                            text: $displayName,
                            contentType: .nickname,
                            submitLabel: .next,
                            accessibilityID: "signup-display-name"
                        )
                        .focused($focusedField, equals: .displayName)
                        .onSubmit { focusedField = .username }

                        SSTextField(
                            title: AppLocalization.string( "Username"),
                            text: $username,
                            contentType: .username,
                            submitLabel: .next,
                            accessibilityID: "signup-username"
                        )
                        .focused($focusedField, equals: .username)
                        .onSubmit { focusedField = .password }

                        SSSecureField(
                            title: AppLocalization.string( "Password"),
                            text: $password,
                            isVisible: $isPasswordVisible,
                            contentType: .newPassword,
                            submitLabel: .next,
                            isFocused: focusBinding(for: .password),
                            accessibilityID: "signup-password",
                            onSubmit: { focusedField = .confirm }
                        )
                        .focused($focusedField, equals: .password)

                        SSSecureField(
                            title: AppLocalization.string( "Confirm password"),
                            text: $confirmPassword,
                            isVisible: $isConfirmPasswordVisible,
                            contentType: .newPassword,
                            submitLabel: .go,
                            isFocused: focusBinding(for: .confirm),
                            accessibilityID: "signup-confirm-password",
                            onSubmit: submit
                        )
                        .focused($focusedField, equals: .confirm)

                        VStack(alignment: .leading, spacing: SideSeatTheme.spaceMD) {
                            Label(AppLocalization.string( "School identity"), systemImage: "graduationcap.fill")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(SideSeatTheme.textPrimary)

                            Picker(AppLocalization.string( "School"), selection: $school) {
                                Text("TUM").tag("TUM")
                                Text("LMU").tag("LMU")
                            }
                            .pickerStyle(.segmented)
                            .accessibilityIdentifier("signup-school")

                            Picker(AppLocalization.string( "Student status"), selection: $studentStatus) {
                                Text("Current student").tag("CURRENT_STUDENT")
                                Text("Exchange student").tag("EXCHANGE_STUDENT")
                                Text("Alumni").tag("ALUMNI")
                            }
                            .pickerStyle(.menu)
                            .accessibilityIdentifier("signup-student-status")

                            Picker(AppLocalization.string( "Degree"), selection: $degreeLevel) {
                                Text("Bachelor").tag("BACHELOR")
                                Text("Master").tag("MASTER")
                                Text("Other").tag("OTHER")
                            }
                            .pickerStyle(.segmented)
                            .accessibilityIdentifier("signup-degree-level")

                            if studentStatus == "ALUMNI" {
                                Stepper(
                                    AppLocalization.string( "Graduation year: \(graduationYear)"),
                                    value: $graduationYear,
                                    in: (Calendar.current.component(.year, from: Date()) - 80)...(Calendar.current.component(.year, from: Date()) + 1)
                                )
                                .accessibilityIdentifier("signup-graduation-year")
                            } else {
                                Stepper(
                                    AppLocalization.string( "Current semester: \(semester)"),
                                    value: $semester,
                                    in: 1...20
                                )
                                .accessibilityIdentifier("signup-semester")
                            }

                            Text(AppLocalization.string( "Verify this school later with an official school email or manual review."))
                                .font(.caption)
                                .foregroundStyle(SideSeatTheme.textSecondary)
                        }
                        .padding(SideSeatTheme.spaceLG)
                        .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))

                        if let issue {
                            SSFieldMessage(text: issue, accessibilityID: "signup-error")
                        }

                    }
                    .padding(22)
                    .padding(.top, SideSeatTheme.spaceSM)
                }
                .scrollDismissesKeyboard(.interactively)
            }
            .navigationTitle(AppLocalization.string( "Sign up"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(AppLocalization.string( "Cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(action: submit) {
                        if isWorking || session.isWorking {
                            ProgressView()
                        } else {
                            Text(AppLocalization.string( "Create account"))
                                .fontWeight(.semibold)
                        }
                    }
                    .disabled(!canSubmit || isWorking || session.isWorking)
                    .ssConfirmationActionStyle()
                    .accessibilityIdentifier("signup-submit")
                }
            }
            .onAppear { focusedField = .displayName }
        }
    }

    private var canSubmit: Bool {
        displayName.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2
            && !username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && password.count >= 8
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

    private func submit() {
        issue = nil
        let trimmedDisplayName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (2...32).contains(trimmedDisplayName.count) else {
            issue = AppLocalization.string( "Nickname must be 2–32 characters.")
            return
        }
        if let usernameIssue = AuthFieldValidation.usernameIssue(username) {
            issue = usernameIssue
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
            let normalized = AuthFieldValidation.normalizeUsername(username)
            if let error = await session.signup(
                displayName: trimmedDisplayName,
                username: normalized,
                password: password,
                school: school,
                studentStatus: studentStatus,
                degreeLevel: degreeLevel,
                semester: studentStatus == "ALUMNI" ? nil : semester,
                graduationYear: studentStatus == "ALUMNI" ? graduationYear : nil
            ) {
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
