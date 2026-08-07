import SwiftUI
import UIKit

struct ProfileEditSheet: View {
    @Environment(\.dismiss) private var dismiss
    let profile: NativeCurrentProfile
    let onSave: (NativeProfileUpdateRequest) async -> Bool
    private let initialDraft: ProfileEditDraft

    @State private var nickname: String
    @State private var bio: String
    @State private var gender: String
    @State private var school: String
    @State private var studentStatus: String
    @State private var degreeLevel: String
    @State private var major: String
    @State private var semester: Int
    @State private var graduationYear: Int
    @State private var wechatHandle: String
    @State private var whatsappHandle: String
    @State private var telegramHandle: String
    @State private var instagramHandle: String
    @State private var isSubmitting = false
    @State private var issue: String?
    @State private var showsDiscardConfirmation = false
    @State private var showsSchoolChangeConfirmation = false

    init(
        profile: NativeCurrentProfile,
        onSave: @escaping (NativeProfileUpdateRequest) async -> Bool
    ) {
        self.profile = profile
        self.onSave = onSave
        let draft = ProfileEditDraft(profile: profile)
        initialDraft = draft.normalized
        _nickname = State(initialValue: draft.nickname)
        _bio = State(initialValue: draft.bio)
        _gender = State(initialValue: draft.gender)
        _school = State(initialValue: draft.school)
        _studentStatus = State(initialValue: draft.studentStatus)
        _degreeLevel = State(initialValue: draft.degreeLevel)
        _major = State(initialValue: draft.major)
        _semester = State(initialValue: draft.semester)
        _graduationYear = State(initialValue: draft.graduationYear)
        _wechatHandle = State(initialValue: draft.wechatHandle)
        _whatsappHandle = State(initialValue: draft.whatsappHandle)
        _telegramHandle = State(initialValue: draft.telegramHandle)
        _instagramHandle = State(initialValue: draft.instagramHandle)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: SideSeatTheme.spaceXL) {
                    ProfileEditSection(
                        title: String(localized: "Basics"),
                        systemImage: "person.text.rectangle.fill",
                        tint: SideSeatTheme.rose
                    ) {
                        VStack(spacing: SideSeatTheme.spaceLG) {
                            VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
                                ProfileEditMenuPicker(
                                    title: String(localized: "School"),
                                    selection: $school,
                                    options: [("TUM", "TUM"), ("LMU", "LMU")],
                                    accessibilityID: "profile-edit-school"
                                )
                                if hasChangedSchool {
                                    Label {
                                        Text("Changing school archives active courses and school-specific posts. The new school requires separate verification.")
                                    } icon: {
                                        Image(systemName: "exclamationmark.triangle.fill")
                                    }
                                    .font(.footnote)
                                    .foregroundStyle(SideSeatTheme.warning)
                                    .fixedSize(horizontal: false, vertical: true)
                                    .accessibilityIdentifier("profile-edit-school-verification-warning")
                                }
                            }
                            ProfileEditMenuPicker(
                                title: String(localized: "Student status"),
                                selection: $studentStatus,
                                options: [
                                    ("CURRENT_STUDENT", String(localized: "Current student")),
                                    ("EXCHANGE_STUDENT", String(localized: "Exchange student")),
                                    ("ALUMNI", String(localized: "Alumni"))
                                ],
                                accessibilityID: "profile-edit-student-status"
                            )
                            ProfileEditMenuPicker(
                                title: String(localized: "Degree"),
                                selection: $degreeLevel,
                                options: [
                                    ("BACHELOR", String(localized: "Bachelor")),
                                    ("MASTER", String(localized: "Master")),
                                    ("OTHER", String(localized: "Other"))
                                ],
                                accessibilityID: "profile-edit-degree-level"
                            )
                            ProfileEditTextField(
                                title: String(localized: "Nickname"),
                                text: $nickname,
                                capitalization: .words,
                                autocorrectionDisabled: false,
                                accessibilityID: "profile-edit-nickname"
                            )
                            ProfileEditTaglineField(text: $bio)
                            ProfileEditGenderPicker(selection: $gender)
                        }
                    }

