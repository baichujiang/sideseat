import SwiftUI
import UIKit

struct ProfileEditSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
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
    @FocusState private var focusedInput: ProfileEditInputField?
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
                VStack(alignment: .leading, spacing: dynamicTypeSize.isAccessibilitySize ? SideSeatTheme.spaceXL : SideSeatTheme.spaceLG) {
                    ProfileEditorSection(
                        title: AppLocalization.string( "Basics"),
                        systemImage: "person.text.rectangle.fill",
                        tint: SideSeatTheme.textSecondaryStrong
                    ) {
                        VStack(spacing: 0) {
                            ProfileEditTextField(
                                focus: $focusedInput,
                                field: .nickname,
                                title: AppLocalization.string( "Nickname"),
                                text: $nickname,
                                capitalization: .words,
                                autocorrectionDisabled: false,
                                accessibilityID: "profile-edit-nickname",
                                isOptional: false
                            )
                            ProfileEditGenderPicker(selection: $gender)
                            ProfileEditTaglineField(focus: $focusedInput, text: $bio)
                        }
                    }

                    ProfileEditorSection(
                        title: AppLocalization.string( "Study"),
                        systemImage: "graduationcap.fill",
                        tint: SideSeatTheme.HubTint.courses
                    ) {
                        VStack(spacing: 0) {
                            VStack(alignment: .leading, spacing: 0) {
                                ProfileEditMenuPicker(
                                    title: AppLocalization.string( "School"),
                                    selection: $school,
                                    options: [("TUM", "TUM"), ("LMU", "LMU")],
                                    accessibilityID: "profile-edit-school",
                                    showsDivider: false
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
                                    .padding(.horizontal, SideSeatTheme.spaceSM)
                                    .padding(.bottom, SideSeatTheme.spaceSM)
                                    .accessibilityIdentifier("profile-edit-school-verification-warning")
                                }
                                Divider().padding(.horizontal, SideSeatTheme.spaceSM)
                            }
                            ProfileEditMenuPicker(
                                title: AppLocalization.string( "Student status"),
                                selection: $studentStatus,
                                options: [
                                    ("CURRENT_STUDENT", AppLocalization.string( "Current student")),
                                    ("EXCHANGE_STUDENT", AppLocalization.string( "Exchange student")),
                                    ("ALUMNI", AppLocalization.string( "Alumni"))
                                ],
                                accessibilityID: "profile-edit-student-status"
                            )
                            ProfileEditMenuPicker(
                                title: AppLocalization.string( "Degree"),
                                selection: $degreeLevel,
                                options: [
                                    ("BACHELOR", AppLocalization.string( "Bachelor")),
                                    ("MASTER", AppLocalization.string( "Master")),
                                    ("OTHER", AppLocalization.string( "Other"))
                                ],
                                accessibilityID: "profile-edit-degree-level"
                            )
                            ProfileEditTextField(
                                focus: $focusedInput,
                                field: .major,
                                title: AppLocalization.string( "Major"),
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

                    ProfileEditorSection(
                        title: AppLocalization.string( "Contact handles"),
                        systemImage: "bubble.left.and.bubble.right.fill",
                        tint: SideSeatTheme.HubTint.contacts
                    ) {
                        VStack(spacing: 0) {
                            ProfileEditTextField(
                                focus: $focusedInput,
                                field: .wechat,
                                title: AppLocalization.string( "WeChat"),
                                text: $wechatHandle,
                                accessibilityID: "profile-edit-wechat"
                            )
                            ProfileEditTextField(
                                focus: $focusedInput,
                                field: .whatsapp,
                                title: AppLocalization.string( "WhatsApp"),
                                text: $whatsappHandle,
                                accessibilityID: "profile-edit-whatsapp"
                            )
                            ProfileEditTextField(
                                focus: $focusedInput,
                                field: .telegram,
                                title: AppLocalization.string( "Telegram"),
                                text: $telegramHandle,
                                accessibilityID: "profile-edit-telegram"
                            )
                            ProfileEditTextField(
                                focus: $focusedInput,
                                field: .instagram,
                                title: AppLocalization.string( "Instagram"),
                                text: $instagramHandle,
                                accessibilityID: "profile-edit-instagram",
                                showsDivider: false
                            )

                        }
                    }

                    if let issue {
                        SSFieldMessage(text: issue, accessibilityID: "profile-edit-error")
                    }
                }
                .padding(.horizontal, SideSeatTheme.spaceLG)
                .padding(.top, SideSeatTheme.spaceSM)
                .padding(.bottom, SideSeatTheme.spaceLG)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(SideSeatTheme.bgGrouped.ignoresSafeArea())
            .accessibilityIdentifier("profile-edit")
            .toolbar(.hidden, for: .navigationBar)
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Button {
                        focusedInput = focusedInput?.previous
                    } label: {
                        Image(systemName: "chevron.up")
                            .frame(minWidth: 44, minHeight: 44)
                    }
                    .disabled(focusedInput?.previous == nil)
                    .accessibilityLabel(AppLocalization.string("Previous input"))
                    .accessibilityIdentifier("profile-edit-input-previous")

                    Button {
                        focusedInput = focusedInput?.next
                    } label: {
                        Image(systemName: "chevron.down")
                            .frame(minWidth: 44, minHeight: 44)
                    }
                    .disabled(focusedInput?.next == nil)
                    .accessibilityLabel(AppLocalization.string("Next input"))
                    .accessibilityIdentifier("profile-edit-input-next")

                    Spacer()

                    Button("Done") { focusedInput = nil }
                        .accessibilityIdentifier("profile-edit-input-done")
                }
            }
            .safeAreaInset(edge: .top, spacing: 0) {
                ProfileEditorHeader(
                    profile: profile,
                    nickname: nickname,
                    isSubmitting: isSubmitting
                ) {
                    requestDismissal()
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                VStack(spacing: 0) {
                    Divider()
                    SSPrimaryButton(
                        title: AppLocalization.string( "Save"),
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
                    .padding(.vertical, dynamicTypeSize.isAccessibilitySize ? SideSeatTheme.spaceMD : SideSeatTheme.spaceSM)
                }
                .background(.bar)
            }
        }
        .background {
            ProfileDismissGuard(isDisabled: hasUnsavedChanges || isSubmitting) {
                requestDismissal()
            }
        }
        .ssActionPrompt(
            isPresented: $showsDiscardConfirmation,
            title: AppLocalization.string("Discard profile changes?"),
            message: AppLocalization.string("Your unsaved profile changes will be lost."),
            systemImage: "arrow.uturn.backward.circle.fill",
            tint: SideSeatTheme.danger,
            onDismiss: { showsDiscardConfirmation = false },
            accessibilityIdentifier: "profile-edit-discard-prompt"
        ) {
            [
                SSActionPromptAction(
                    id: "profile-edit-keep-editing",
                    title: AppLocalization.string("Keep editing"),
                    systemImage: "pencil",
                    role: .cancel
                ) {},
                SSActionPromptAction(
                    id: "profile-edit-discard",
                    title: AppLocalization.string("Discard"),
                    systemImage: "trash",
                    role: .destructive
                ) {
                    dismiss()
                },
            ]
        }
        .ssActionPrompt(
            isPresented: $showsSchoolChangeConfirmation,
            title: AppLocalization.string("Change school?"),
            message: AppLocalization.string("Your active courses and school-specific posts will be archived. Existing friends and chats stay available. Verify the new school to show its badge."),
            systemImage: "building.columns.fill",
            tint: SideSeatTheme.warning,
            onDismiss: { showsSchoolChangeConfirmation = false },
            accessibilityIdentifier: "profile-edit-school-change-prompt"
        ) {
            [
                SSActionPromptAction(
                    id: "profile-edit-cancel-school-change",
                    title: AppLocalization.string("Cancel"),
                    systemImage: "xmark",
                    role: .cancel
                ) {},
                SSActionPromptAction(
                    id: "profile-edit-confirm-school-change",
                    title: AppLocalization.string("Change school"),
                    systemImage: "building.columns",
                    role: .destructive
                ) {
                    Task { await save() }
                },
            ]
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
        let request = currentDraft.updateRequest(comparedTo: initialDraft)
        if await onSave(request) {
            dismiss()
        } else {
            issue = AppLocalization.string( "The profile could not be saved.")
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

struct ProfileEditDraft: Equatable {
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

    func updateRequest(comparedTo initial: ProfileEditDraft) -> NativeProfileUpdateRequest {
        let draft = normalized
        let original = initial.normalized
        let statusChanged = draft.studentStatus != original.studentStatus
        return NativeProfileUpdateRequest(
            nickname: draft.nickname != original.nickname ? draft.nickname : nil,
            bio: draft.bio != original.bio ? draft.bio : nil,
            gender: draft.gender != original.gender ? draft.gender : nil,
            school: draft.school != original.school ? draft.school : nil,
            studentStatus: statusChanged ? draft.studentStatus : nil,
            degreeLevel: draft.degreeLevel != original.degreeLevel ? draft.degreeLevel : nil,
            major: draft.major != original.major ? draft.major : nil,
            semester: draft.studentStatus != "ALUMNI" && (statusChanged || draft.semester != original.semester)
                ? draft.semester : nil,
            graduationYear: draft.studentStatus == "ALUMNI" && (statusChanged || draft.graduationYear != original.graduationYear)
                ? draft.graduationYear : nil,
            wechatHandle: draft.wechatHandle != original.wechatHandle ? draft.wechatHandle : nil,
            whatsappHandle: draft.whatsappHandle != original.whatsappHandle ? draft.whatsappHandle : nil,
            telegramHandle: draft.telegramHandle != original.telegramHandle ? draft.telegramHandle : nil,
            instagramHandle: draft.instagramHandle != original.instagramHandle ? draft.instagramHandle : nil
        )
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

private enum ProfileEditInputField: Int {
    case nickname, tagline, major, wechat, whatsapp, telegram, instagram

    var previous: Self? { Self(rawValue: rawValue - 1) }
    var next: Self? { Self(rawValue: rawValue + 1) }
}

private struct ProfileEditFieldRow<Content: View>: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ScaledMetric(relativeTo: .subheadline) private var titleWidth: CGFloat = 88
    let title: String
    var detail: String? = nil
    var detailColor: Color = SideSeatTheme.textSecondary
    var isFocused = false
    var showsDivider = true
    @ViewBuilder let content: () -> Content

    private var layout: AnyLayout {
        dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SideSeatTheme.spaceSM))
            : AnyLayout(HStackLayout(alignment: .center, spacing: SideSeatTheme.spaceMD))
    }

    var body: some View {
        layout {
            VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
                Text(title)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                if let detail {
                    Text(detail)
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(detailColor)
                }
            }
            .frame(width: dynamicTypeSize.isAccessibilitySize ? nil : titleWidth, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)

            content()
                .frame(maxWidth: .infinity, alignment: dynamicTypeSize.isAccessibilitySize ? .leading : .trailing)
        }
        .padding(.horizontal, SideSeatTheme.spaceSM)
        .padding(.vertical, dynamicTypeSize.isAccessibilitySize ? SideSeatTheme.spaceSM : SideSeatTheme.spaceXS)
        .background {
            RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                .fill(isFocused ? SideSeatTheme.accent.opacity(0.06) : .clear)
                .animation(reduceMotion ? nil : .easeOut(duration: SideSeatTheme.Interaction.pressDuration), value: isFocused)
        }
        .overlay(alignment: .bottom) {
            if showsDivider {
                Divider().padding(.horizontal, SideSeatTheme.spaceSM)
            }
        }
    }
}

private struct ProfileEditMenuPicker: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let title: String
    @Binding var selection: String
    let options: [(value: String, label: String)]
    let accessibilityID: String
    var showsDivider = true

    var body: some View {
        ProfileEditFieldRow(title: title, showsDivider: showsDivider) {
            Menu {
                Picker(title, selection: $selection) {
                    ForEach(options, id: \.value) { option in
                        Text(option.label).tag(option.value)
                    }
                }
            } label: {
                HStack(spacing: SideSeatTheme.spaceSM) {
                    Text(options.first(where: { $0.value == selection })?.label ?? selection)
                        .font(.body.weight(.medium))
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .multilineTextAlignment(dynamicTypeSize.isAccessibilitySize ? .leading : .trailing)
                        .fixedSize(horizontal: false, vertical: true)
                    Image(systemName: "chevron.down")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textSecondary)
                }
                .frame(maxWidth: .infinity, minHeight: 44, alignment: dynamicTypeSize.isAccessibilitySize ? .leading : .trailing)
                .contentShape(Rectangle())
            }
            .buttonStyle(SSPressButtonStyle())
            .accessibilityLabel(title)
            .accessibilityValue(options.first(where: { $0.value == selection })?.label ?? selection)
            .accessibilityIdentifier(accessibilityID)
        }
    }
}

