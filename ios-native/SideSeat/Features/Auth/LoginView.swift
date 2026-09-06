import SwiftUI

struct LoginView: View {
    @Environment(SessionStore.self) private var session
    @State private var identifier = ""
    @State private var password = ""
    @State private var isPasswordVisible = false
    @State private var showSignup = false
    @State private var showForgotPassword = false
    @FocusState private var focusedField: Field?
    @State private var appearHero = false
    @State private var appearForm = false

    private enum Field {
        case identifier
        case password
    }

    var body: some View {
        NavigationStack {
            SSScreen(surface: .brand) {
                ScrollView {
                    VStack(spacing: SideSeatTheme.spaceXL + 4) {
                        brandHeader
                            .opacity(appearHero ? 1 : 0)
                            .offset(y: appearHero ? 0 : 14)

                        loginCard
                            .opacity(appearForm ? 1 : 0)
                            .offset(y: appearForm ? 0 : 18)

                        secondaryActions
                            .opacity(appearForm ? 1 : 0)
                    }
                    .padding(.horizontal, 22)
                    .padding(.top, 36)
                    .padding(.bottom, 40)
                }
                .scrollDismissesKeyboard(.interactively)
            }
            .navigationBarHidden(true)
            .onAppear {
                focusedField = .identifier
                withAnimation(.easeOut(duration: 0.45)) { appearHero = true }
                withAnimation(.easeOut(duration: 0.55).delay(0.08)) { appearForm = true }
            }
            .sheet(isPresented: $showSignup) {
                SignupSheet { username, password in
                    identifier = username
                    self.password = password
                }
                .environment(session)
            }
            .sheet(isPresented: $showForgotPassword) {
                ForgotPasswordSheet { email, password in
                    identifier = email
                    self.password = password
                }
                .environment(session)
            }
        }
    }

    private var brandHeader: some View {
        VStack(spacing: 14) {
            SideSeatBrandMark(size: 108)
                .scaleEffect(appearHero ? 1 : 0.92)

            Text("sideseat")
                .font(SideSeatTheme.Text.display)
                .foregroundStyle(SideSeatTheme.accentGradient)
                .accessibilityAddTraits(.isHeader)
                .accessibilityLabel("SideSeat")

            Text(AppLocalization.string("Find people to do things with—and make a plan."))
                .font(.subheadline.weight(.medium))
                .foregroundStyle(SideSeatTheme.ink)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 18)
    }

    private var loginCard: some View {
        SSCard {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceLG) {
                Text(AppLocalization.string( "Log in"))
                    .font(SideSeatTheme.Text.titleSmall)

                SSTextField(
                    title: AppLocalization.string( "Username, email, or phone"),
                    placeholder: AppLocalization.string( "Account"),
                    text: $identifier,
                    contentType: .username,
                    keyboard: .default,
                    submitLabel: .next,
                    accessibilityID: "login-identifier"
                )
                .focused($focusedField, equals: .identifier)
                .onSubmit { focusedField = .password }

                SSSecureField(
                    title: AppLocalization.string( "Password"),
                    text: $password,
                    isVisible: $isPasswordVisible,
                    submitLabel: .go,
                    isFocused: focusBinding(for: .password),
                    accessibilityID: "login-password",
                    onSubmit: login
                )
                .focused($focusedField, equals: .password)

                if let issue = session.issue {
                    SSFieldMessage(text: issue, accessibilityID: "login-error")
                        .transition(.opacity.combined(with: .move(edge: .top)))
                }

                SSPrimaryButton(
                    title: AppLocalization.string( "Log in"),
                    isLoading: session.isWorking,
                    fill: .brand,
                    accessibilityID: "login-submit",
                    action: login
                )
                .disabled(!canSubmit || session.isWorking)

                SSSecondaryButton(
                    title: AppLocalization.string( "Forgot password?"),
                    accessibilityID: "login-forgot-password"
                ) {
                    showForgotPassword = true
                }
            }
        }
    }

    private var secondaryActions: some View {
        HStack(spacing: 6) {
            Text(AppLocalization.string( "New here?"))
                .foregroundStyle(SideSeatTheme.textSecondaryStrong)
            SSSecondaryButton(
                title: AppLocalization.string( "Create an account"),
                fontWeight: .semibold,
                expands: false,
                accessibilityID: "login-create-account"
            ) {
                showSignup = true
            }
        }
        .font(.subheadline)
    }

    private var canSubmit: Bool {
        !identifier.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !password.isEmpty
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

    private func login() {
        guard canSubmit else { return }
        Task {
            await session.login(
                identifier: identifier.trimmingCharacters(in: .whitespacesAndNewlines),
                password: password
            )
            if session.phase == .signedIn {
                password = ""
            } else {
                focusedField = .password
            }
        }
    }
}