                    ProfileEditSection(
                        title: String(localized: "Study"),
                        systemImage: "graduationcap.fill",
                        tint: SideSeatTheme.HubTint.courses
                    ) {
                        VStack(spacing: SideSeatTheme.spaceLG) {
                            ProfileEditTextField(
                                title: String(localized: "Major"),
                                text: $major,
                                capitalization: .words,
                                autocorrectionDisabled: false,
                                accessibilityID: "profile-edit-major"
                            )
                            if studentStatus == "ALUMNI" {
                                ProfileEditGraduationYearControl(year: $graduationYear)
                            } else {
                                ProfileEditSemesterControl(semester: $semester)
                            }
                        }
                    }

                    ProfileEditSection(
                        title: String(localized: "Contact handles"),
                        systemImage: "bubble.left.and.bubble.right.fill",
                        tint: SideSeatTheme.HubTint.contacts
                    ) {
                        VStack(spacing: SideSeatTheme.spaceLG) {
                            ProfileEditTextField(
                                title: String(localized: "WeChat"),
                                text: $wechatHandle,
                                accessibilityID: "profile-edit-wechat"
                            )
                            ProfileEditTextField(
                                title: String(localized: "WhatsApp"),
                                text: $whatsappHandle,
                                accessibilityID: "profile-edit-whatsapp"
                            )
                            ProfileEditTextField(
                                title: String(localized: "Telegram"),
                                text: $telegramHandle,
                                accessibilityID: "profile-edit-telegram"
                            )
                            ProfileEditTextField(
                                title: String(localized: "Instagram"),
                                text: $instagramHandle,
                                accessibilityID: "profile-edit-instagram"
                            )

                        }
                    }

                    if let issue {
                        SSFieldMessage(text: issue, accessibilityID: "profile-edit-error")
                    }
                }
                .padding(.horizontal, SideSeatTheme.spaceLG)
                .padding(.top, SideSeatTheme.spaceMD)
                .padding(.bottom, SideSeatTheme.spaceXL)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(SideSeatTheme.bgGrouped.ignoresSafeArea())
            .accessibilityIdentifier("profile-edit")
            .toolbar(.hidden, for: .navigationBar)
            .safeAreaInset(edge: .top, spacing: 0) {
                ProfileSheetHeader(
                    title: String(localized: "Edit profile"),
                    closeAccessibilityID: "profile-edit-close",
                    isCloseDisabled: isSubmitting
                ) {
                    requestDismissal()
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                VStack(spacing: 0) {
                    Divider()
                    SSPrimaryButton(
                        title: String(localized: "Save"),
                        isLoading: isSubmitting,
                        fill: .product,
                        accessibilityID: "profile-edit-save"
                    ) {
                        if hasChangedSchool {
                            showsSchoolChangeConfirmation = true
                        } else {
                            Task { await save() }
                        }
                    }
                    .disabled(!canSave || !hasUnsavedChanges || isSubmitting)
                    .padding(.horizontal, SideSeatTheme.spaceLG)
                    .padding(.vertical, SideSeatTheme.spaceMD)
                }
                .background(SideSeatTheme.surface)
            }
        }
        .background {
            ProfileDismissGuard(isDisabled: hasUnsavedChanges || isSubmitting) {
                requestDismissal()
            }
        }
        .alert(
            String(localized: "Discard profile changes?"),
            isPresented: $showsDiscardConfirmation
        ) {
            Button(String(localized: "Keep editing"), role: .cancel) {}
                .accessibilityIdentifier("profile-edit-keep-editing")
            Button(String(localized: "Discard"), role: .destructive) {
                dismiss()
            }
            .accessibilityIdentifier("profile-edit-discard")
        } message: {
            Text("Your unsaved profile changes will be lost.")
        }
        .alert(
            String(localized: "Change school?"),
            isPresented: $showsSchoolChangeConfirmation
        ) {
            Button(String(localized: "Cancel"), role: .cancel) {}
            Button(String(localized: "Change school"), role: .destructive) {
                Task { await save() }
            }
            .accessibilityIdentifier("profile-edit-confirm-school-change")
        } message: {
            Text("Your active courses and school-specific posts will be archived. Existing friends and chats stay available. Verify the new school to show its badge.")
        }
    }

    private var currentDraft: ProfileEditDraft {
        ProfileEditDraft(
            nickname: nickname,
            bio: bio,
            gender: gender,
            school: school,
            studentStatus: studentStatus,
            degreeLevel: degreeLevel,
            major: major,
            semester: semester,
            graduationYear: graduationYear,
            wechatHandle: wechatHandle,
            whatsappHandle: whatsappHandle,
            telegramHandle: telegramHandle,
            instagramHandle: instagramHandle
        )
    }

    private var hasUnsavedChanges: Bool {
        currentDraft.normalized != initialDraft
    }

    private var hasChangedSchool: Bool {
        StudentIdentityDisplay.schoolCode(school) != StudentIdentityDisplay.schoolCode(profile.school)
    }

    private var canSave: Bool {
        let trimmedNickname = nickname.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmedNickname.count >= 2 && trimmedNickname.count <= 32 &&
            bio.count <= 120 &&
            wechatHandle.count <= 80 &&
            whatsappHandle.count <= 80 &&
            telegramHandle.count <= 80 &&
            instagramHandle.count <= 80
    }

    private func save() async {
        guard !isSubmitting else { return }
        isSubmitting = true
        defer { isSubmitting = false }
        issue = nil
        let draft = currentDraft.normalized
        let request = NativeProfileUpdateRequest(
            nickname: draft.nickname,
            bio: draft.bio,
            gender: draft.gender,
            school: draft.school,
            studentStatus: draft.studentStatus,
            degreeLevel: draft.degreeLevel,
            major: draft.major,
            semester: draft.studentStatus == "ALUMNI" ? nil : draft.semester,
            graduationYear: draft.studentStatus == "ALUMNI" ? draft.graduationYear : nil,
            wechatHandle: draft.wechatHandle,
            whatsappHandle: draft.whatsappHandle,
            telegramHandle: draft.telegramHandle,
            instagramHandle: draft.instagramHandle
        )
        if await onSave(request) {
            dismiss()
        } else {
            issue = String(localized: "The profile could not be saved.")
        }
    }

    private func requestDismissal() {
        guard !isSubmitting else { return }
        if hasUnsavedChanges {
            showsDiscardConfirmation = true
        } else {
            dismiss()
        }
    }
}