private struct ProfileEditorSection<Content: View>: View {
    let title: String
    let systemImage: String
    let tint: Color
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceXS) {
            HStack(spacing: SideSeatTheme.spaceSM) {
                Image(systemName: systemImage)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(tint)
                    .frame(width: 30, height: 30)
                    .background(SideSeatTheme.fillSubtle, in: RoundedRectangle(cornerRadius: SideSeatTheme.mediaRadius))
                    .accessibilityHidden(true)
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
            }
            .padding(.horizontal, SideSeatTheme.spaceSM)
            .padding(.top, SideSeatTheme.spaceXS)

            content()
        }
        .padding(SideSeatTheme.spaceSM)
        .background(SideSeatTheme.surface, in: RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius, style: .continuous)
                .strokeBorder(SideSeatTheme.separator.opacity(0.18), lineWidth: 0.5)
        }
    }
}

private struct ProfileEditorHeader: View {
    let profile: NativeCurrentProfile
    let nickname: String
    let isSubmitting: Bool
    let onClose: () -> Void

    var body: some View {
        HStack(spacing: SideSeatTheme.spaceMD) {
            ProfileAvatar(url: profile.avatarUrl, name: nickname.isEmpty ? profile.displayName : nickname, size: 40)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text("Edit profile")
                    .font(.headline)
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                Text("@\(profile.username)")
                    .font(.caption)
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .lineLimit(1)
            }
            Spacer(minLength: SideSeatTheme.spaceSM)
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                    .frame(width: 44, height: 44)
                    .background(SideSeatTheme.fillTertiary, in: Circle())
            }
            .buttonStyle(SSPressButtonStyle())
            .disabled(isSubmitting)
            .accessibilityLabel(AppLocalization.string("Cancel"))
            .accessibilityIdentifier("profile-edit-close")
        }
        .padding(.horizontal, SideSeatTheme.screenHorizontal)
        .padding(.vertical, SideSeatTheme.spaceSM)
        .background(SideSeatTheme.bgGrouped)
    }
}

