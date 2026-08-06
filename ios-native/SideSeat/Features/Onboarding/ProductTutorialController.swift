import Foundation
import Observation

struct NativeProductTutorialDismissResult: Decodable, Sendable {
    let saved: Bool
    let productTutorialDismissedAt: String?
    let reason: String?
}

struct ProductTutorialStep: Identifiable, Hashable, Sendable {
    let id: String
    let title: String
    let body: String
    let hint: String
    let tab: AppTab
    let systemImage: String
}

@MainActor
@Observable
final class ProductTutorialController {
    private(set) var isPresented = false
    private(set) var stepIndex = 0
    private(set) var isDismissing = false
    private(set) var hasEntered = false
    private var activeUserID: String?

    static let steps: [ProductTutorialStep] = [
        ProductTutorialStep(
            id: "home",
            title: String(localized: "Calendar"),
            body: String(localized: "Keep personal events and confirmed plans in one schedule."),
            hint: String(localized: "Know what your week looks like before you commit to another plan."),
            tab: .home,
            systemImage: "calendar"
        ),
        ProductTutorialStep(
            id: "discover",
            title: String(localized: "Discover"),
            body: String(localized: "Find verified international students through real plans in your school or city."),
            hint: String(localized: "School verification and visibility controls help you choose who can respond."),
            tab: .discover,
            systemImage: "safari.fill"
        ),
        ProductTutorialStep(
            id: "chats",
            title: String(localized: "Chats"),
            body: String(localized: "Ask questions, confirm a plan, and keep the conversation in one place."),
            hint: String(localized: "Turn a conversation into a shared plan without losing the details."),
            tab: .chats,
            systemImage: "bubble.left.and.bubble.right.fill"
        ),
        ProductTutorialStep(
            id: "me",
            title: String(localized: "Me"),
            body: String(localized: "Manage your school identity, profile, courses, plans, and account settings."),
            hint: String(localized: "A verified school identity helps people know who they are meeting."),
            tab: .me,
            systemImage: "person.fill"
        ),
    ]

    private static let localDismissPrefix = "sideseat.productTutorial.dismissed."
    private static let localStepPrefix = "sideseat.productTutorial.step."

    var currentStep: ProductTutorialStep {
        Self.steps[min(max(stepIndex, 0), Self.steps.count - 1)]
    }

    var isLastStep: Bool {
        stepIndex >= Self.steps.count - 1
    }

    func evaluateAutoShow(for user: CurrentUser?) {
        guard let user, user.onboardingComplete, !user.isGuest else {
            activeUserID = nil
            isPresented = false
            hasEntered = false
            return
        }
        activeUserID = user.id
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-skip-tutorial") {
            isPresented = false
            hasEntered = false
            return
        }
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-product-tutorial") {
            present(restoringStepFor: user.id)
            return
        }
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            isPresented = false
            hasEntered = false
            return
        }
        #endif
        if user.productTutorialDismissedAt != nil {
            writeLocalDismissed(userID: user.id)
            clearLocalStep(userID: user.id)
            isPresented = false
            hasEntered = false
            return
        }
        if readLocalDismissed(userID: user.id) {
            isPresented = false
            hasEntered = false
            return
        }
        present(restoringStepFor: user.id)
    }

    func advance(selectTab: (AppTab) -> Void) {
        guard !isLastStep else { return }
        stepIndex += 1
        persistStepIfNeeded()
        selectTab(currentStep.tab)
    }

    func goBack(selectTab: (AppTab) -> Void) {
        guard stepIndex > 0 else { return }
        stepIndex -= 1
        persistStepIfNeeded()
        selectTab(currentStep.tab)
    }

    func jump(to index: Int, selectTab: (AppTab) -> Void) {
        guard Self.steps.indices.contains(index) else { return }
        stepIndex = index
        persistStepIfNeeded()
        selectTab(currentStep.tab)
    }

    func markEntered() {
        hasEntered = true
    }

    func dismiss(using session: SessionStore?, selectTab: (AppTab) -> Void) async {
        guard !isDismissing else { return }
        isDismissing = true
        defer { isDismissing = false }

        if let userID = session?.currentUser?.id {
            writeLocalDismissed(userID: userID)
            clearLocalStep(userID: userID)
        }

        if let session, session.phase == .signedIn, !(session.currentUser?.isGuest ?? true) {
            do {
                let response: APIEnvelope<NativeProductTutorialDismissResult> = try await session.sendAuthorized(
                    "api/v1/me/product-tutorial/dismiss",
                    method: .post,
                    idempotencyKey: UUID().uuidString
                )
                if var user = session.currentUser {
                    let dismissedAt =
                        response.data.productTutorialDismissedAt
                        ?? ISO8601DateFormatter().string(from: Date())
                    user = CurrentUser(
                        id: user.id,
                        username: user.username,
                        nickname: user.nickname,
                        email: user.email,
                        phone: user.phone,
                        avatarUrl: user.avatarUrl,
                        tagline: user.tagline,
                        school: user.school,
                        studentStatus: user.studentStatus,
                        degreeLevel: user.degreeLevel,
                        major: user.major,
                        semester: user.semester,
                        graduationYear: user.graduationYear,
                        gender: user.gender,
                        onboardingComplete: user.onboardingComplete,
                        isGuest: user.isGuest,
                        verifiedStudent: user.verifiedStudent,
                        studentVerificationStatus: user.studentVerificationStatus,
                        usernameUpdatedAt: user.usernameUpdatedAt,
                        productTutorialDismissedAt: dismissedAt,
                        locale: user.locale
                    )
                    session.applyCurrentUser(user)
                }
            } catch {
                // Local dismiss still stands when offline.
            }
        }

        isPresented = false
        hasEntered = false
        stepIndex = 0
        selectTab(.home)
    }

    func replay(for userID: String, selectTab: (AppTab) -> Void) {
        activeUserID = userID
        clearLocalDismissed(userID: userID)
        clearLocalStep(userID: userID)
        stepIndex = 0
        hasEntered = false
        isPresented = true
        writeLocalStep(userID: userID, step: 0)
        selectTab(.home)
    }

    private func present(restoringStepFor userID: String) {
        activeUserID = userID
        let restored = readLocalStep(userID: userID)
        stepIndex = Self.steps.indices.contains(restored) ? restored : 0
        hasEntered = false
        isPresented = true
        writeLocalStep(userID: userID, step: stepIndex)
    }

    private func persistStepIfNeeded() {
        guard let activeUserID else { return }
        writeLocalStep(userID: activeUserID, step: stepIndex)
    }

    private func writeLocalDismissed(userID: String) {
        UserDefaults.standard.set(true, forKey: Self.localDismissPrefix + userID)
    }

    private func readLocalDismissed(userID: String) -> Bool {
        UserDefaults.standard.bool(forKey: Self.localDismissPrefix + userID)
    }

    private func clearLocalDismissed(userID: String) {
        UserDefaults.standard.removeObject(forKey: Self.localDismissPrefix + userID)
    }

    private func readLocalStep(userID: String) -> Int {
        UserDefaults.standard.integer(forKey: Self.localStepPrefix + userID)
    }

    private func writeLocalStep(userID: String, step: Int) {
        UserDefaults.standard.set(step, forKey: Self.localStepPrefix + userID)
    }

    private func clearLocalStep(userID: String) {
        UserDefaults.standard.removeObject(forKey: Self.localStepPrefix + userID)
    }
}