private struct ProfileEditDraft: Equatable {
    var nickname: String
    var bio: String
    var gender: String
    var school: String
    var studentStatus: String
    var degreeLevel: String
    var major: String
    var semester: Int
    var graduationYear: Int
    var wechatHandle: String
    var whatsappHandle: String
    var telegramHandle: String
    var instagramHandle: String

    init(profile: NativeCurrentProfile) {
        nickname = profile.nickname ?? ""
        bio = profile.tagline ?? ""
        gender = profile.gender
        school = profile.school ?? "TUM"
        studentStatus = profile.studentStatus ?? "CURRENT_STUDENT"
        degreeLevel = profile.degreeLevel ?? "BACHELOR"
        major = profile.major ?? ""
        semester = profile.semester ?? profile.schoolSummary.semester
        graduationYear = profile.graduationYear ?? Calendar.current.component(.year, from: Date())
        wechatHandle = profile.contacts.wechatHandle ?? ""
        whatsappHandle = profile.contacts.whatsappHandle ?? ""
        telegramHandle = profile.contacts.telegramHandle ?? ""
        instagramHandle = profile.contacts.instagramHandle ?? ""
    }

    init(
        nickname: String,
        bio: String,
        gender: String,
        school: String,
        studentStatus: String,
        degreeLevel: String,
        major: String,
        semester: Int,
        graduationYear: Int,
        wechatHandle: String,
        whatsappHandle: String,
        telegramHandle: String,
        instagramHandle: String
    ) {
        self.nickname = nickname
        self.bio = bio
        self.gender = gender
        self.school = school
        self.studentStatus = studentStatus
        self.degreeLevel = degreeLevel
        self.major = major
        self.semester = semester
        self.graduationYear = graduationYear
        self.wechatHandle = wechatHandle
        self.whatsappHandle = whatsappHandle
        self.telegramHandle = telegramHandle
        self.instagramHandle = instagramHandle
    }