struct ProfileEditSection<Content: View>: View {
    let title: String
    let systemImage: String
    let tint: Color
    var contentVerticalPadding: CGFloat = SideSeatTheme.spaceLG
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            HStack(spacing: SideSeatTheme.spaceSM) {
                Image(systemName: systemImage)
                    .foregroundStyle(tint)
                Text(title)
                    .foregroundStyle(SideSeatTheme.textPrimary)
            }
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, SideSeatTheme.spaceXS)

            content()
                .padding(.horizontal, SideSeatTheme.spaceLG)
                .padding(.vertical, contentVerticalPadding)
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
                    .foregroundStyle(SideSeatTheme.textPrimary)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(SideSeatTheme.surface))
            }
            .buttonStyle(SSPressButtonStyle())
            .disabled(isCloseDisabled)
            .accessibilityLabel(AppLocalization.string( "Cancel"))
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
    let focus: FocusState<ProfileEditInputField?>.Binding
    let field: ProfileEditInputField
    let title: String
    @Binding var text: String
    var capitalization: TextInputAutocapitalization = .never
    var autocorrectionDisabled = true
    let accessibilityID: String
    var isOptional = true
    var showsDivider = true

    var body: some View {
        ProfileEditFieldRow(title: title, isFocused: focus.wrappedValue == field, showsDivider: showsDivider) {
            TextField("", text: $text, prompt: Text(isOptional ? AppLocalization.string("Optional") : title).foregroundStyle(SideSeatTheme.placeholderText))
                .textInputAutocapitalization(capitalization)
                .autocorrectionDisabled(autocorrectionDisabled)
                .font(.body)
                .multilineTextAlignment(.leading)
                .focused(focus, equals: field)
                .submitLabel(field.next == nil ? .done : .next)
                .onSubmit { focus.wrappedValue = field.next }
                .tint(SideSeatTheme.accentText)
                .frame(minHeight: 44)
                .accessibilityLabel(title)
                .accessibilityIdentifier(accessibilityID)
        }
        .contentShape(Rectangle())
        .onTapGesture { focus.wrappedValue = field }
    }
}

