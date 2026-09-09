import SwiftUI

/// SideSeat design tokens.
///
/// # Token freeze (Phase E)
/// Palette, radii, spacing, `ButtonFill`, `HubTint`, `Chat`, and `CalendarChrome` metrics are
/// centrally owned. The 2026-09-09 visual refresh introduces neutral product actions and
/// original activity artwork; new UI must consume these APIs (or `Core/Design/Components`). Do not introduce
/// ad-hoc hex / system `.blue` / feature-local corner radii except:
/// - user-authored content colors (`Color(hex:)` on events/courses)
/// - semantic system roles already wrapped (`danger` / `success` / `warning`)
///
/// Changing Rose `#FB4185` / `AccentColor` requires an explicit product decision + README update.
///
/// ## Brand surface vs product surface
/// - **Brand surface** (gradients / `SideSeatBrandMark` allowed): Login, Signup, Forgot password;
///   optional cold-start empty state and Tutorial primary CTA.
/// - **Product chrome** may use the compact app mark in root navigation only. It must not become
///   decoration inside cards, lists, forms, or secondary screens.
/// - **Product surface** (no full-bleed brand gradients): Home, Discover, Chats, Me / Settings
///   (Me hero may keep a light wash stroke only).
///
/// Interactive accent is always Rose via `AccentColor` / ``accent`` — never reuse accent for
/// calendar “now”, errors, or success. See `docs/DESIGN_SYSTEM.md`.
enum SideSeatTheme {
    // MARK: - Brand palette

    /// Top-left coral from the brand mark. Decorative / CTA gradient only.
    static let coral = Color(red: 0.984, green: 0.451, blue: 0.373) // #FB735F
    /// Top-right peach / gold. Decorative / softWash only.
    static let peach = Color(red: 0.996, green: 0.816, blue: 0.592) // #FED097
    /// Bottom-left magenta. Decorative / soft shadow tint.
    static let magenta = Color(red: 0.875, green: 0.145, blue: 0.631) // #DF25A1
    /// Bottom-right orchid. Decorative only.
    static let orchid = Color(red: 0.816, green: 0.388, blue: 0.922) // #D063EB
    /// Mid rose — single interactive accent (matches AccentColor asset). Do not change.
    static let rose = Color(red: 0.984, green: 0.255, blue: 0.522) // #FB4185
    /// Soft cream pulled from the wordmark center.
    static let cream = Color(red: 1.0, green: 0.937, blue: 0.922) // #FFEFEB
    /// Near-black ink for brand-surface contrast text (use sparingly).
    static let ink = Color(red: 0.14, green: 0.10, blue: 0.16)
    /// Foreground on the bright product accent. Pure black leaves room for icon antialiasing.
    static let onAccent = Color.black