    var normalized: ProfileEditDraft {
        var draft = self
        draft.nickname = nickname.trimmingCharacters(in: .whitespacesAndNewlines)
        draft.bio = bio.trimmingCharacters(in: .whitespacesAndNewlines)
        draft.major = major.trimmingCharacters(in: .whitespacesAndNewlines)
        draft.wechatHandle = wechatHandle.trimmingCharacters(in: .whitespacesAndNewlines)
        draft.whatsappHandle = whatsappHandle.trimmingCharacters(in: .whitespacesAndNewlines)
        draft.telegramHandle = telegramHandle.trimmingCharacters(in: .whitespacesAndNewlines)
        draft.instagramHandle = instagramHandle.trimmingCharacters(in: .whitespacesAndNewlines)
        if studentStatus == "ALUMNI" {
            draft.semester = 0
        } else {
            draft.graduationYear = 0
        }
        return draft
    }
}

private struct ProfileDismissGuard: UIViewControllerRepresentable {
    let isDisabled: Bool
    let onAttempt: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(isDisabled: isDisabled, onAttempt: onAttempt)
    }

    func makeUIViewController(context: Context) -> UIViewController {
        UIViewController()
    }

    func updateUIViewController(_ controller: UIViewController, context: Context) {
        context.coordinator.isDisabled = isDisabled
        context.coordinator.onAttempt = onAttempt
        DispatchQueue.main.async {
            controller.parent?.presentationController?.delegate = context.coordinator
        }
    }

    static func dismantleUIViewController(_ controller: UIViewController, coordinator: Coordinator) {
        if controller.parent?.presentationController?.delegate === coordinator {
            controller.parent?.presentationController?.delegate = nil
        }
    }

    final class Coordinator: NSObject, UIAdaptivePresentationControllerDelegate {
        var isDisabled: Bool
        var onAttempt: () -> Void

        init(isDisabled: Bool, onAttempt: @escaping () -> Void) {
            self.isDisabled = isDisabled
            self.onAttempt = onAttempt
        }

        func presentationControllerShouldDismiss(_ presentationController: UIPresentationController) -> Bool {
            !isDisabled
        }

        func presentationControllerDidAttemptToDismiss(_ presentationController: UIPresentationController) {
            onAttempt()
        }
    }
}

private struct ProfileEditMenuPicker: View {
    let title: String
    @Binding var selection: String
    let options: [(value: String, label: String)]
    let accessibilityID: String

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(SideSeatTheme.textSecondary)
            Picker(title, selection: $selection) {
                ForEach(options, id: \.value) { option in
                    Text(option.label).tag(option.value)
                }
            }
            .pickerStyle(.menu)
            .frame(maxWidth: .infinity, minHeight: 46, alignment: .leading)
            .padding(.horizontal, 6)
            .background {
                RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                    .fill(SideSeatTheme.fillTertiary)
            }
            .accessibilityIdentifier(accessibilityID)
        }
    }
}

struct ProfileEditSection<Content: View>: View {
    let title: String
    let systemImage: String
    let tint: Color
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            Label(title, systemImage: systemImage)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(tint)
                .padding(.horizontal, SideSeatTheme.spaceXS)

            content()
                .padding(SideSeatTheme.spaceLG)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background {
                    RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                        .fill(SideSeatTheme.surface)
                }
                .overlay {
                    RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                        .strokeBorder(Color.primary.opacity(0.04), lineWidth: 1)
                }
        }
    }
}

struct ProfileSheetHeader: View {
    let title: String
    var closeAccessibilityID = "profile-sheet-close"
    var isCloseDisabled = false
    let onClose: () -> Void

    var body: some View {
        HStack {
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.accent)
                    .frame(width: 42, height: 42)
                    .background(Circle().fill(SideSeatTheme.surface))
            }
            .buttonStyle(.plain)
            .disabled(isCloseDisabled)
            .accessibilityLabel(String(localized: "Cancel"))
            .accessibilityIdentifier(closeAccessibilityID)

            Spacer()

            Text(title)
                .font(.title3.weight(.bold))
                .foregroundStyle(SideSeatTheme.textPrimary)

            Spacer()

            Color.clear.frame(width: 42, height: 42)
        }
        .padding(.horizontal, SideSeatTheme.spaceLG)
        .padding(.vertical, SideSeatTheme.spaceSM)
        .background(SideSeatTheme.bgGrouped)
    }
}

