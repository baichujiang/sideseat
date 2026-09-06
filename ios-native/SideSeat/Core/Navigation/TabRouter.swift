import Observation
import SwiftUI

@MainActor
@Observable
final class RouterPath {
    var path: [AppRoute] = []

    func navigate(to route: AppRoute) {
        path.append(route)
    }

    func replaceTop(with route: AppRoute) {
        if path.isEmpty { path = [route] } else { path[path.count - 1] = route }
    }

    func reset() {
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