    /// Selected controls, key icons, unread dots and borders. Product CTAs use `ProductAction`.
    /// Body text, captions, dates, display names, and status labels use text or semantic colors.
    /// Resolve the product accent independently from SwiftUI's environment tint. The
    /// reserved `AccentColor` asset name follows `.tint`, so it cannot safely serve both
    /// neutral utility controls and explicit brand surfaces.
    static let accent = Color(
        uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 1.0, green: 0.416, blue: 0.647, alpha: 1)
                : UIColor(red: 0.984, green: 0.255, blue: 0.522, alpha: 1)
        }
    )
    /// High-contrast brand ink for compact selected icons on light surfaces.
    static let accentText = Color(
        uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 1.0, green: 0.416, blue: 0.647, alpha: 1)
                : UIColor(red: 0.65, green: 0.03, blue: 0.27, alpha: 1)
        }
    )

    // MARK: - Semantic (product)

    /// Main flow background (`systemBackground`).
    static let bg = Color(uiColor: .systemBackground)
    /// Grouped list background (`systemGroupedBackground`).
    static let bgGrouped = Color(uiColor: .systemGroupedBackground)
    /// Cards / inset grouped rows (`secondarySystemGroupedBackground`).
    static let surface = Color(uiColor: .secondarySystemGroupedBackground)
    static let textPrimary = Color.primary
    static let textSecondary = Color.secondary
    /// Default tint for navigation, menus, close/cancel controls, and other utility actions.
    /// Product accent is opt-in so ordinary controls never inherit brand Rose accidentally.
    static let utilityAction = Color.primary
    /// Secondary text used at compact sizes where the system secondary alpha can miss WCAG AA.
    static let textSecondaryStrong = Color(
        uiColor: UIColor { traits in
            if traits.userInterfaceStyle == .dark {
                return UIColor(red: 0.80, green: 0.80, blue: 0.83, alpha: 1)
            }
            return UIColor(red: 0.24, green: 0.24, blue: 0.27, alpha: 1)
        }
    )
    /// Form placeholders remain visually secondary while meeting contrast on field fills.
    static let placeholderText = textSecondaryStrong
    /// Delete, validation errors — never use ``accent`` for these.
    static let danger = Color(uiColor: .systemRed)
    /// Success / confirmation — never use ``accent`` for these.
    static let success = Color(uiColor: .systemGreen)
    static let statusSuccessText = Color(
        uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0.45, green: 0.85, blue: 0.55, alpha: 1)
                : UIColor(red: 0.05, green: 0.40, blue: 0.18, alpha: 1)
        }
    )
    static let statusWarningText = Color(
        uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0.95, green: 0.72, blue: 0.30, alpha: 1)
                : UIColor(red: 0.55, green: 0.28, blue: 0.0, alpha: 1)
        }
    )
    static let statusDangerText = Color(
        uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 1.0, green: 0.55, blue: 0.52, alpha: 1)
                : UIColor(red: 0.65, green: 0.08, blue: 0.06, alpha: 1)
        }
    )
    /// Calendar today / current-time marker. Light mode uses a readable mid Rose instead of the
    /// former burgundy; dark mode uses the same bright Rose as the product accent.
    static let calendarNow = Color(
        uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 1.0, green: 0.416, blue: 0.647, alpha: 1) // #FF6AA5
                : UIColor(red: 0.82, green: 0.102, blue: 0.38, alpha: 1) // #D11A61
        }
    )
    /// Foreground paired with the adaptive current-time badge fill.
    static let calendarNowForeground = Color(
        uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark ? .black : .white
        }
    )
    /// The current-time badge uses the same Rose as the line and today labels.
    static let calendarNowFill = calendarNow
    /// Course tiles without a custom hex — distinct from accent (not system `.blue`).
    static let courseFallback = Color(red: 0.20, green: 0.52, blue: 0.86)
    /// Verified student seal — trust blue, distinct from interactive Rose accent.
    /// Keep this off ``accent`` so identity chrome never reads as a product-wide pink wash.
    static let verifiedSeal = Color(
        uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0.45, green: 0.70, blue: 1.0, alpha: 1)
                : UIColor(red: 0.05, green: 0.30, blue: 0.64, alpha: 1)
        }
    )
    /// Pin / restore / soft caution — never use for selection or errors.
    static let warning = Color.orange
    /// Non-grouped elevated fill (chat peer bubbles, soft chips).
    static let fillSubtle = Color(uiColor: .secondarySystemBackground)
    /// Control / chip wells (`tertiarySystemFill`).
    static let fillTertiary = Color(uiColor: .tertiarySystemFill)
    /// Hairline borders that adapt to light, dark, and increased-contrast appearances.
    static let separator = Color(uiColor: .separator)

    /// Product actions are quiet ink in Light and soft chalk in Dark. Rose stays an accent.
    enum ProductAction {
        static let fill = Color(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0.87, green: 0.90, blue: 0.88, alpha: 1)
                : UIColor(red: 0.16, green: 0.19, blue: 0.18, alpha: 1)
        })
        static let foreground = Color(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0.12, green: 0.15, blue: 0.14, alpha: 1)
                : UIColor(red: 0.98, green: 0.98, blue: 0.96, alpha: 1)
        })
    }

    /// Warm, low-chroma inset for activity context; not a selection or status color.
    static let activityInset = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.16, green: 0.18, blue: 0.17, alpha: 1)
            : UIColor(red: 0.96, green: 0.95, blue: 0.92, alpha: 1)
    })
    /// Compact media thumbnails used by create pickers.
    static let mediaRadius: CGFloat = 10

    // MARK: - Hub / avatar (functional tints — shape unified via SSListRow)

    /// Me hub row icon tints. Distinct by function; not interactive accent.
    enum HubTint {
        static let courses = Color(red: 0.18, green: 0.62, blue: 0.42)
        static let plans = Color(red: 0.20, green: 0.52, blue: 0.86)
        static let posts = Color(red: 0.08, green: 0.58, blue: 0.62)
        static let savedPosts = Color(red: 0.76, green: 0.43, blue: 0.10)
        static let contacts = Color(red: 0.55, green: 0.35, blue: 0.82)
        static let settings = Color(red: 0.42, green: 0.45, blue: 0.50)
        static let feedback = Color(red: 0.18, green: 0.55, blue: 0.86)
        static let blocked = SideSeatTheme.danger
        static let username = Color(red: 0.35, green: 0.40, blue: 0.55)
        static let privacySchedule = Color(red: 0.20, green: 0.55, blue: 0.78)
        static let privacyDiscover = Color(red: 0.35, green: 0.55, blue: 0.42)
        static let privacyChat = Color(red: 0.55, green: 0.40, blue: 0.75)
    }

    /// Deterministic collage / multi-avatar tile colors (not brand chrome / not Rose accent).
    enum AvatarPalette {
        static let tiles: [Color] = [
            Color(red: 0.15, green: 0.38, blue: 0.65),
            Color(red: 0.18, green: 0.44, blue: 0.25),
            Color(red: 0.60, green: 0.31, blue: 0.05),
            Color(red: 0.62, green: 0.27, blue: 0.25),
            Color(red: 0.43, green: 0.32, blue: 0.71),
            Color(red: 0.11, green: 0.44, blue: 0.47),
            Color(red: 0.49, green: 0.36, blue: 0.21),
            Color(red: 0.32, green: 0.39, blue: 0.47),
        ]

        /// Stable tile color from a display name (shared by `InitialAvatar` / group collage).
        static func color(for name: String) -> Color {
            let sum = name.unicodeScalars.reduce(0) { $0 + Int($1.value) }
            return tiles[sum % tiles.count]
        }
    }

    /// Institution identity colors are limited to verified school marks.
    /// They must not replace SideSeat's interaction or semantic colors.
    enum SchoolBrand {
        static let tum = Color(red: 0.0, green: 0.396, blue: 0.741) // #0065BD
        static let lmu = Color(red: 0.0, green: 0.533, blue: 0.227) // #00883A
    }

    /// Chat bubble / composer chrome (product surface).
    enum Chat {
        static let bubbleRadius: CGFloat = 16
        static let composerRadius: CGFloat = 20
        /// A quiet canvas behind conversation content. Keeping this token beside the message
        /// surfaces prevents the page and bubbles from drifting into the same tonal band.
        static var canvas: Color { SideSeatTheme.bgGrouped }
        /// A muted berry-clay brand surface for long-form reading. It is intentionally darker
        /// than the canvas without returning to the high-saturation interaction Rose.
        static var ownBubble: Color {
            adaptiveBubbleColor(light: 0xDCA9BB, dark: 0x663246)
        }
        /// Foreground paired with ``ownBubble``. It is intentionally separate from
        /// ``SideSeatTheme.onAccent`` because dark message surfaces are no longer bright Rose.
        static var ownBubbleForeground: Color {
            adaptiveBubbleColor(light: 0x2E171F, dark: 0xFFF3F7)
        }
        /// Incoming messages use a stronger neutral step than systemGray5 so they remain
        /// distinct from the grouped conversation canvas in both appearances.
        static var peerBubble: Color {
            adaptiveBubbleColor(light: 0xC7C6CB, dark: 0x3C3A3E)
        }
        /// Structured chat cards remain a separate elevated surface even if message colors
        /// evolve. They must not inherit the incoming-message palette by accident.
        static var cardSurface: Color { Color(uiColor: .systemGray5) }
        /// A subtle inset surface for quoted content inside or immediately above a message.
        static var quoteSurface: Color { Color.primary.opacity(0.06) }
        static var controlFill: Color { SideSeatTheme.fillSubtle }
        static var selectedChipFill: Color { SideSeatTheme.accent.opacity(0.12) }

        private static func adaptiveBubbleColor(light: UInt32, dark: UInt32) -> Color {
            return Color(
                uiColor: UIColor { traits in
                    Self.uiColor(rgb: traits.userInterfaceStyle == .dark ? dark : light)
                }
            )
        }

        private static func uiColor(rgb: UInt32) -> UIColor {
            UIColor(
                red: CGFloat((rgb >> 16) & 0xFF) / 255,
                green: CGFloat((rgb >> 8) & 0xFF) / 255,
                blue: CGFloat(rgb & 0xFF) / 255,
                alpha: 1
            )
        }
    }

    // MARK: - Shape

    /// Inputs, small buttons (`radiusControl` in design docs).
    static let controlRadius: CGFloat = 14
    /// Content cards (`radiusCard`).
    static let cardRadius: CGFloat = 22
    /// Login brand block (`radiusHero`).
    static let heroRadius: CGFloat = 28

    // MARK: - Spacing

    static let spaceXS: CGFloat = 4
    static let spaceSM: CGFloat = 8
    static let spaceMD: CGFloat = 12
    static let spaceLG: CGFloat = 16
    static let spaceXL: CGFloat = 24
    static let spaceXXL: CGFloat = 32
    /// Typical horizontal screen inset (within 16–22).
    static let screenHorizontal: CGFloat = 20

    // MARK: - Shadow (cards & brand primary CTA only; list rows have none)

    static let cardShadowOpacity: Double = 0.08
    static let cardShadowRadius: CGFloat = 18
    static let cardShadowY: CGFloat = 8
    static var cardShadow: Color { magenta.opacity(cardShadowOpacity) }

    // MARK: - Interaction

    enum Interaction {
        static let pressedOpacity: Double = 0.90
        static let pressedScale: CGFloat = 0.985
        static let pressDuration: Double = 0.15
        /// Compact neutral controls sit one step above white/elevated surfaces without
        /// competing with the Rose reserved for primary actions.
        static let neutralControlFill = Color(uiColor: .systemGray5)
        /// Disabled primary actions need a stronger surface boundary than utility controls.
        /// Opaque systemGray4 stays visibly disabled while avoiding a white-on-white wash.
        static let disabledFill = Color(uiColor: .systemGray4)
    }

    // MARK: - Typography

    /// System Dynamic Type–friendly fonts. No third-party faces.
    enum Text {
        /// Login wordmark — SF Rounded Bold ~28–34.
        static let display = Font.system(size: 32, weight: .bold, design: .rounded)
        static let title = Font.title2.weight(.semibold)
        static let titleSmall = Font.title3.weight(.semibold)
        static let body = Font.body
        static let caption = Font.caption
        static let footnote = Font.footnote
        /// Calendar clocks / day numbers.
        static let monoDigit = Font.body.monospacedDigit()
        static let monoDigitCaption = Font.caption.monospacedDigit()
    }

    // MARK: - Brand chrome

    /// A restrained, repeatable brand signature for root navigation and the system tab bar.
    /// These values intentionally stay compact so content remains the dominant product surface.
    enum BrandChrome {
        static let rootMarkSize: CGFloat = 22
        static let rootMarkRadius: CGFloat = 5
        static let rootTitleSpacing: CGFloat = 7
        static let tabTitleSize: CGFloat = 10
    }

    // MARK: - Button fill strategy

    /// Brand surface → gradient; product surface → adaptive ink/chalk.
    enum ButtonFill: Equatable {
        /// Auth / Tutorial primary CTA.
        case brand
        /// Home / Discover / Chats / Me primary CTA.
        case product

        var enabledStyle: AnyShapeStyle {
            switch self {
            case .brand:
                AnyShapeStyle(SideSeatTheme.accentGradient)
            case .product:
                AnyShapeStyle(SideSeatTheme.ProductAction.fill)
            }
        }

        var disabledStyle: AnyShapeStyle {
            AnyShapeStyle(Interaction.disabledFill)
        }

        var foreground: Color {
            self == .product ? ProductAction.foreground : SideSeatTheme.onAccent
        }
    }

    // MARK: - Gradients (brand surface)

    static var brandGradient: LinearGradient {
        LinearGradient(
            colors: [coral, rose, magenta, orchid],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    static var brandGradientVertical: LinearGradient {
        LinearGradient(
            colors: [peach.opacity(0.95), rose, magenta],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    /// Brand-surface primary CTA fill only.
    static var accentGradient: LinearGradient {
        LinearGradient(
            colors: [coral, rose, magenta],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    /// Brand-surface background wash — not for Home / Chat / Calendar grids.
    static var softWash: LinearGradient {
        LinearGradient(
            colors: [
                peach.opacity(0.35),
                cream.opacity(0.55),
                rose.opacity(0.12),
                orchid.opacity(0.16),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    static func softWash(for colorScheme: ColorScheme) -> LinearGradient {
        if colorScheme == .dark {
            return LinearGradient(
                colors: [
                    Color(red: 0.22, green: 0.10, blue: 0.16),
                    Color(uiColor: .systemBackground),
                    Color(red: 0.18, green: 0.08, blue: 0.22),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
        return softWash
    }

    // MARK: - Chrome

    @MainActor
    static func configureChrome() {
        let accent = UIColor(red: 0.984, green: 0.255, blue: 0.522, alpha: 1)
        UIView.appearance(whenContainedInInstancesOf: [UIAlertController.self]).tintColor = .label

        let tab = UITabBarAppearance()
        tab.configureWithDefaultBackground()
        configureTabItems(tab.stackedLayoutAppearance, accent: accent)
        configureTabItems(tab.inlineLayoutAppearance, accent: accent)
        configureTabItems(tab.compactInlineLayoutAppearance, accent: accent)
        tab.shadowColor = UIColor.separator.withAlphaComponent(0.22)
        UITabBar.appearance().standardAppearance = tab
        UITabBar.appearance().scrollEdgeAppearance = tab
        UITabBar.appearance().tintColor = accent

        let nav = UINavigationBarAppearance()
        nav.configureWithDefaultBackground()
        nav.shadowColor = .clear
        UINavigationBar.appearance().standardAppearance = nav
        UINavigationBar.appearance().scrollEdgeAppearance = nav
        UINavigationBar.appearance().tintColor = .label
        UIBarButtonItem.appearance(whenContainedInInstancesOf: [UINavigationBar.self]).tintColor = .label
    }

    @MainActor
    private static func configureTabItems(
        _ appearance: UITabBarItemAppearance,
        accent: UIColor
    ) {
        appearance.normal.iconColor = .secondaryLabel
        appearance.normal.titleTextAttributes = [
            .foregroundColor: UIColor.secondaryLabel,
            .font: UIFont.systemFont(ofSize: BrandChrome.tabTitleSize, weight: .medium),
        ]
        appearance.selected.iconColor = accent
        appearance.selected.titleTextAttributes = [
            .foregroundColor: accent,
            .font: UIFont.systemFont(ofSize: BrandChrome.tabTitleSize, weight: .semibold),
        ]
    }
}

// MARK: - Brand primitives (brand surface)

struct SideSeatBrandMark: View {
    var size: CGFloat = 96
    var showsShadow: Bool = true

    var body: some View {
        Image("BrandMark")
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: size * 0.22, style: .continuous))
            .shadow(
                color: showsShadow ? SideSeatTheme.magenta.opacity(0.28) : .clear,
                radius: showsShadow ? 18 : 0,
                y: showsShadow ? 10 : 0
            )
            .accessibilityHidden(true)
    }
}

struct SideSeatCardBackground: View {
    var cornerRadius: CGFloat = SideSeatTheme.cardRadius

    var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(SideSeatTheme.surface.opacity(0.96))
            .overlay {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .strokeBorder(
                        LinearGradient(
                            colors: [
                                SideSeatTheme.peach.opacity(0.55),
                                SideSeatTheme.rose.opacity(0.25),
                                SideSeatTheme.orchid.opacity(0.35),
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 1
                    )
            }
            .shadow(
                color: SideSeatTheme.cardShadow,
                radius: SideSeatTheme.cardShadowRadius,
                y: SideSeatTheme.cardShadowY
            )
    }
}