private struct ProfileEditTextField: View {
    let title: String
    @Binding var text: String
    var capitalization: TextInputAutocapitalization = .never
    var autocorrectionDisabled = true
    let accessibilityID: String

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(SideSeatTheme.textSecondary)
            TextField(title, text: $text)
                .textInputAutocapitalization(capitalization)
                .autocorrectionDisabled(autocorrectionDisabled)
                .padding(.horizontal, 13)
                .frame(minHeight: 46)
                .background {
                    RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                        .fill(SideSeatTheme.fillTertiary)
                }
                .accessibilityIdentifier(accessibilityID)
        }
    }
}

private struct ProfileEditTaglineField: View {
    @Binding var text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack {
                Text("Tagline")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.textSecondary)
                Spacer()
                Text("\(text.count)/120")
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(text.count > 120 ? SideSeatTheme.danger : SideSeatTheme.textSecondary)
            }

            TextField("Tagline", text: $text, axis: .vertical)
                .lineLimit(2...3)
                .padding(.horizontal, 13)
                .padding(.vertical, 12)
                .background {
                    RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                        .fill(SideSeatTheme.fillTertiary)
                }
                .accessibilityIdentifier("profile-edit-tagline")
        }
    }
}

private struct ProfileEditGenderPicker: View {
    @Binding var selection: String

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text("Gender")
                .font(.caption.weight(.semibold))
                .foregroundStyle(SideSeatTheme.textSecondary)
            Picker("Gender", selection: $selection) {
                Text("Male").tag("MALE")
                Text("Female").tag("FEMALE")
                Text("Prefer not to say").tag("PRIVATE")
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .accessibilityIdentifier("profile-edit-gender")
        }
    }
}

private struct ProfileEditSemesterControl: View {
    @Binding var semester: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text("Semester")
                .font(.caption.weight(.semibold))
                .foregroundStyle(SideSeatTheme.textSecondary)

            HStack(spacing: SideSeatTheme.spaceMD) {
                semesterButton(systemImage: "minus", enabled: semester > 1) {
                    semester -= 1
                }

                Text("\(semester)")
                    .font(.title3.weight(.semibold).monospacedDigit())
                    .frame(maxWidth: .infinity)
                    .accessibilityIdentifier("profile-edit-semester")

                semesterButton(systemImage: "plus", enabled: semester < 14) {
                    semester += 1
                }
            }
            .padding(6)
            .background {
                RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                    .fill(SideSeatTheme.fillTertiary)
            }
        }
    }

    private func semesterButton(
        systemImage: String,
        enabled: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.body.weight(.semibold))
                .frame(width: 38, height: 38)
                .background(Circle().fill(SideSeatTheme.surface))
        }
        .buttonStyle(.plain)
        .foregroundStyle(enabled ? SideSeatTheme.accent : SideSeatTheme.textSecondary.opacity(0.4))
        .disabled(!enabled)
        .accessibilityLabel(
            systemImage == "plus"
                ? String(localized: "Increase semester")
                : String(localized: "Decrease semester")
        )
    }
}

private struct ProfileEditGraduationYearControl: View {
    @Binding var year: Int

    private var range: ClosedRange<Int> {
        let current = Calendar.current.component(.year, from: Date())
        return (current - 80)...(current + 1)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text("Graduation year")
                .font(.caption.weight(.semibold))
                .foregroundStyle(SideSeatTheme.textSecondary)
            Stepper(value: $year, in: range) {
                Text("\(year)")
                    .font(.body.weight(.semibold).monospacedDigit())
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 46)
            .background {
                RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                    .fill(SideSeatTheme.fillTertiary)
            }
            .accessibilityIdentifier("profile-edit-graduation-year")
        }
    }
}

struct ProfileEditToggleRow: View {
    let title: String
    var subtitle: String? = nil
    @Binding var isOn: Bool
    let accessibilityID: String

    var body: some View {
        Toggle(isOn: $isOn) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.body.weight(.medium))
                if let subtitle {
                    Text(subtitle)
                        .font(.footnote)
                        .foregroundStyle(SideSeatTheme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.trailing, SideSeatTheme.spaceSM)
        }
        .tint(SideSeatTheme.accent)
        .padding(.vertical, SideSeatTheme.spaceXS)
        .accessibilityIdentifier(accessibilityID)
    }
}
