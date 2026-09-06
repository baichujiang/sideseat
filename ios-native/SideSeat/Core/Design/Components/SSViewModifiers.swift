import Popovers
import SwiftUI
import UIKit

/// Semantic sheet detents shared across the app. Screens choose a presentation role instead of
/// inventing an unrelated percentage. Content-sized action panels remain measured separately.
enum SSSheetPresentation {
    static let adaptiveInput = PresentationDetent.custom(SSAdaptiveInputDetent.self)
    static let chooser = PresentationDetent.fraction(0.72)
    static let creationForm = PresentationDetent.fraction(0.78)
}

private struct SSAdaptiveInputDetent: CustomPresentationDetent {
    static func height(in context: Context) -> CGFloat? {
        if context.dynamicTypeSize.isAccessibilitySize {
            return context.maxDetentValue
        }
        return context.maxDetentValue * 0.66
    }
}

/// The app icon reduced to a quiet navigation signature. Product content never uses this mark
/// as decoration; it appears once per root screen so users can immediately orient to SideSeat.
struct SideSeatChromeMark: View {
    var size = SideSeatTheme.BrandChrome.rootMarkSize

    var body: some View {
        Image("BrandMark")
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .clipShape(
                RoundedRectangle(
                    cornerRadius: SideSeatTheme.BrandChrome.rootMarkRadius,
                    style: .continuous
                )
            )
            .overlay {
                RoundedRectangle(
                    cornerRadius: SideSeatTheme.BrandChrome.rootMarkRadius,
                    style: .continuous
                )
                .strokeBorder(Color.white.opacity(0.38), lineWidth: 0.5)
            }
            .accessibilityHidden(true)
    }
}

private struct SSRootNavigationTitleLabel: View {
    let title: LocalizedStringKey

    var body: some View {
        HStack(spacing: SideSeatTheme.BrandChrome.rootTitleSpacing) {
            SideSeatChromeMark()
            Text(title)
                .font(.headline.weight(.semibold))
                .foregroundStyle(SideSeatTheme.textPrimary)
                .lineLimit(1)
        }
        .fixedSize(horizontal: true, vertical: false)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("root-navigation-title")
    }
}

extension View {
    func ssRootNavigationTitle(_ title: LocalizedStringKey) -> some View {
        navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    SSRootNavigationTitleLabel(title: title)
                }
            }
    }

    /// Keeps root-screen search drawers on the same opaque system surface. The native search
    /// field remains adaptive while no longer changing tone with each screen's scroll background.
    func ssRootSearchSurface() -> some View {
        toolbarBackground(SideSeatTheme.bg, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
    }

    /// Applies `accessibilityIdentifier` only when non-nil / non-empty.
    @ViewBuilder
    func ssAccessibilityIdentifier(_ id: String?) -> some View {
        if let id, !id.isEmpty {
            accessibilityIdentifier(id)
        } else {
            self
        }
    }
}

/// Neutral visual treatment for custom icon, row, and content buttons.
/// The label owns its semantic colors and surfaces; this style only standardizes interaction.
struct SSPressButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? SideSeatTheme.Interaction.pressedScale : 1)
            .opacity(
                isEnabled
                    ? (configuration.isPressed ? SideSeatTheme.Interaction.pressedOpacity : 1)
                    : 0.46
            )
            .animation(
                .easeOut(duration: SideSeatTheme.Interaction.pressDuration),
                value: configuration.isPressed
            )
            .animation(
                .easeOut(duration: SideSeatTheme.Interaction.pressDuration),
                value: isEnabled
            )
    }
}

extension View {
    /// Gives a commit action hierarchy without turning toolbar text into brand decoration.
    func ssConfirmationActionStyle() -> some View {
        fontWeight(.semibold)
            .tint(SideSeatTheme.textPrimary)
    }

    /// Keeps compact icon artwork visually restrained while meeting Apple's 44 pt touch target.
    func ssIconButtonHitTarget() -> some View {
        frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
    }
}

