import SwiftUI

struct MembershipView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.scenePhase) private var scenePhase
    @Bindable var store: MembershipStore
    @State private var code = ""
    @FocusState private var codeFocused: Bool

    var body: some View {
        Form {
            Section {
                if let membership = store.membership {
                    Label(membership.displayName, systemImage: membership.isPlus ? "sparkles" : "person.crop.circle")
                        .font(.title2.weight(.semibold))
                        .accessibilityIdentifier(membership.isPlus ? "membership-plus" : "membership-free")
                    if let expiry = membership.expirationDate {
                        LabeledContent(membership.isPlus ? "Valid until" : "Membership expired") {
                            Text(expiry, format: .dateTime.year().month().day().hour().minute())
                        }
                        .accessibilityIdentifier("membership-expiry")
                    }
                } else if store.isLoading {
                    ProgressView("Loading membership")
                } else {
                    Button("Try again") { Task { await store.load(using: session) } }
                }
            } header: { Text("Your membership") }

            Section {
                TextField("Invitation code", text: $code, axis: .vertical)
                    .font(.body.monospaced())
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .focused($codeFocused)
                    .accessibilityIdentifier("membership-code")
                Button {
                    codeFocused = false
                    Task {
                        if await store.redeem(code, using: session) { code = "" }
                    }
                } label: {
                    HStack {
                        Text("Redeem Plus")
                        Spacer()
                        if store.isRedeeming { ProgressView() }
                        else { Image(systemName: "arrow.right.circle.fill") }
                    }
                }
                .disabled(code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.isRedeeming || store.isLoading)
                .accessibilityIdentifier("membership-redeem")
            } header: { Text("Redeem invitation") } footer: {
                Text("Each code can be redeemed once per account. If you already have Plus, the added days extend your current membership.")
            }

            if let confirmation = store.confirmation {
                Section {
                    Label(confirmation, systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                        .accessibilityIdentifier("membership-confirmation")
                }
            }
            if let issue = store.issue {
                Section {
                    Text(issue).foregroundStyle(SideSeatTheme.danger)
                        .accessibilityIdentifier("membership-error")
                }
            }
        }
        .navigationTitle("Membership")
        .navigationBarTitleDisplayMode(.inline)
        .task { await store.load(using: session) }
        .refreshable { await store.load(using: session) }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await store.load(using: session) } }
        }
    }
}
