import SwiftUI
import UIKit

/// Prevents the center Create tab from ever becoming the selected TabView page.
/// Returning `false` from `shouldSelect` stops the blank-page flash that happens when
/// SwiftUI briefly settles on the Create placeholder before the selection binding reverts.
struct CreateTabBarInterceptor: UIViewControllerRepresentable {
    var tabOrder: [AppTab]
    var createTab: AppTab = .create
    var onCreateTap: () -> Void
    var onSelectTab: (AppTab) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(
            tabOrder: tabOrder,
            createTab: createTab,
            onCreateTap: onCreateTap,
            onSelectTab: onSelectTab
        )
    }

    func makeUIViewController(context: Context) -> BridgeViewController {
        let controller = BridgeViewController()
        controller.coordinator = context.coordinator
        return controller
    }

    func updateUIViewController(_ uiViewController: BridgeViewController, context: Context) {
        context.coordinator.tabOrder = tabOrder
        context.coordinator.createTab = createTab
        context.coordinator.onCreateTap = onCreateTap
        context.coordinator.onSelectTab = onSelectTab
        uiViewController.coordinator = context.coordinator
        uiViewController.installDelegateIfNeeded()
    }

    final class Coordinator: NSObject, UITabBarControllerDelegate {
        var tabOrder: [AppTab]
        var createTab: AppTab
        var onCreateTap: () -> Void
        var onSelectTab: (AppTab) -> Void
        weak var forwardingDelegate: UITabBarControllerDelegate?

        init(
            tabOrder: [AppTab],
            createTab: AppTab,
            onCreateTap: @escaping () -> Void,
            onSelectTab: @escaping (AppTab) -> Void
        ) {
            self.tabOrder = tabOrder
            self.createTab = createTab
            self.onCreateTap = onCreateTap
            self.onSelectTab = onSelectTab
        }

        func tabBarController(
            _ tabBarController: UITabBarController,
            shouldSelect viewController: UIViewController
        ) -> Bool {
            guard let tab = tab(for: viewController, in: tabBarController) else {
                return forwardingDelegate?.tabBarController?(
                    tabBarController,
                    shouldSelect: viewController
                ) ?? true
            }

            if tab == createTab {
                onCreateTap()
                return false
            }

            return forwardingDelegate?.tabBarController?(
                tabBarController,
                shouldSelect: viewController
            ) ?? true
        }

        func tabBarController(
            _ tabBarController: UITabBarController,
            didSelect viewController: UIViewController
        ) {
            if let tab = tab(for: viewController, in: tabBarController), tab != createTab {
                onSelectTab(tab)
            }
            forwardingDelegate?.tabBarController?(tabBarController, didSelect: viewController)
        }

        private func tab(
            for viewController: UIViewController,
            in tabBarController: UITabBarController
        ) -> AppTab? {
            guard let controllers = tabBarController.viewControllers,
                  let index = controllers.firstIndex(of: viewController),
                  tabOrder.indices.contains(index)
            else {
                return nil
            }
            return tabOrder[index]
        }
    }

    final class BridgeViewController: UIViewController {
        var coordinator: Coordinator?
        private weak var installedTabBarController: UITabBarController?

        override func viewDidLoad() {
            super.viewDidLoad()
            view.isUserInteractionEnabled = false
            view.backgroundColor = .clear
        }

        override func didMove(toParent parent: UIViewController?) {
            super.didMove(toParent: parent)
            installDelegateIfNeeded()
        }

        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            installDelegateIfNeeded()
        }

        override func viewDidLayoutSubviews() {
            super.viewDidLayoutSubviews()
            installDelegateIfNeeded()
        }

        func installDelegateIfNeeded() {
            guard let coordinator, let tabBarController = nearestTabBarController() else { return }

            if installedTabBarController !== tabBarController
                || tabBarController.delegate !== coordinator
            {
                if tabBarController.delegate !== coordinator {
                    coordinator.forwardingDelegate = tabBarController.delegate
                }
                tabBarController.delegate = coordinator
                installedTabBarController = tabBarController
            }

            if let createIndex = coordinator.tabOrder.firstIndex(of: coordinator.createTab),
               let items = tabBarController.tabBar.items,
               items.indices.contains(createIndex)
            {
                items[createIndex].accessibilityIdentifier = "create-action"
            }
        }

        private func nearestTabBarController() -> UITabBarController? {
            if let tabBarController { return tabBarController }

            var current: UIViewController? = self
            while let controller = current {
                if let tab = controller as? UITabBarController {
                    return tab
                }
                if let tab = controller.tabBarController {
                    return tab
                }
                for child in controller.children {
                    if let tab = child as? UITabBarController {
                        return tab
                    }
                }
                current = controller.parent
            }
            return nil
        }
    }
}