// MARK: - Long-press action menu

/// A product-owned action description for long-press menus. Keeping the action model in the
/// design system gives every feature the same hierarchy without coupling it to a feature view.
struct SSLongPressAction: Identifiable {
    enum Role: Equatable {
        case standard
        case destructive
    }

    let id: String
    let title: String
    let systemImage: String
    var role: Role = .standard
    let perform: () -> Void
}

enum SSAnchoredActionMenuEdge {
    case automatic
    case leading
    case trailing
}

private struct SSAnchoredActionSourceFramePreferenceKey: PreferenceKey {
    static let defaultValue = CGRect.zero

    static func reduce(value: inout CGRect, nextValue: () -> CGRect) {
        let next = nextValue()
        if !next.isEmpty {
            value = next
        }
    }
}

/// Presents compact secondary actions beside the object they affect. Features keep ownership of
/// their gestures while this component standardizes placement, dismissal and action hierarchy.
struct SSAnchoredActionMenuTarget<Content: View>: View {
    @Binding private var isPresented: Bool
    private let edge: SSAnchoredActionMenuEdge
    private let sourceCornerRadius: CGFloat
    private let minimumMenuWidth: CGFloat
    private let menuAccessibilityLabel: String
    private let menuAccessibilityIdentifier: String
    private let content: Content
    private let actions: [SSLongPressAction]

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    @State private var sourceFrame = CGRect.zero

    init(
        isPresented: Binding<Bool>,
        edge: SSAnchoredActionMenuEdge = .automatic,
        sourceCornerRadius: CGFloat = 10,
        minimumMenuWidth: CGFloat = 132,
        menuAccessibilityLabel: String,
        menuAccessibilityIdentifier: String,
        @ViewBuilder content: () -> Content,
        actions: () -> [SSLongPressAction]
    ) {
        _isPresented = isPresented
        self.edge = edge
        self.sourceCornerRadius = sourceCornerRadius
        self.minimumMenuWidth = minimumMenuWidth
        self.menuAccessibilityLabel = menuAccessibilityLabel
        self.menuAccessibilityIdentifier = menuAccessibilityIdentifier
        self.content = content()
        self.actions = actions()
    }

    var body: some View {
        content
            .scaleEffect(isPresented ? 1.018 : 1)
            .shadow(
                color: .black.opacity(isPresented ? (colorScheme == .dark ? 0.3 : 0.16) : 0),
                radius: isPresented ? 10 : 0,
                y: isPresented ? 4 : 0
            )
            .animation(.snappy(duration: 0.2), value: isPresented)
            .background {
                GeometryReader { proxy in
                    Color.clear.preference(
                        key: SSAnchoredActionSourceFramePreferenceKey.self,
                        value: proxy.frame(in: .global)
                    )
                }
            }
            .onPreferenceChange(SSAnchoredActionSourceFramePreferenceKey.self) {
                sourceFrame = $0
            }
            .popover(
                present: $isPresented,
                attributes: { attributes in
                    attributes.position = popoverPosition
                    attributes.sourceFrame = { sourceFrame }
                    attributes.sourceFrameInset = UIEdgeInsets(
                        top: -8,
                        left: 0,
                        bottom: -8,
                        right: 0
                    )
                    attributes.screenEdgePadding = UIEdgeInsets(
                        top: 12,
                        left: 12,
                        bottom: 12,
                        right: 12
                    )
                    attributes.presentation.animation = .spring(
                        response: 0.28,
                        dampingFraction: 0.82
                    )
                    attributes.presentation.transition = .scale(
                        scale: 0.94,
                        anchor: transitionAnchor
                    ).combined(with: .opacity)
                    attributes.dismissal.animation = .easeOut(duration: 0.16)
                    attributes.dismissal.transition = .opacity
                    attributes.dismissal.mode = .tapOutside
                    attributes.rubberBandingMode = .none
                    attributes.blocksBackgroundTouches = true
                    // Popovers deliberately leaves dismissal to the caller when background
                    // touches are blocked. Keep the tap shield and still honor outside taps.
                    attributes.onTapOutside = { isPresented = false }
                    attributes.accessibility.shiftFocus = true
                },
                view: {
                    SSAnchoredActionPopover(
                        isPresented: $isPresented,
                        actions: actions,
                        width: menuWidth,
                        accessibilityLabel: menuAccessibilityLabel,
                        accessibilityIdentifier: menuAccessibilityIdentifier
                    )
                },
                background: {
                    SSAnchoredActionBackdrop(
                        opacity: colorScheme == .dark ? 0.24 : 0.12,
                        sourceCornerRadius: sourceCornerRadius
                    )
                }
            )
    }

