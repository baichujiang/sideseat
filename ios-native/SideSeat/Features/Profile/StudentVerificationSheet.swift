import SwiftUI
import UIKit
import UniformTypeIdentifiers

struct SchoolIdentityBadge: View {
    let school: String?
    let verifiedStudent: Bool
    let status: String
    var compact = false

    private var tone: StudentIdentityTone {
        StudentIdentityDisplay.tone(verifiedStudent: verifiedStudent, status: status)
    }

    private var foreground: Color {
        tone.foreground
    }

    private var fill: Color {
        tone.fill
    }

    private var isVerified: Bool {
        tone == .verified
    }

    var body: some View {
        HStack(spacing: compact ? 5 : 6) {
            if isVerified {
                SchoolBrandMark(school: school, compact: compact)
                Image(systemName: "checkmark.seal.fill")
                    .imageScale(.small)
                Text("Verified")
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("school-identity-badge-text")
            } else {
                Image(systemName: StudentIdentityDisplay.systemImage(verifiedStudent: verifiedStudent, status: status))
                    .imageScale(.small)
                Text(StudentIdentityDisplay.label(school: school, verifiedStudent: verifiedStudent, status: status))
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("school-identity-badge-text")
            }
        }
        .font(compact ? .caption2.weight(.semibold) : .caption.weight(.semibold))
        .foregroundStyle(foreground)
        .padding(.leading, isVerified ? (compact ? 4 : 5) : (compact ? 7 : 9))
        .padding(.trailing, compact ? 7 : 9)
        .padding(.vertical, compact ? 3 : 5)
        .background(fill, in: Capsule())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            StudentIdentityDisplay.label(school: school, verifiedStudent: verifiedStudent, status: status)
        )
        .accessibilityIdentifier("school-identity-badge")
    }
}
extension StudentIdentityTone {
    var foreground: Color {
        switch self {
        case .verified: SideSeatTheme.verifiedSeal
        case .pending: SideSeatTheme.statusWarningText
        case .rejected: SideSeatTheme.statusDangerText
        case .neutral: SideSeatTheme.textSecondaryStrong
        }
    }

    var fill: Color {
        switch self {
        case .verified: SideSeatTheme.verifiedSeal.opacity(0.12)
        case .pending: SideSeatTheme.warning.opacity(0.14)
        case .rejected: SideSeatTheme.danger.opacity(0.12)
        case .neutral: SideSeatTheme.fillTertiary
        }
    }
}

private struct SchoolBrandMark: View {
    let school: String?
    let compact: Bool

    private var code: String {
        StudentIdentityDisplay.schoolCode(school)
    }

    private var brandColor: Color {
        switch code {
        case "TUM": SideSeatTheme.SchoolBrand.tum
        case "LMU": SideSeatTheme.SchoolBrand.lmu
        default: SideSeatTheme.verifiedSeal
        }
    }

    private var logoImage: UIImage? {
        guard !compact else { return nil }
        return UIImage(named: StudentIdentityDisplay.logoAssetName(school))
    }

    private var markWidth: CGFloat {
        if logoImage != nil { return 60 }
        return compact ? 25 : 30
    }

