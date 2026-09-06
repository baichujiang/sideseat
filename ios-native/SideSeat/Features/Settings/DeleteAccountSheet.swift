import SwiftUI

struct DeleteAccountSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    @State private var understood = false
    @State private var confirmText = ""
    @State private var isDeleting = false
    @State private var issue: String?

    private var username: String {
        session.currentUser?.username ?? "username"
    }

    private var canSubmit: Bool {
        understood && confirmText == username && !isDeleting
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Your profile, courses, calendar, messages, and connections will be removed.")
                    Text("Group chats you created will be deleted for all members.")
                    Text("This cannot be undone.")
                }
                .font(.footnote)
                .foregroundStyle(.secondary)

                Section {
                    Toggle("I understand this permanently deletes my account and data.", isOn: $understood)
                        .tint(SideSeatTheme.danger)
                        .accessibilityIdentifier("delete-account-understood")
                    TextField(AppLocalization.string( "Type \(username) to confirm"), text: $confirmText)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .accessibilityIdentifier("delete-account-confirm")
                }

                if let issue {
                    Section {
                        Text(issue)
                            .font(.footnote)
                            .foregroundStyle(SideSeatTheme.danger)
                    }
                }
            }
            .navigationTitle("Delete account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .accessibilityIdentifier("delete-account-cancel")
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Delete", role: .destructive) {
                        Task { await delete() }
                    }
                    .disabled(!canSubmit)
                    .accessibilityIdentifier("delete-account-submit")
                }
            }
            .accessibilityIdentifier("delete-account-sheet")
        }
    }

    private func delete() async {
        isDeleting = true
        issue = nil
        defer { isDeleting = false }
        if let failure = await session.deleteAccount(confirmUsername: confirmText) {
            issue = failure
            return
        }
        dismiss()
    }
}
