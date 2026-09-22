import SwiftUI

struct ChatReportSheet: View {
    var title = AppLocalization.string("Report")
    let onSubmit: (NativeReportReason, String) async -> String?
    @Environment(\.dismiss) private var dismiss

    @State private var reason: NativeReportReason = .harassment
    @State private var details = ""
    @State private var isSubmitting = false
    @State private var issue: String?
    @FocusState private var isDetailsFocused: Bool

    // The report API limits JavaScript string length (UTF-16 units).
    private var hasValidDetails: Bool { details.utf16.count <= 500 }

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
                        .focused($isDetailsFocused)
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
            .scrollDismissesKeyboard(.interactively)
            .disabled(isSubmitting)
            .safeAreaInset(edge: .top, spacing: 0) {
                if !hasValidDetails {
                    Text("Use up to 500 characters.")
                        .font(.footnote)
                        .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, SideSeatTheme.spaceLG)
                        .padding(.vertical, SideSeatTheme.spaceSM)
                        .background(SideSeatTheme.bgGrouped)
                        .accessibilityIdentifier("chat-report-details-guidance")
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isSubmitting)
                        .accessibilityIdentifier("chat-report-cancel")
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        isDetailsFocused = false
                        Task { await submit() }
                    } label: {
                        if isSubmitting { ProgressView() }
                        else { Text("Send") }
                    }
                    .disabled(isSubmitting || !hasValidDetails)
                    .ssConfirmationActionStyle()
                    .accessibilityLabel("Send")
                    .accessibilityIdentifier("chat-report-send")
                }
            }
        }
        .interactiveDismissDisabled(isSubmitting)
        .accessibilityIdentifier("chat-report-sheet")
    }

    private func submit() async {
        guard !isSubmitting, hasValidDetails else { return }
        isSubmitting = true
        issue = nil
        defer { isSubmitting = false }

        if let failure = await onSubmit(reason, details) {
            issue = failure
            return
        }
        dismiss()
    }
}
