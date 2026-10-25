import Observation
import SwiftUI

@MainActor
@Observable
final class RouterPath {
    var path: [AppRoute] = [] {
        didSet {
            if let preview = timePollPreview, !path.contains(.timePoll(token: preview.token)) {
                timePollPreview = nil
            }
        }
    }
    private(set) var timePollPreview: NativeTimePollList.Item?

    func navigate(to route: AppRoute, preview: NativeTimePollList.Item? = nil) {
        timePollPreview = preview.flatMap { route == .timePoll(token: $0.token) ? $0 : nil }
        path.append(route)
    }

    /// Shared plans always sit one level above the Plans root.
    func openPlan(token: String, preview: NativeTimePollList.Item? = nil) {
        timePollPreview = preview?.token == token ? preview : nil
        path = [.timePoll(token: token)]
    }

    func planPreview(for token: String) -> NativeTimePollList.Item? {
        timePollPreview?.token == token ? timePollPreview : nil
    }

    func replaceTop(with route: AppRoute) {
        if path.isEmpty { path = [route] } else { path[path.count - 1] = route }
    }

    func reset() {
        timePollPreview = nil
        path.removeAll()
    }
}

@MainActor
@Observable
final class TabRouter {
    private var routers: [AppTab: RouterPath] = [:]

    func router(for tab: AppTab) -> RouterPath {
        if let router = routers[tab] { return router }
        let router = RouterPath()
        routers[tab] = router
        return router
    }

    func binding(for tab: AppTab) -> Binding<[AppRoute]> {
        let router = router(for: tab)
        return Binding(
            get: { router.path },
            set: { router.path = $0 }
        )
    }

    func resetAll() {
        routers.values.forEach { $0.reset() }
    }
}