    private var menuEstimatedHeight: CGFloat {
        let rowHeight: CGFloat = dynamicTypeSize.isAccessibilitySize ? 64 : 48
        return CGFloat(actions.count) * rowHeight + 4
    }

    private var menuWidth: CGFloat {
        let bodyFont = UIFont.preferredFont(forTextStyle: .body)
        let longestTitleWidth = actions
            .map { ($0.title as NSString).size(withAttributes: [.font: bodyFont]).width }
            .max() ?? 0
        let horizontalChrome: CGFloat = 26 + 22 + 12 + 4
        let idealWidth = ceil(longestTitleWidth + horizontalChrome)
        let minimumWidth: CGFloat = dynamicTypeSize.isAccessibilitySize
            ? max(184, minimumMenuWidth)
            : minimumMenuWidth
        let maximumWidth: CGFloat = dynamicTypeSize.isAccessibilitySize ? 260 : 204
        return min(max(idealWidth, minimumWidth), maximumWidth)
    }

    private var windowBounds: CGRect {
        let connectedScenes = UIApplication.shared.connectedScenes
        return connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)?
            .bounds ?? UIScreen.main.bounds
    }

    private var resolvedEdge: SSAnchoredActionMenuEdge {
        switch edge {
        case .automatic:
            guard !sourceFrame.isEmpty else { return .leading }
            return sourceFrame.midX <= windowBounds.midX ? .leading : .trailing
        case .leading, .trailing:
            return edge
        }
    }

    private var presentsAbove: Bool {
        guard !sourceFrame.isEmpty else { return true }
        let availableAbove = max(0, sourceFrame.minY - 24)
        let availableBelow = max(0, windowBounds.height - sourceFrame.maxY - 24)

        if availableAbove >= menuEstimatedHeight { return true }
        if availableBelow >= menuEstimatedHeight { return false }
        return availableAbove >= availableBelow
    }

    private var popoverPosition: Popover.Attributes.Position {
        switch (presentsAbove, resolvedEdge) {
        case (true, .leading):
            return .absolute(originAnchor: .topLeft, popoverAnchor: .bottomLeft)
        case (true, .trailing):
            return .absolute(originAnchor: .topRight, popoverAnchor: .bottomRight)
        case (false, .leading):
            return .absolute(originAnchor: .bottomLeft, popoverAnchor: .topLeft)
        case (false, .trailing):
            return .absolute(originAnchor: .bottomRight, popoverAnchor: .topRight)
        case (_, .automatic):
            return .absolute(originAnchor: .topLeft, popoverAnchor: .bottomLeft)
        }
    }

    private var transitionAnchor: UnitPoint {
        switch (presentsAbove, resolvedEdge) {
        case (true, .leading): .bottomLeading
        case (true, .trailing): .bottomTrailing
        case (false, .leading): .topLeading
        case (false, .trailing): .topTrailing
        case (_, .automatic): .bottomLeading
        }
    }
}

private struct SSAnchoredActionBackdrop: View {
    let opacity: Double
    let sourceCornerRadius: CGFloat

