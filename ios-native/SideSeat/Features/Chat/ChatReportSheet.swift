import SwiftUI

struct ChatReportSheet: View {
    var title = AppLocalization.string( "Report message")
    let onSubmit: (NativeReportReason, String) async -> String?
    @Environment(\.dismiss) private var dismiss

    @State private var reason: NativeReportReason = .harassment
    @State private var details = ""
    @State private var isSubmitting = false
    @State private var issue: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Reason", selection: $reason) {
                        ForEach(NativeReportReason.allCases) { value in
                            Text(value.title).tag(value)
                        }
                    }
                    .accessibilityIdentifier("chat-report-reason")

                    TextField("Details (optional)", text: $details, axis: .vertical)
                        .lineLimit(3...6)
                        .accessibilityIdentifier("chat-report-details")
                }

                if let issue {
                    Section {
                        Text(issue)
                            .foregroundStyle(SideSeatTheme.danger)
                            .font(.footnote)
                    }
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .accessibilityIdentifier("chat-report-cancel")
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Send") {
                        Task { await submit() }
                    }
                    .disabled(isSubmitting)
                    .ssConfirmationActionStyle()
                    .accessibilityIdentifier("chat-report-send")
                }
            }
        }
        .accessibilityIdentifier("chat-report-sheet")
    }

    private func submit() async {
        guard !isSubmitting else { return }
        isSubmitting = true
        issue = nil
        defer { isSubmitting = false }

        let trimmed = String(details.prefix(500))
        if let failure = await onSubmit(reason, trimmed) {
            issue = failure
            return
        }
        dismiss()
    }
}