private struct ProfileEditTaglineField: View {
    let focus: FocusState<ProfileEditInputField?>.Binding
    @Binding var text: String

    var body: some View {
        ProfileEditFieldRow(
            title: AppLocalization.string("Tagline"),
            detail: "\(text.count)/120",
            detailColor: text.count > 120 ? SideSeatTheme.danger : SideSeatTheme.textSecondary,
            isFocused: focus.wrappedValue == .tagline,
            showsDivider: false
        ) {
            TextField("", text: $text, prompt: Text("Optional").foregroundStyle(SideSeatTheme.placeholderText), axis: .vertical)
                .lineLimit(1...3)
                .font(.body)
                .multilineTextAlignment(.leading)
                .focused(focus, equals: .tagline)
                .tint(SideSeatTheme.accentText)
                .padding(.vertical, SideSeatTheme.spaceSM)
                .frame(minHeight: 44)
                .accessibilityLabel(AppLocalization.string("Tagline"))
                .accessibilityIdentifier("profile-edit-tagline")
        }
        .contentShape(Rectangle())
        .onTapGesture { focus.wrappedValue = .tagline }
    }
}

private struct ProfileEditGenderPicker: View {
    @Binding var selection: String

    var body: some View {
        ProfileEditMenuPicker(
            title: AppLocalization.string("Gender"),
            selection: $selection,
            options: [
                ("MALE", AppLocalization.string("Male")),
                ("FEMALE", AppLocalization.string("Female")),
                ("PRIVATE", AppLocalization.string("Prefer not to say"))
            ],
            accessibilityID: "profile-edit-gender"
        )
    }
}