    var body: some View {
        PopoverReader { context in
            Canvas { graphics, size in
                var mask = Path(CGRect(origin: .zero, size: size))
                let source = context.attributes.sourceFrame().insetBy(dx: -4, dy: -4)
                mask.addRoundedRect(
                    in: source,
                    cornerSize: CGSize(
                        width: sourceCornerRadius + 4,
                        height: sourceCornerRadius + 4
                    )
                )
                graphics.fill(
                    mask,
                    with: .color(.black.opacity(opacity)),
                    style: FillStyle(eoFill: true)
                )
            }
            .frame(
                width: context.windowBounds.width,
                height: context.windowBounds.height
            )
            .ignoresSafeArea()
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

private struct SSAnchoredActionPopover: View {
    @Binding var isPresented: Bool
    let actions: [SSLongPressAction]
    let width: CGFloat
    let accessibilityLabel: String
    let accessibilityIdentifier: String

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(actions.enumerated()), id: \.element.id) { index, action in
                if index > 0 {
                    Divider()
                        .padding(.leading, 48)
                }
                actionButton(action)
            }
        }
        .frame(width: width)
        .background(.regularMaterial)
        .overlay {
            RoundedRectangle(cornerRadius: 15, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.1), lineWidth: 0.5)
        }
        .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
        .shadow(color: .black.opacity(0.18), radius: 18, y: 8)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityIdentifier(accessibilityIdentifier)
    }

    private func actionButton(_ action: SSLongPressAction) -> some View {
        Button(role: action.role == .destructive ? .destructive : nil) {
            isPresented = false
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(170))
                action.perform()
            }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: action.systemImage)
                    .font(.body.weight(.medium))
                    .foregroundStyle(
                        action.role == .destructive
                            ? SideSeatTheme.danger
                            : SideSeatTheme.accentText
                    )
                    .frame(width: 22)
                    .accessibilityHidden(true)

                Text(action.title)
                    .font(.body)
                    .foregroundStyle(
                        action.role == .destructive
                            ? SideSeatTheme.statusDangerText
                            : SideSeatTheme.textPrimary
                    )
                    .multilineTextAlignment(.leading)

                Spacer(minLength: 4)
            }
            .padding(.horizontal, 13)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(SSAnchoredActionButtonStyle())
        .accessibilityIdentifier(action.id)
    }
}

private struct SSAnchoredActionButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(Color.primary.opacity(configuration.isPressed ? 0.08 : 0))
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}

private struct SSLongPressActionMenuModifier: ViewModifier {
    let isEnabled: Bool
    let title: String
    let subtitle: String?
    let actions: () -> [SSLongPressAction]

    @State private var isPresented = false

    @ViewBuilder
    func body(content: Content) -> some View {
        if isEnabled {
            content
            .highPriorityGesture(
                LongPressGesture(minimumDuration: 0.48, maximumDistance: 14)
                    .onEnded { completed in
                        guard completed else { return }
                        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
                        isPresented = true
                    }
            )
            .ssLongPressActionMenu(
                isPresented: $isPresented,
                title: title,
                subtitle: subtitle,
                actions: actions()
            )
        } else {
            content
        }
    }
}

private struct SSTapOrLongPressActionMenuModifier: ViewModifier {
    let isEnabled: Bool
    let title: String
    let subtitle: String?
    let actions: () -> [SSLongPressAction]
    let onTap: () -> Void

    @State private var isPresented = false

    @ViewBuilder
    func body(content: Content) -> some View {
        let tap = TapGesture().onEnded(onTap)
        let longPress = LongPressGesture(minimumDuration: 0.48, maximumDistance: 14)
            .onEnded { completed in
                guard completed else { return }
                UIImpactFeedbackGenerator(style: .soft).impactOccurred()
                isPresented = true
            }

        if isEnabled {
            content
                .gesture(tap.exclusively(before: longPress))
                .ssLongPressActionMenu(
                    isPresented: $isPresented,
                    title: title,
                    subtitle: subtitle,
                    actions: actions()
                )
        } else {
            content.gesture(tap)
        }
    }
}