    var body: some View {
        Group {
            if let logoImage {
                Image(uiImage: logoImage)
                    .resizable()
                    .scaledToFit()
                    .padding(.horizontal, 3)
            } else {
                Text(code)
                    .font(.system(size: compact ? 8 : 10, weight: .bold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .padding(.horizontal, compact ? 4 : 5)
                    .accessibilityHidden(true)
                    .accessibilityIdentifier("school-brand-mark-visual")
            }
        }
        .frame(width: markWidth, height: compact ? 16 : 20)
        .background(brandColor, in: RoundedRectangle(cornerRadius: 4, style: .continuous))
        .accessibilityHidden(true)
    }
}

struct StudentVerificationSheet: View {
    @Environment(\.dismiss) private var dismiss
    let profile: NativeCurrentProfile
    let onRequest: (String) async -> NativeStudentVerificationResult?
    let onManualReview: (NativeStudentProofDraft, String) async -> NativeStudentVerificationResult?
    let onRefresh: () async -> Void

    @State private var email: String
    @State private var result: NativeStudentVerificationResult?
    @State private var issue: String?
    @State private var isSubmitting = false
    @State private var isSubmittingProof = false
    @State private var isOpeningVerification = false
    @State private var isChoosingProof = false
    @State private var showsManualReview: Bool
    @State private var proof: NativeStudentProofDraft?
    @FocusState private var isEmailFocused: Bool

    init(
        profile: NativeCurrentProfile,
        onRequest: @escaping (String) async -> NativeStudentVerificationResult?,
        onManualReview: @escaping (NativeStudentProofDraft, String) async -> NativeStudentVerificationResult?,
        onRefresh: @escaping () async -> Void
    ) {
        self.profile = profile
        self.onRequest = onRequest
        self.onManualReview = onManualReview
        self.onRefresh = onRefresh
        _email = State(initialValue: profile.email ?? "")
        _showsManualReview = State(
            initialValue: ["MANUAL_REVIEW_REQUIRED", "REJECTED"]
                .contains(profile.studentVerificationStatus.uppercased())
        )
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("School", value: profile.schoolSummary.schoolShort)
                    SchoolIdentityBadge(
                        school: profile.school,
                        verifiedStudent: displayedVerifiedStudent,
                        status: displayedVerificationStatus
                    )
                    .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16))
                } header: {
                    Text("Current identity")
                } footer: {
                    Text("A verified school identity makes posts, activity signups, course spaces, and chats safer for international students.")
                }

                if displayedVerifiedStudent {
                    Section {
                        Label("School identity verified", systemImage: "checkmark.seal.fill")
                            .foregroundStyle(SideSeatTheme.success)
                    } footer: {
                        Text("Your school badge stays verified. You do not need to verify again.")
                    }
                } else {
                    Section {
                        TextField("you@school.edu", text: $email)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.emailAddress)
                            .autocorrectionDisabled()
                            .focused($isEmailFocused)
                            .accessibilityIdentifier("student-verification-email")
                    } header: {
                        Text("School email")
                    } footer: {
                        Text("School email is the fastest option. Open the verification link from that inbox within 48 hours.")
                    }

                    if showsManualReview {
                        Section {
                            Button {
                                isChoosingProof = true
                            } label: {
                                Label(proof == nil ? "Choose document" : "Choose another document", systemImage: "doc.badge.plus")
                            }
                            .accessibilityIdentifier("student-verification-manual-review")

                            if let proof {
                                LabeledContent("Selected file", value: proof.fileName)
                                Button {
                                    Task { await submitProof() }
                                } label: {
                                    if isSubmittingProof {
                                        ProgressView()
                                            .ssNeutralProgressTint()
                                    } else {
                                        Label("Submit for review", systemImage: "paperplane.fill")
                                    }
                                }
                                .disabled(isSubmittingProof)
                                .accessibilityIdentifier("student-verification-submit-proof")
                            }

                            Button("Use school email instead") {
                                proof = nil
                                showsManualReview = false
                            }
                        } header: {
                            Text("Document review")
                        } footer: {
                            Text(manualReviewFooter)
                        }
                    } else {
                        Section {
                            Button {
                                showsManualReview = true
                            } label: {
                                Label("Can't use your school email?", systemImage: "doc.text.magnifyingglass")
                            }
                        } footer: {
                            Text("Document review is a fallback for students and alumni who cannot use a school inbox.")
                        }
                    }

