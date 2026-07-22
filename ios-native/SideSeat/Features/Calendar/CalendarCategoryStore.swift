import Foundation
import Observation

@MainActor
@Observable
final class CalendarCategoryStore {
    private(set) var categories: [NativeCalendarCategory] = []
    private(set) var isLoading = false
    private(set) var isMutating = false
    private(set) var issue: String?

    func clearIssue() {
        issue = nil
    }

    func load(using session: SessionStore) async {
        guard !isLoading else { return }
        isLoading = true
        issue = nil
        defer { isLoading = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            if categories.isEmpty {
                categories = NativeCalendarCategoryList.uiTestingFixture.categories
            }
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativeCalendarCategoryList> = try await session.sendAuthorized(
                "api/v1/calendar/categories"
            )
            categories = response.data.categories
        } catch {
            issue = error.localizedDescription
        }
    }

    func create(
        name: String,
        color: String,
        subscriptionURL: String?,
        using session: SessionStore
    ) async -> Bool {
        await mutate(using: session) {
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
                self.categories.append(
                    NativeCalendarCategory(
                        id: "ui-calendar-\(UUID().uuidString)",
                        name: name,
                        color: color,
                        sortOrder: self.categories.count,
                        presetKey: nil,
                        icsSubscriptionUrl: subscriptionURL
                    )
                )
                return
            }
            #endif
            let body = NativeCalendarCategoryCreateRequest(
                name: name,
                color: color,
                icsSubscriptionUrl: subscriptionURL
            )
            let _: APIEnvelope<NativeCalendarCategory> = try await session.sendAuthorized(
                "api/v1/calendar/categories",
                method: .post,
                body: body,
                idempotencyKey: UUID().uuidString
            )
            await self.load(using: session)
        }
    }

    func update(
        _ category: NativeCalendarCategory,
        name: String,
        color: String,
        subscriptionURL: String?,
        using session: SessionStore
    ) async -> Bool {
        await mutate(using: session) {
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
                self.categories = self.categories.map { existing in
                    guard existing.id == category.id else { return existing }
                    return NativeCalendarCategory(
                        id: existing.id,
                        name: name,
                        color: color,
                        sortOrder: existing.sortOrder,
                        presetKey: existing.presetKey,
                        icsSubscriptionUrl: existing.isBuiltIn ? existing.icsSubscriptionUrl : subscriptionURL
                    )
                }
                return
            }
            #endif
            let body = NativeCalendarCategoryPatchRequest(
                name: name,
                color: color,
                icsSubscriptionUrl: subscriptionURL,
                includesSubscription: !category.isBuiltIn
            )
            let _: APIEnvelope<NativeCalendarCategory> = try await session.sendAuthorized(
                "api/v1/calendar/categories/\(category.id)",
                method: .patch,
                body: body,
                idempotencyKey: UUID().uuidString
            )
            await self.load(using: session)
        }
    }

    func delete(_ category: NativeCalendarCategory, using session: SessionStore) async -> Bool {
        guard !category.isBuiltIn else { return false }
        return await mutate(using: session) {
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
                self.categories.removeAll { $0.id == category.id }
                return
            }
            #endif
            let _: APIEnvelope<NativeCalendarCategoryDeleteResult> = try await session.sendAuthorized(
                "api/v1/calendar/categories/\(category.id)",
                method: .delete,
                idempotencyKey: UUID().uuidString
            )
            await self.load(using: session)
        }
    }

    private func mutate(
        using _: SessionStore,
        operation: () async throws -> Void
    ) async -> Bool {
        guard !isMutating else { return false }
        isMutating = true
        issue = nil
        defer { isMutating = false }
        do {
            try await operation()
            return true
        } catch {
            issue = error.localizedDescription
            return false
        }
    }
}