private struct SSLongPressActionMenuSheet: View {
    @Binding var isPresented: Bool
    let title: String
    let subtitle: String?
    let actions: [SSLongPressAction]

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        ScrollView {
            VStack(spacing: SideSeatTheme.spaceMD) {
                header
                actionGroup

                Button {
                    isPresented = false
                } label: {
                    Text("Cancel")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .frame(maxWidth: .infinity, minHeight: 52)
                        .background(
                            SideSeatTheme.surface,
                            in: RoundedRectangle(
                                cornerRadius: 16,
                                style: .continuous
                            )
                        )
                        .overlay {
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .strokeBorder(SideSeatTheme.separator.opacity(0.42), lineWidth: 0.5)
                        }
                }
                .buttonStyle(SSPressButtonStyle())
                .accessibilityIdentifier("long-press-menu-cancel")
            }
            .padding(.horizontal, SideSeatTheme.spaceMD)
            .padding(.top, 14)
            .padding(.bottom, SideSeatTheme.spaceSM)
        }
        .scrollIndicators(.hidden)
        .background(SideSeatTheme.bgGrouped)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("long-press-action-menu")
        .presentationDetents(presentationDetents)
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(SideSeatTheme.heroRadius)
        .presentationBackground(SideSeatTheme.bgGrouped)
        .presentationContentInteraction(.scrolls)
    }

    private var header: some View {
        VStack(spacing: 3) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(SideSeatTheme.textPrimary)
                .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 2)
                .multilineTextAlignment(.center)

            if let subtitle, !subtitle.isEmpty {
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(SideSeatTheme.textSecondary)
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 2)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }

    private var actionGroup: some View {
        VStack(spacing: 0) {
            ForEach(Array(actions.enumerated()), id: \.element.id) { index, action in
                if index > 0 {
                    Divider()
                        .padding(.leading, 52)
                }
                actionButton(action)
            }
        }
        .background(
            SideSeatTheme.surface,
            in: RoundedRectangle(cornerRadius: 16, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(SideSeatTheme.separator.opacity(0.42), lineWidth: 0.5)
        }
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func actionButton(_ action: SSLongPressAction) -> some View {
        let tint = action.role == .destructive ? SideSeatTheme.danger : SideSeatTheme.accentText
        return Button(role: action.role == .destructive ? .destructive : nil) {
            isPresented = false
            Task { @MainActor in
                // Let the action panel finish dismissing before an action presents its own
                // confirmation alert or sheet.
                try? await Task.sleep(for: .milliseconds(180))
                action.perform()
            }
        } label: {
            HStack(spacing: SideSeatTheme.spaceMD) {
                Image(systemName: action.systemImage)
                    .font(.body.weight(.medium))
                    .foregroundStyle(tint)
                    .frame(width: 24, height: 30)
                    .accessibilityHidden(true)

                Text(action.title)
                    .font(.body)
                    .foregroundStyle(
                        action.role == .destructive
                            ? SideSeatTheme.statusDangerText
                            : SideSeatTheme.textPrimary
                    )
                    .multilineTextAlignment(.leading)

                Spacer(minLength: SideSeatTheme.spaceSM)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(SSPressButtonStyle())
        .accessibilityIdentifier(action.id)
    }

    private var presentationDetents: Set<PresentationDetent> {
        if dynamicTypeSize.isAccessibilitySize {
            return [.large]
        }
        let subtitleHeight: CGFloat = subtitle?.isEmpty == false ? 18 : 0
        let estimatedHeight = 124 + CGFloat(actions.count) * 52 + subtitleHeight
        return [.height(min(max(estimatedHeight, 200), 430))]
    }
}

extension View {
    /// Presents the SideSeat action panel from a long press while preserving the target's tap.
    func ssLongPressActionMenu(
        isEnabled: Bool = true,
        title: String,
        subtitle: String? = nil,
        actions: @escaping () -> [SSLongPressAction]
    ) -> some View {
        modifier(
            SSLongPressActionMenuModifier(
                isEnabled: isEnabled,
                title: title,
                subtitle: subtitle,
                actions: actions
            )
        )
    }

    /// Use for custom row surfaces that need mutually exclusive tap navigation and long press.
    func ssTapOrLongPressActionMenu(
        isEnabled: Bool = true,
        title: String,
        subtitle: String? = nil,
        actions: @escaping () -> [SSLongPressAction],
        onTap: @escaping () -> Void
    ) -> some View {
        modifier(
            SSTapOrLongPressActionMenuModifier(
                isEnabled: isEnabled,
                title: title,
                subtitle: subtitle,
                actions: actions,
                onTap: onTap
            )
        )
    }

    /// Presents the same panel for features that already own a custom long-press gesture/state.
    func ssLongPressActionMenu(
        isPresented: Binding<Bool>,
        title: String,
        subtitle: String? = nil,
        actions: [SSLongPressAction]
    ) -> some View {
        sheet(isPresented: isPresented) {
            SSLongPressActionMenuSheet(
                isPresented: isPresented,
                title: title,
                subtitle: subtitle,
                actions: actions
            )
        }
    }
}

// MARK: - Product action prompt

/// A product-owned action used by ``SSActionPrompt``. Product confirmations use this instead of
/// SwiftUI's platform alert so hierarchy, placement and interaction remain consistent across OS
/// releases. System permission prompts and system-owned input controls must remain native.
struct SSActionPromptAction: Identifiable {
    enum Role: Equatable {
        case standard
        case cancel
        case destructive
    }

    let id: String
    let title: String
    var systemImage: String?
    var role: Role
    let perform: () -> Void

    init(
        id: String,
        title: String,
        systemImage: String? = nil,
        role: Role = .standard,
        perform: @escaping () -> Void
    ) {
        self.id = id
        self.title = title
        self.systemImage = systemImage
        self.role = role
        self.perform = perform
    }
}

private struct SSActionPromptModifier: ViewModifier {
    @Binding var isPresented: Bool
    let title: String
    let message: String?
    let systemImage: String
    let tint: Color
    let dismissOnTapOutside: Bool
    let onDismiss: () -> Void
    let accessibilityIdentifier: String
    let actions: () -> [SSActionPromptAction]

    /// Popovers reports every dismissal through the same callback. Track button-driven
    /// dismissals so Escape/outside dismissal can run feature cleanup without clearing data
    /// that a delayed committed action still needs.
    @State private var isActionDismissal = false

    func body(content: Content) -> some View {
        // Popovers needs a concrete view to read a UIWindow and source frame from. SwiftUI's
        // transparent `Group` can distribute modifiers to its children and silently lose that
        // anchor, so every prompt supplies one stable presentation surface here.
        ZStack {
            content
        }
            .popover(
                present: $isPresented,
                attributes: { attributes in
                    attributes.position = .relative(popoverAnchors: [.center])
                    attributes.screenEdgePadding = UIEdgeInsets(
                        top: 18,
                        left: 16,
                        bottom: 18,
                        right: 16
                    )
                    attributes.presentation.animation = .spring(
                        response: 0.3,
                        dampingFraction: 0.84
                    )
                    attributes.presentation.transition = .scale(
                        scale: 0.94,
                        anchor: .center
                    ).combined(with: .opacity)
                    attributes.dismissal.animation = .easeOut(duration: 0.16)
                    attributes.dismissal.transition = .scale(
                        scale: 0.98,
                        anchor: .center
                    ).combined(with: .opacity)
                    attributes.dismissal.mode = .none
                    attributes.rubberBandingMode = .none
                    attributes.blocksBackgroundTouches = true
                    // The library's VoiceOver-only X sits outside the card, uses non-localized
                    // copy and can overflow compact iPhone widths. The prompt's own Cancel/OK
                    // actions plus the accessibility escape gesture provide the close paths.
                    attributes.accessibility.dismissButtonLabel = nil
                    attributes.onTapOutside = {
                        guard dismissOnTapOutside else { return }
                        isPresented = false
                    }
                    attributes.onDismiss = {
                        if isActionDismissal {
                            isActionDismissal = false
                        } else {
                            onDismiss()
                        }
                    }
                    attributes.accessibility.shiftFocus = true
                },
                view: {
                    SSActionPrompt(
                        isPresented: $isPresented,
                        title: title,
                        message: message,
                        systemImage: systemImage,
                        tint: tint,
                        accessibilityIdentifier: accessibilityIdentifier,
                        performAction: performAction,
                        actions: actions()
                    )
                },
                background: {
                    Color.black.opacity(0.32)
                        .ignoresSafeArea()
                        .accessibilityHidden(true)
                }
            )
            .onChange(of: isPresented) { _, presented in
                guard presented else { return }
                UIApplication.shared.sendAction(
                    #selector(UIResponder.resignFirstResponder),
                    to: nil,
                    from: nil,
                    for: nil
                )
            }
    }

    private func performAction(_ action: SSActionPromptAction) {
        isActionDismissal = true
        isPresented = false
        Task { @MainActor in
            // Complete the window-level dismissal before an action opens another sheet,
            // route or prompt. This also prevents two modal focus scopes from overlapping.
            try? await Task.sleep(for: .milliseconds(170))
            action.perform()
        }
    }
}

/// A compact centered prompt for product actions. Two choices stay side by side at regular text
/// sizes; larger choice sets and accessibility text use scan-friendly vertical rows.
private struct SSActionPrompt: View {
    @Binding var isPresented: Bool
    let title: String
    let message: String?
    let systemImage: String
    let tint: Color
    let accessibilityIdentifier: String
    let performAction: (SSActionPromptAction) -> Void
    let actions: [SSActionPromptAction]

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        ViewThatFits(in: .vertical) {
            promptContent
                .fixedSize(horizontal: false, vertical: true)

            ScrollView {
                promptContent
            }
            .scrollIndicators(.hidden)
            .frame(height: maximumCardHeight)
        }
        .frame(width: cardWidth)
        .background(
            SideSeatTheme.surface,
            in: RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius, style: .continuous)
                .strokeBorder(SideSeatTheme.separator.opacity(0.5), lineWidth: 0.5)
        }
        .clipShape(RoundedRectangle(cornerRadius: SideSeatTheme.cardRadius, style: .continuous))
        .shadow(
            color: .black.opacity(colorScheme == .dark ? 0.4 : 0.2),
            radius: 28,
            y: 14
        )
        .accessibilityElement(children: .contain)
        .accessibilityLabel(title)
        .accessibilityIdentifier(accessibilityIdentifier)
        .accessibilityAction(.escape) {
            isPresented = false
        }
    }

    private var promptContent: some View {
        VStack(spacing: SideSeatTheme.spaceLG) {
            VStack(spacing: SideSeatTheme.spaceMD) {
                Image(systemName: systemImage)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(tint)
                    .frame(width: 44, height: 44)
                    .background(tint.opacity(0.12), in: Circle())
                    .overlay {
                        Circle()
                            .strokeBorder(tint.opacity(0.18), lineWidth: 0.5)
                    }
                    .accessibilityHidden(true)

                VStack(spacing: SideSeatTheme.spaceSM) {
                    Text(title)
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(SideSeatTheme.textPrimary)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)

                    if let message, !message.isEmpty {
                        Text(message)
                            .font(.subheadline)
                            .foregroundStyle(SideSeatTheme.textSecondaryStrong)
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding(.horizontal, SideSeatTheme.spaceLG)
            .padding(.top, SideSeatTheme.spaceLG)

            actionGroup
                .padding(.horizontal, SideSeatTheme.spaceMD)
                .padding(.bottom, SideSeatTheme.spaceMD)
        }
    }

    @ViewBuilder
    private var actionGroup: some View {
        if actions.count == 2, !dynamicTypeSize.isAccessibilitySize {
            HStack(spacing: SideSeatTheme.spaceSM) {
                ForEach(horizontalActions) { action in
                    promptButton(action, compact: true)
                }
            }
        } else {
            VStack(spacing: SideSeatTheme.spaceSM) {
                ForEach(actions) { action in
                    promptButton(action, compact: false)
                }
            }
        }
    }

    /// Keep the safe exit on the leading side and the committed action on the trailing side,
    /// independent of how a feature historically ordered its platform-alert buttons.
    private var horizontalActions: [SSActionPromptAction] {
        guard
            actions.count == 2,
            let cancelIndex = actions.firstIndex(where: { $0.role == .cancel })
        else {
            return actions
        }
        let cancel = actions[cancelIndex]
        let committed = actions[cancelIndex == 0 ? 1 : 0]
        return [cancel, committed]
    }

    private func promptButton(_ action: SSActionPromptAction, compact: Bool) -> some View {
        Button(role: action.role == .destructive ? .destructive : nil) {
            performAction(action)
        } label: {
            HStack(spacing: SideSeatTheme.spaceSM) {
                if !compact, let systemImage = action.systemImage {
                    Image(systemName: systemImage)
                        .font(.body.weight(.medium))
                        .frame(width: 22)
                        .accessibilityHidden(true)
                }

                Text(action.title)
                    .font(.body.weight(.semibold))
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .foregroundStyle(actionForeground(action.role))
            .padding(.horizontal, compact ? 10 : 14)
            .padding(.vertical, 9)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(
                actionBackground(action.role),
                in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius, style: .continuous)
                    .strokeBorder(actionBorder(action.role), lineWidth: 0.5)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(SSPressButtonStyle())
        .accessibilityIdentifier(action.id)
    }

    private func actionForeground(_ role: SSActionPromptAction.Role) -> Color {
        switch role {
        case .standard:
            SideSeatTheme.accentText
        case .cancel:
            SideSeatTheme.textPrimary
        case .destructive:
            SideSeatTheme.statusDangerText
        }
    }

    private func actionBackground(_ role: SSActionPromptAction.Role) -> Color {
        switch role {
        case .standard:
            SideSeatTheme.accent.opacity(colorScheme == .dark ? 0.18 : 0.1)
        case .cancel:
            SideSeatTheme.fillTertiary
        case .destructive:
            SideSeatTheme.danger.opacity(colorScheme == .dark ? 0.2 : 0.1)
        }
    }

    private func actionBorder(_ role: SSActionPromptAction.Role) -> Color {
        switch role {
        case .standard:
            SideSeatTheme.accent.opacity(0.24)
        case .cancel:
            SideSeatTheme.separator.opacity(0.38)
        case .destructive:
            SideSeatTheme.danger.opacity(0.28)
        }
    }

    private var cardWidth: CGFloat {
        let available = max(280, UIScreen.main.bounds.width - 32)
        return min(dynamicTypeSize.isAccessibilitySize ? 360 : 340, available)
    }

    private var maximumCardHeight: CGFloat {
        UIScreen.main.bounds.height * 0.78
    }
}

extension View {
    /// Replaces platform-styled product alerts with a centered SideSeat action prompt. Use native
    /// alerts only when the operating system owns the permission or input interaction.
    /// `onDismiss` handles non-button dismissal such as an allowed outside tap or accessibility
    /// escape; each button action remains responsible for its own feature-state cleanup.
    func ssActionPrompt(
        isPresented: Binding<Bool>,
        title: String,
        message: String? = nil,
        systemImage: String = "questionmark",
        tint: Color = SideSeatTheme.accentText,
        dismissOnTapOutside: Bool = false,
        onDismiss: @escaping () -> Void = {},
        accessibilityIdentifier: String = "ss-action-prompt",
        actions: @escaping () -> [SSActionPromptAction]
    ) -> some View {
        modifier(
            SSActionPromptModifier(
                isPresented: isPresented,
                title: title,
                message: message,
                systemImage: systemImage,
                tint: tint,
                dismissOnTapOutside: dismissOnTapOutside,
                onDismiss: onDismiss,
                accessibilityIdentifier: accessibilityIdentifier,
                actions: actions
            )
        )
    }
}
