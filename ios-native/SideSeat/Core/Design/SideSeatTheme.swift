import SwiftUI

/// SideSeat design tokens.
///
/// # Token freeze (Phase E)
/// Palette, radii, spacing, `ButtonFill`, `HubTint`, `Chat`, and `CalendarChrome` metrics are
/// **frozen**. New UI must consume these APIs (or `Core/Design/Components`). Do not introduce
/// ad-hoc hex / system `.blue` / feature-local corner radii except:
/// - user-authored content colors (`Color(hex:)` on events/courses)
/// - semantic system roles already wrapped (`danger` / `success` / `warning`)
///
/// Changing Rose `#FB4185` / `AccentColor` requires an explicit product decision + README update.
///
/// ## Brand surface vs product surface
/// - **Brand surface** (gradients / `SideSeatBrandMark` allowed): Login, Signup, Forgot password;
///   optional cold-start empty state and Tutorial primary CTA.
/// - **Product surface** (no full-bleed brand gradients): Home, Discover, Chats, Me / Settings
///   (Me hero may keep a light wash stroke only).
///
/// Interactive accent is always Rose via `AccentColor` / ``accent`` — never reuse accent for
/// calendar “now”, errors, or success. See `Core/Design/README.md`.
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

    /// Links, selected tab, switches, unread dots, product primary fill.
    static let accent = Color.accentColor

    // MARK: - Semantic (product)

    /// Main flow background (`systemBackground`).
    static let bg = Color(uiColor: .systemBackground)
    /// Grouped list background (`systemGroupedBackground`).
    static let bgGrouped = Color(uiColor: .systemGroupedBackground)
    /// Cards / inset grouped rows (`secondarySystemGroupedBackground`).
    static let surface = Color(uiColor: .secondarySystemGroupedBackground)
    static let textPrimary = Color.primary
    static let textSecondary = Color.secondary
    /// Delete, validation errors — never use ``accent`` for these.
    static let danger = Color(uiColor: .systemRed)
    /// Success / confirmation — never use ``accent`` for these.
    static let success = Color(uiColor: .systemGreen)
    /// Calendar “now” line / today digit — kept separate from ``accent`` selection.
    static let calendarNow = Color(red: 1, green: 0.23, blue: 0.19)
    /// Course tiles without a custom hex — distinct from accent (not system `.blue`).
    static let courseFallback = Color(red: 0.20, green: 0.52, blue: 0.86)
    /// Verified student seal — same rose family as interactive accent.
    static var verifiedSeal: Color { accent }
    /// Pin / restore / soft caution — never use for selection or errors.
    static let warning = Color.orange
    /// Non-grouped elevated fill (chat peer bubbles, soft chips).
    static let fillSubtle = Color(uiColor: .secondarySystemBackground)
    /// Control / chip wells (`tertiarySystemFill`).
    static let fillTertiary = Color(uiColor: .tertiarySystemFill)
    /// Compact media thumbs (life photos, create pickers).
    static let mediaRadius: CGFloat = 10

    // MARK: - Hub / avatar (functional tints — shape unified via SSListRow)

    /// Me hub row icon tints. Distinct by function; not interactive accent.
    enum HubTint {
        static let courses = Color(red: 0.18, green: 0.62, blue: 0.42)
        static let plans = Color(red: 0.20, green: 0.52, blue: 0.86)
        static let contacts = Color(red: 0.55, green: 0.35, blue: 0.82)
        static let settings = Color(red: 0.42, green: 0.45, blue: 0.50)
        static let feedback = Color(red: 0.18, green: 0.55, blue: 0.86)
        static let blocked = SideSeatTheme.danger
        static let username = Color(red: 0.35, green: 0.40, blue: 0.55)
        static let moments = Color(red: 0.86, green: 0.48, blue: 0.22)
        static let privacySchedule = Color(red: 0.20, green: 0.55, blue: 0.78)
        static let privacyDiscover = Color(red: 0.35, green: 0.55, blue: 0.42)
        static let privacyChat = Color(red: 0.55, green: 0.40, blue: 0.75)
    }

    /// Deterministic collage / multi-avatar tile colors (not brand chrome).
    enum AvatarPalette {
        static let tiles: [Color] = [
            Color(red: 0.35, green: 0.62, blue: 0.95),
            Color(red: 0.38, green: 0.76, blue: 0.52),
            Color(red: 0.95, green: 0.62, blue: 0.30),
            Color(red: 0.88, green: 0.42, blue: 0.48),
            Color(red: 0.58, green: 0.48, blue: 0.90),
            Color(red: 0.30, green: 0.72, blue: 0.78),
            Color(red: 0.72, green: 0.55, blue: 0.38),
            Color(red: 0.55, green: 0.62, blue: 0.70),
        ]
    }

    /// Chat bubble / composer chrome (product surface).
    enum Chat {
        static let bubbleRadius: CGFloat = 16
        static let composerRadius: CGFloat = 20
        static var ownBubble: Color { SideSeatTheme.accent }
        static var peerBubble: Color { SideSeatTheme.fillSubtle }
        static var selectedChipFill: Color { SideSeatTheme.accent.opacity(0.12) }
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
        static let disabledFill = Color.gray.opacity(0.40)
        static let disabledFillSecondary = Color.gray.opacity(0.30)
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

    // MARK: - Button fill strategy

    /// Brand surface → gradient; product surface → solid accent. Prefer this over ad-hoc fills.
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
                AnyShapeStyle(SideSeatTheme.accent)
            }
        }

        var disabledStyle: AnyShapeStyle {
            AnyShapeStyle(
                LinearGradient(
                    colors: [Interaction.disabledFill, Interaction.disabledFillSecondary],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
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

    static func configureChrome() {
        let accent = UIColor(red: 0.984, green: 0.255, blue: 0.522, alpha: 1)
        UIView.appearance(whenContainedInInstancesOf: [UIAlertController.self]).tintColor = accent

        let tab = UITabBarAppearance()
        tab.configureWithDefaultBackground()
        UITabBar.appearance().standardAppearance = tab
        UITabBar.appearance().scrollEdgeAppearance = tab
        UITabBar.appearance().tintColor = accent

        let nav = UINavigationBarAppearance()
        nav.configureWithDefaultBackground()
        UINavigationBar.appearance().standardAppearance = nav
        UINavigationBar.appearance().scrollEdgeAppearance = nav
        UINavigationBar.appearance().tintColor = accent
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
