import SwiftUI

struct CourseManualAddView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    let school: String
    let onCreated: (String) async -> Void

    @State private var store = CourseManualAddStore()
    @State private var name = ""
    @State private var code = ""
    @FocusState private var focusedField: Field?

    private enum Field {
        case name
        case code
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("School", value: school)
                    TextField("Course name", text: $name)
                        .focused($focusedField, equals: .name)
                        .textInputAutocapitalization(.words)
                        .accessibilityIdentifier("course-manual-name")
                    TextField("Course code (optional)", text: $code)
                        .focused($focusedField, equals: .code)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .accessibilityIdentifier("course-manual-code")
                } footer: {
                    Text("Community courses are available immediately for classmate matching and show their community source.")
                }

                if let issue = store.issue {
                    Section {
                        Label(issue, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(SideSeatTheme.danger)
                    }
                }
            }
            .navigationTitle("Add course")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(store.isSaving)
                        .accessibilityIdentifier("course-manual-cancel")
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        focusedField = nil
                        Task {
                            guard let courseID = await store.create(
                                name: name,
                                code: code,
                                using: session
                            ) else { return }
                            dismiss()
                            await onCreated(courseID)
                        }
                    }
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).count < 2 || store.isSaving)
                    .accessibilityIdentifier("course-manual-confirm")
                }
            }
            .overlay {
                if store.isSaving {
                    SSLoadingState("Adding course")
                        .padding(18)
                        .background(.regularMaterial)
                        .clipShape(RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous))
                }
            }
        }
        .accessibilityIdentifier("course-manual-add")
    }
}
