import SwiftUI

struct CourseManualAddView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

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
                    LabeledContent("School") {
                        Text(school)
                            .accessibilityIdentifier("course-manual-school")
                    }
                    .accessibilityElement(children: .contain)
                    TextField("Course name", text: $name)
                        .focused($focusedField, equals: .name)
                        .textInputAutocapitalization(.words)
                        .submitLabel(.next)
                        .onSubmit { focusedField = .code }
                        .accessibilityIdentifier("course-manual-name")
                    TextField("Course code (optional)", text: $code)
                        .focused($focusedField, equals: .code)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .submitLabel(.done)
                        .onSubmit { focusedField = nil }
                        .accessibilityIdentifier("course-manual-code")
                } footer: {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Use 2–160 characters for the course name.")
                            .accessibilityIdentifier("course-manual-name-guidance")
                        if code.trimmingCharacters(in: .whitespacesAndNewlines).count > 40 {
                            Text("Use up to 40 characters for the course code.")
                                .foregroundStyle(SideSeatTheme.danger)
                        }
                        Text("New courses are added to the school in your profile and are available to other students there.")
                    }
                }

                if let issue = store.issue {
                    Section {
                        Label(issue, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(SideSeatTheme.danger)
                    }
                }
            }
            .disabled(store.isSaving)
            .scrollDismissesKeyboard(.interactively)
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
                    .disabled(!canSubmit || store.isSaving)
                    .ssConfirmationActionStyle()
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
        .interactiveDismissDisabled(store.isSaving)
        .task {
            if !dynamicTypeSize.isAccessibilitySize { focusedField = .name }
        }
        .accessibilityIdentifier("course-manual-add")
    }

    private var canSubmit: Bool {
        (2...160).contains(name.trimmingCharacters(in: .whitespacesAndNewlines).count)
            && code.trimmingCharacters(in: .whitespacesAndNewlines).count <= 40
    }
}