                    if let result {
                        Section("Next step") {
                            HStack(alignment: .top, spacing: SideSeatTheme.spaceMD) {
                                Image(systemName: deliveryIcon(for: result))
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(deliveryColor(for: result))
                                    .frame(width: 34, height: 34)
                                    .background(
                                        deliveryColor(for: result).opacity(0.12),
                                        in: Circle()
                                    )

                                VStack(alignment: .leading, spacing: 4) {
                                    Text(
                                        verificationResultTitle(for: result)
                                    )
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(SideSeatTheme.textPrimary)

                                    Text(result.message)
                                        .font(.footnote)
                                        .foregroundStyle(SideSeatTheme.textSecondary)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                            }
                            .padding(.vertical, 4)
                            .accessibilityIdentifier("student-verification-delivery-status")

                            if let verifyUrl = result.verifyUrl, let url = URL(string: verifyUrl) {
                                Button {
                                    Task { await verifyUsingLink(url) }
                                } label: {
                                    if isOpeningVerification {
                                        ProgressView()
                                            .ssNeutralProgressTint()
                                    } else {
                                        Label(verificationLinkTitle(for: result), systemImage: "checkmark.seal")
                                    }
                                }
                                .disabled(isOpeningVerification)
                                .accessibilityIdentifier("student-verification-open-link")
                            }
                        }
                    }
                }