private struct ProfileEditSemesterControl: View {
    @Binding var semester: Int

    var body: some View {
        ProfileEditFieldRow(title: AppLocalization.string("Semester"), showsDivider: false) {
            HStack(spacing: SideSeatTheme.spaceXS) {
                semesterButton(systemImage: "minus", enabled: semester > 1) {
                    semester -= 1
                }

                Text("\(semester)")
                    .font(.body.weight(.semibold).monospacedDigit())
                    .frame(minWidth: 32)
                    .accessibilityIdentifier("profile-edit-semester")

                semesterButton(systemImage: "plus", enabled: semester < 14) {
                    semester += 1
                }
            }
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
                .frame(width: 44, height: 44)
                .ssIconButtonHitTarget()
        }
        .buttonStyle(SSPressButtonStyle())
        .foregroundStyle(enabled ? SideSeatTheme.textPrimary : SideSeatTheme.textSecondary.opacity(0.4))
        .disabled(!enabled)
        .accessibilityLabel(
            systemImage == "plus"
                ? AppLocalization.string( "Increase semester")
                : AppLocalization.string( "Decrease semester")
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
        ProfileEditFieldRow(title: AppLocalization.string("Graduation year"), showsDivider: false) {
            Stepper(value: $year, in: range) {
                Text("\(year)")
                    .font(.body.weight(.semibold).monospacedDigit())
            }
            .frame(minHeight: 44)
            .accessibilityLabel(AppLocalization.string("Graduation year"))
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
        .tint(SideSeatTheme.accentText)
        .padding(.vertical, SideSeatTheme.spaceXS)
        .accessibilityIdentifier(accessibilityID)
    }
}
