import SwiftUI
import UIKit

/// A single gesture changes at most one adjacent section. Never wrap at the edges.
enum SSPageSwitchPolicy {
    static func destination(index: Int, count: Int, translation: CGSize, velocityX: CGFloat,
                            width: CGFloat) -> Int {
        guard width > 0, abs(translation.width) > abs(translation.height) * 1.5 else { return index }
        let deliberateTravel = abs(translation.width) >= min(100, width * 0.24)
        let deliberateFlick = abs(translation.width) >= 32 && abs(velocityX) >= 550
            && translation.width * velocityX > 0
        guard deliberateTravel || deliberateFlick else { return index }
        return min(max(index + (translation.width < 0 ? 1 : -1), 0), max(count - 1, 0))
    }
}

/// Keep each section's view identity (and scroll/search state) while moving its viewport.
/// Hidden sections cannot receive touches or accessibility focus. Loads belong to the caller.
struct SSSectionPager<Section: Hashable, Content: View>: View {
    let sections: [Section]
    @Binding var selection: Section
    @ViewBuilder let content: (Section) -> Content
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @State private var translation: CGFloat = 0

    private var selectedIndex: Int { sections.firstIndex(of: selection) ?? 0 }
    private var reduceMotion: Bool {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-reduce-motion") { return true }
        #endif
        return systemReduceMotion
    }

    var body: some View {
        GeometryReader { geometry in
            let width = geometry.size.width
            SSPageGestureHost(selectionIndex: selectedIndex, pageCount: sections.count,
                onBegan: { selection = selection },
                onChanged: { movement in
                    var travel = min(width, max(-width, movement.width))
                    if (selectedIndex == 0 && travel > 0)
                        || (selectedIndex == sections.count - 1 && travel < 0) { travel = 0 }
                    translation = reduceMotion ? 0 : travel
                },
                onEnded: { movement, velocity, cancelled in
                    let next = cancelled ? selectedIndex : SSPageSwitchPolicy.destination(
                        index: selectedIndex, count: sections.count, translation: movement,
                        velocityX: velocity, width: width)
                    withAnimation(reduceMotion ? nil : .easeOut(duration: 0.22)) {
                        translation = 0
                        if next != selectedIndex { selection = sections[next] }
                    }
                }
            ) {
                ZStack(alignment: .topLeading) {
                    ForEach(Array(sections.enumerated()), id: \.element) { index, section in
                        content(section)
                            .frame(width: width, height: geometry.size.height)
                            .offset(x: CGFloat(index - selectedIndex) * width + translation)
                            .allowsHitTesting(section == selection)
                            .accessibilityHidden(section != selection)
                    }
                }
                .frame(width: width, height: geometry.size.height, alignment: .topLeading)
                .clipped()
                .animation(reduceMotion ? nil : .easeOut(duration: 0.22), value: selection)
                .ignoresSafeArea(.container)
            }
        }
    }
}

/// Mark the *whole* control, not only its handle. Origin ownership lasts for the entire touch.
struct SSPageSwipeExclusion: UIViewRepresentable {
    func makeUIView(context: Context) -> SSPageSwipeExclusionView {
        let view = SSPageSwipeExclusionView()
        view.isUserInteractionEnabled = false
        view.isAccessibilityElement = false
        return view
    }
    func updateUIView(_ uiView: SSPageSwipeExclusionView, context: Context) {}
}
final class SSPageSwipeExclusionView: UIView {}

/// Public UIKit gesture delegation gives the decision slider and vertical scroll first-class
/// ownership without installing a global/window gesture or inspecting private SwiftUI classes.
private struct SSPageGestureHost<Content: View>: UIViewControllerRepresentable {
    @Environment(\.self) private var environment
    let selectionIndex: Int
    let pageCount: Int
    let onBegan: () -> Void
    let onChanged: (CGSize) -> Void
    let onEnded: (CGSize, CGFloat, Bool) -> Void
    @ViewBuilder let content: () -> Content

    func makeUIViewController(context: Context) -> SSPageGestureController {
        let controller = SSPageGestureController(root: AnyView(content().environment(\.self, environment)))
        configure(controller)
        return controller
    }
    func updateUIViewController(_ controller: SSPageGestureController, context: Context) {
        if controller.selectionIndex != selectionIndex { controller.view.endEditing(true) }
        configure(controller)
        controller.host.rootView = AnyView(content().environment(\.self, environment))
    }
    private func configure(_ controller: SSPageGestureController) {
        controller.selectionIndex = selectionIndex
        controller.pageCount = pageCount
        controller.onBegan = onBegan
        controller.onChanged = onChanged
        controller.onEnded = onEnded
    }
}

private final class SSPageGestureController: UIViewController, UIGestureRecognizerDelegate {
    let host: UIHostingController<AnyView>
    var selectionIndex = 0
    var pageCount = 0
    var onBegan: (() -> Void)?
    var onChanged: ((CGSize) -> Void)?
    var onEnded: ((CGSize, CGFloat, Bool) -> Void)?

    init(root: AnyView) {
        host = UIHostingController(rootView: root)
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        view.clipsToBounds = true
        addChild(host)
        host.view.backgroundColor = .clear
        host.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(host.view)
        NSLayoutConstraint.activate([
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        host.didMove(toParent: self)
        let pan = UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
        pan.maximumNumberOfTouches = 1
        pan.delegate = self
        view.addGestureRecognizer(pan)
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        let point = touch.location(in: view)
        // Leave screen-edge back/navigation gestures alone, including pushed Plans screens.
        guard pageCount > 1, !UIAccessibility.isVoiceOverRunning,
              point.x > 20, point.x < view.bounds.width - 20,
              !containsExcludedOrigin(point, in: view) else { return false }
        var current = touch.view
        while let candidate = current, candidate !== view {
            if candidate is UITextField || candidate is UITextView || candidate is UISlider
                || candidate is UISwitch { return false }
            current = candidate.superview
        }
        return true
    }

    private func containsExcludedOrigin(_ point: CGPoint, in candidate: UIView) -> Bool {
        guard !candidate.isHidden, candidate.alpha > 0.01 else { return false }
        if candidate is SSPageSwipeExclusionView,
           candidate.bounds.contains(candidate.convert(point, from: view)) { return true }
        return candidate.subviews.contains { containsExcludedOrigin(point, in: $0) }
    }

    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard let pan = gestureRecognizer as? UIPanGestureRecognizer else { return false }
        let velocity = pan.velocity(in: view)
        guard abs(velocity.x) > abs(velocity.y) * 1.5 else { return false }
        return velocity.x < 0 ? selectionIndex < pageCount - 1 : selectionIndex > 0
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                           shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
        // A vertical start rejects this pan immediately; a horizontal start owns paging.
        other is UIPanGestureRecognizer && other.view is UIScrollView
            && other.view?.isDescendant(of: view) == true
    }

    @objc private func handlePan(_ pan: UIPanGestureRecognizer) {
        let point = pan.translation(in: view.window)
        let movement = CGSize(width: point.x, height: point.y)
        switch pan.state {
        case .began:
            onBegan?()
            onChanged?(movement)
        case .changed: onChanged?(movement)
        case .ended: onEnded?(movement, pan.velocity(in: view.window).x, false)
        case .cancelled, .failed: onEnded?(.zero, 0, true)
        default: break
        }
    }
}