                if let issue {
                    Section {
                        Text(issue)
                            .foregroundStyle(SideSeatTheme.danger)
                            .accessibilityIdentifier("student-verification-error")
                    }
                }
            }
            .navigationTitle("School verification")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .fileImporter(
                isPresented: $isChoosingProof,
                allowedContentTypes: [.pdf, .image],
                allowsMultipleSelection: false
            ) { selection in
                prepareProof(selection)
            }
            .onChange(of: email) { oldValue, newValue in
                guard oldValue != newValue, result != nil else { return }
                result = nil
                issue = nil
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if !displayedVerifiedStudent {
                    VStack(spacing: 0) {
                        Divider()
                        if verificationRequestCompleted, let result {
                            HStack(spacing: SideSeatTheme.spaceSM) {
                                Image(systemName: "checkmark.circle.fill")
                                    .font(.body.weight(.semibold))
                                Text(verificationCompletionTitle(for: result))
                                    .font(.body.weight(.semibold))
                            }
                            .foregroundStyle(deliveryColor(for: result))
                            .frame(maxWidth: .infinity, minHeight: 50)
                            .background(
                                deliveryColor(for: result).opacity(0.12),
                                in: RoundedRectangle(
                                    cornerRadius: SideSeatTheme.controlRadius,
                                    style: .continuous
                                )
                            )
                            .accessibilityIdentifier("student-verification-requested")
                            .padding(.horizontal, SideSeatTheme.spaceLG)
                            .padding(.vertical, SideSeatTheme.spaceMD)
                        } else {
                            SSPrimaryButton(
                                title: verificationButtonTitle,
                                isLoading: isSubmitting,
                                fill: .product,
                                accessibilityID: "student-verification-submit"
                            ) {
                                Task { await submit() }
                            }
                            .disabled(!canSubmit || isSubmitting)
                            .padding(.horizontal, SideSeatTheme.spaceLG)
                            .padding(.vertical, SideSeatTheme.spaceMD)
                        }
                    }
                    .background(SideSeatTheme.surface)
                }
            }
        }
    }

    private var normalizedEmail: String {
        email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private var displayedVerificationStatus: String {
        result?.status ?? profile.studentVerificationStatus
    }

    private var displayedVerifiedStudent: Bool {
        displayedVerificationStatus.uppercased() == "VERIFIED" || (result == nil && profile.verifiedStudent)
    }

    private var canSubmit: Bool {
        let value = normalizedEmail
        return value.contains("@") && value.contains(".") && value.count <= 254
    }

    private var verificationRequestCompleted: Bool {
        guard let result else { return false }
        return result.delivery?.lowercased() != "failed"
    }

    private var verificationButtonTitle: String {
        if result?.delivery?.lowercased() == "failed" {
            return String(localized: "Try again")
        }
        return String(localized: "Verify school email")
    }

    private func verificationResultTitle(for result: NativeStudentVerificationResult) -> String {
        switch result.delivery?.lowercased() {
        case "sent":
            return String(localized: "Check your school inbox")
        case "failed":
            return String(localized: "Email delivery failed")
        case "skipped":
            return String(localized: "Complete verification")
        default:
            return result.status.uppercased() == "MANUAL_REVIEW_REQUIRED"
                ? String(localized: "Review submitted")
                : String(localized: "Verification update")
        }
    }

    private func verificationCompletionTitle(for result: NativeStudentVerificationResult) -> String {
        switch result.delivery?.lowercased() {
        case "sent":
            return String(localized: "Verification email sent")
        case "skipped":
            return String(localized: "Verification link ready")
        default:
            return String(localized: "Verification requested")
        }
    }

    private var manualReviewFooter: String {
        let document = profile.studentStatus == "ALUMNI"
            ? String(localized: "a diploma or graduation document")
            : String(localized: "an enrollment document or student card")
        return String(
            localized: "Upload \(document), PDF or image, up to 4 MB. Hide student numbers, birth dates, addresses, and other details we do not need. The private file is deleted after review or within 30 days."
        )
    }

    private func deliveryColor(for result: NativeStudentVerificationResult) -> Color {
        switch result.delivery?.lowercased() {
        case "sent":
            return SideSeatTheme.success
        case "failed":
            return SideSeatTheme.danger
        case "skipped":
            return SideSeatTheme.warning
        default:
            return SideSeatTheme.textSecondary
        }
    }

    private func deliveryIcon(for result: NativeStudentVerificationResult) -> String {
        switch result.delivery?.lowercased() {
        case "sent":
            return "envelope.badge.fill"
        case "failed":
            return "exclamationmark.triangle.fill"
        case "skipped":
            return "link.circle.fill"
        default:
            return "info.circle.fill"
        }
    }

    private func verificationLinkTitle(for result: NativeStudentVerificationResult) -> String {
        result.delivery?.lowercased() == "sent"
            ? String(localized: "Open verification link")
            : String(localized: "Verify with link")
    }

    private func submit() async {
        guard canSubmit, !isSubmitting else { return }
        isEmailFocused = false
        isSubmitting = true
        issue = nil
        defer { isSubmitting = false }

        if let next = await onRequest(normalizedEmail) {
            result = next
            if next.delivery?.lowercased() == "manual" {
                showsManualReview = true
            }
        } else {
            issue = String(localized: "Unable to start school verification.")
        }
    }

    private func prepareProof(_ selection: Result<[URL], Error>) {
        issue = nil
        do {
            guard let url = try selection.get().first else { return }
            let accessed = url.startAccessingSecurityScopedResource()
            defer {
                if accessed { url.stopAccessingSecurityScopedResource() }
            }
            let data = try Data(contentsOf: url, options: .mappedIfSafe)
            guard !data.isEmpty else {
                issue = String(localized: "The selected file is empty.")
                return
            }
            guard data.count <= 4 * 1024 * 1024 else {
                issue = String(localized: "The selected file is larger than 4 MB.")
                return
            }
            let contentType = UTType(filenameExtension: url.pathExtension)
            let mimeType = contentType?.preferredMIMEType ?? "application/octet-stream"
            let allowedMIMETypes = Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"])
            guard allowedMIMETypes.contains(mimeType) else {
                issue = String(localized: "Choose a PDF, JPG, PNG, WEBP, or HEIC file.")
                return
            }
            proof = NativeStudentProofDraft(
                fileName: url.lastPathComponent,
                mimeType: mimeType,
                data: data
            )
        } catch {
            issue = String(localized: "The selected document could not be read.")
        }
    }

    private func submitProof() async {
        guard let proof, !isSubmittingProof else { return }
        isSubmittingProof = true
        issue = nil
        defer { isSubmittingProof = false }

        if let next = await onManualReview(proof, normalizedEmail) {
            result = next
            self.proof = nil
        } else {
            issue = String(localized: "Unable to submit the school document for review.")
        }
    }

    private func verifyUsingLink(_ url: URL) async {
        guard !isOpeningVerification else { return }
        isOpeningVerification = true
        issue = nil
        defer { isOpeningVerification = false }

        do {
            _ = try await URLSession.shared.data(from: url)
            await onRefresh()
            result = NativeStudentVerificationResult(
                status: "VERIFIED",
                delivery: nil,
                verifyUrl: nil,
                message: String(localized: "School email verified. Your posts and profile now show a verified school identity.")
            )
        } catch {
            issue = String(localized: "The verification link could not be opened. Try again in a moment.")
        }
    }
}
