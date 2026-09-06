import SwiftUI
import UIKit
import XCTest
@testable import SideSeat

final class ThemeContrastTests: XCTestCase {
    func testCalendarNowBadgeContrastInLightAndDarkAppearances() {
        assertContrast(
            foreground: UIColor(SideSeatTheme.calendarNowForeground),
            background: UIColor(SideSeatTheme.calendarNowFill),
            style: .light,
            minimum: 4.5
        )
        assertContrast(
            foreground: UIColor(SideSeatTheme.calendarNowForeground),
            background: UIColor(SideSeatTheme.calendarNowFill),
            style: .dark,
            minimum: 4.5
        )
    }

    func testTodayButtonContrastOnNeutralControlSurface() {
        for style in [UIUserInterfaceStyle.light, .dark] {
            assertContrast(
                foreground: UIColor(CalendarChrome.nowAccent),
                background: UIColor(CalendarChrome.todayControlFill),
                style: style,
                minimum: 4.5
            )
        }
    }

    func testCalendarCreateActionSeparatesFromCanvasInLightAndDarkAppearances() {
        for style in [UIUserInterfaceStyle.light, .dark] {
            let traits = UITraitCollection(userInterfaceStyle: style)
            let canvas: UIColor = style == .dark ? .black : .white
            let fill = composite(
                UIColor(CalendarChrome.createActionFill).resolvedColor(with: traits),
                over: canvas
            )
            let foreground = composite(
                UIColor(CalendarChrome.createActionForeground).resolvedColor(with: traits),
                over: fill
            )

            XCTAssertGreaterThanOrEqual(
                contrastRatio(fill, canvas),
                1.4,
                "The floating create action must remain distinct from the calendar canvas."
            )
            XCTAssertGreaterThanOrEqual(
                contrastRatio(foreground, fill),
                4.5,
                "The create symbol must remain readable in both appearances."
            )
        }
    }

    func testCalendarNowUsesTheUnifiedBrandRosePalette() {
        let lightTraits = UITraitCollection(userInterfaceStyle: .light)
        let light = rgba(UIColor(SideSeatTheme.calendarNow).resolvedColor(with: lightTraits))
        XCTAssertEqual(light.red, 0.82, accuracy: 0.001)
        XCTAssertEqual(light.green, 0.102, accuracy: 0.001)
        XCTAssertEqual(light.blue, 0.38, accuracy: 0.001)

        let darkTraits = UITraitCollection(userInterfaceStyle: .dark)
        let calendarDark = rgba(UIColor(SideSeatTheme.calendarNow).resolvedColor(with: darkTraits))
        let accentDark = rgba(UIColor(SideSeatTheme.accent).resolvedColor(with: darkTraits))
        XCTAssertEqual(calendarDark.red, accentDark.red, accuracy: 0.001)
        XCTAssertEqual(calendarDark.green, accentDark.green, accuracy: 0.001)
        XCTAssertEqual(calendarDark.blue, accentDark.blue, accuracy: 0.001)
    }

    func testCalendarNowMarkerContrastInLightAndDarkAppearances() {
        assertContrast(
            foreground: UIColor(SideSeatTheme.calendarNow),
            background: .white,
            style: .light,
            minimum: 4.5
        )
        assertContrast(
            foreground: UIColor(SideSeatTheme.calendarNow),
            background: .black,
            style: .dark,
            minimum: 4.5
        )
    }

    func testPlaceholderContrastOnFieldFillInLightAndDarkAppearances() {
        assertContrast(
            foreground: UIColor(SideSeatTheme.placeholderText),
            background: UIColor(SideSeatTheme.fillTertiary),
            style: .light,
            minimum: 4.5
        )
        assertContrast(
            foreground: UIColor(SideSeatTheme.placeholderText),
            background: UIColor(SideSeatTheme.fillTertiary),
            style: .dark,
            minimum: 4.5
        )
    }

    func testPrimaryAuthActionContrastInLightAndDarkAppearances() {
        assertContrast(
            foreground: .label,
            background: .secondarySystemGroupedBackground,
            style: .light,
            minimum: 4.5
        )
        assertContrast(
            foreground: .label,
            background: .secondarySystemGroupedBackground,
            style: .dark,
            minimum: 4.5
        )
    }

    func testDisabledPrimaryActionContrastInLightAndDarkAppearances() {
        assertContrast(
            foreground: .label,
            background: UIColor(SideSeatTheme.Interaction.disabledFill),
            style: .light,
            minimum: 4.5
        )
        assertContrast(
            foreground: .label,
            background: UIColor(SideSeatTheme.Interaction.disabledFill),
            style: .dark,
            minimum: 4.5
        )
    }

    func testDisabledPrimaryActionSeparatesFromElevatedSurface() {
        for style in [UIUserInterfaceStyle.light, .dark] {
            let traits = UITraitCollection(userInterfaceStyle: style)
            let canvas = style == .dark ? UIColor.black : UIColor.white
            let surface = composite(
                UIColor.systemBackground.resolvedColor(with: traits),
                over: canvas
            )
            let disabledFill = composite(
                UIColor(SideSeatTheme.Interaction.disabledFill).resolvedColor(with: traits),
                over: surface
            )

            XCTAssertGreaterThanOrEqual(
                contrastRatio(disabledFill, surface),
                1.4,
                "Disabled primary actions must remain visually distinct from their surrounding surface."
            )
        }
    }

    func testToolbarActionContrastInLightAndDarkAppearances() {
        assertContrast(
            foreground: .label,
            background: .systemBackground,
            style: .light,
            minimum: 4.5
        )
        assertContrast(
            foreground: .label,
            background: .systemBackground,
            style: .dark,
            minimum: 4.5
        )
    }

    func testUtilityActionContrastInLightAndDarkAppearances() {
        assertContrast(
            foreground: UIColor(SideSeatTheme.utilityAction),
            background: .systemBackground,
            style: .light,
            minimum: 4.5
        )
        assertContrast(
            foreground: UIColor(SideSeatTheme.utilityAction),
            background: .systemBackground,
            style: .dark,
            minimum: 4.5
        )
    }

    func testStrongSecondaryTextContrastOnSystemBackground() {
        assertContrast(
            foreground: UIColor(SideSeatTheme.textSecondaryStrong),
            background: .systemBackground,
            style: .light,
            minimum: 4.5
        )
        assertContrast(
            foreground: UIColor(SideSeatTheme.textSecondaryStrong),
            background: .systemBackground,
            style: .dark,
            minimum: 4.5
        )
    }

    func testCompactTextOnAccentContrast() {
        assertContrast(
            foreground: UIColor(SideSeatTheme.onAccent),
            background: UIColor(SideSeatTheme.accent),
            style: .light,
            minimum: 4.5
        )
        assertContrast(
            foreground: UIColor(SideSeatTheme.onAccent),
            background: UIColor(SideSeatTheme.accent),
            style: .dark,
            minimum: 4.5
        )
    }

    func testOwnChatBubbleContrastInLightAndDarkAppearances() {
        for style in [UIUserInterfaceStyle.light, .dark] {
            assertContrast(
                foreground: UIColor(SideSeatTheme.Chat.ownBubbleForeground),
                background: UIColor(SideSeatTheme.Chat.ownBubble),
                style: style,
                minimum: 4.5
            )
            assertContrast(
                foreground: UIColor(SideSeatTheme.Chat.ownBubbleForeground.opacity(0.78)),
                background: UIColor(SideSeatTheme.Chat.ownBubble),
                style: style,
                minimum: 4.5
            )
            assertContrast(
                foreground: UIColor(SideSeatTheme.Chat.ownBubbleForeground.opacity(0.72)),
                background: UIColor(SideSeatTheme.Chat.ownBubble),
                style: style,
                minimum: 3.0
            )
        }
    }

    func testPeerChatBubbleContrastInLightAndDarkAppearances() {
        for style in [UIUserInterfaceStyle.light, .dark] {
            assertContrast(
                foreground: .label,
                background: UIColor(SideSeatTheme.Chat.peerBubble),
                style: style,
                minimum: 4.5
            )
            assertContrast(
                foreground: UIColor(SideSeatTheme.textSecondaryStrong),
                background: UIColor(SideSeatTheme.Chat.peerBubble),
                style: style,
                minimum: 4.5
            )
        }
    }

    func testStructuredChatCardSecondaryTextContrastInLightAndDarkAppearances() {
        for style in [UIUserInterfaceStyle.light, .dark] {
            assertContrast(
                foreground: UIColor(SideSeatTheme.textSecondaryStrong),
                background: UIColor(SideSeatTheme.Chat.cardSurface),
                style: style,
                minimum: 4.5
            )
        }
    }

    func testChatBubbleSurfacesSeparateFromConversationCanvas() {
        for style in [UIUserInterfaceStyle.light, .dark] {
            assertContrast(
                foreground: UIColor(SideSeatTheme.Chat.ownBubble),
                background: UIColor(SideSeatTheme.Chat.canvas),
                style: style,
                minimum: 1.5
            )
            assertContrast(
                foreground: UIColor(SideSeatTheme.Chat.peerBubble),
                background: UIColor(SideSeatTheme.Chat.canvas),
                style: style,
                minimum: 1.45
            )
        }
    }

    func testOwnChatBubbleStaysLowSaturation() {
        for style in [UIUserInterfaceStyle.light, .dark] {
            let traits = UITraitCollection(userInterfaceStyle: style)
            let bubble = UIColor(SideSeatTheme.Chat.ownBubble).resolvedColor(with: traits)
            XCTAssertLessThanOrEqual(
                hslSaturation(bubble),
                0.60,
                "Chat bubble should remain a muted reading surface in \(style == .dark ? "dark" : "light") mode."
            )
        }
    }

    func testAccentTextContrastOnProductSurfaces() {
        assertContrast(
            foreground: UIColor(SideSeatTheme.accentText),
            background: .systemBackground,
            style: .light,
            minimum: 4.5
        )
        assertContrast(
            foreground: UIColor(SideSeatTheme.accentText),
            background: .systemBackground,
            style: .dark,
            minimum: 4.5
        )
    }

    func testSectionHeaderContrastOnGroupedBackground() {
        assertContrast(
            foreground: .label,
            background: .systemGroupedBackground,
            style: .light,
            minimum: 4.5
        )
        assertContrast(
            foreground: .label,
            background: .systemGroupedBackground,
            style: .dark,
            minimum: 4.5
        )
    }

    func testCalendarEventTextContrastAcrossWorstCaseTints() {
        let darkestLightEventFill = UIColor.black.withAlphaComponent(0.2)
        assertContrast(
            foreground: .label,
            background: darkestLightEventFill,
            style: .light,
            minimum: 4.5
        )
        assertContrast(
            foreground: UIColor(SideSeatTheme.textSecondaryStrong),
            background: darkestLightEventFill,
            style: .light,
            minimum: 4.5
        )

        let lightestDarkEventFill = UIColor.white.withAlphaComponent(0.2)
        assertContrast(
            foreground: .label,
            background: lightestDarkEventFill,
            style: .dark,
            minimum: 4.5
        )
        assertContrast(
            foreground: UIColor(SideSeatTheme.textSecondaryStrong),
            background: lightestDarkEventFill,
            style: .dark,
            minimum: 4.5
        )
    }

    func testAvatarInitialContrastAcrossPalette() {
        for tile in SideSeatTheme.AvatarPalette.tiles {
            assertContrast(
                foreground: .white,
                background: UIColor(tile),
                style: .light,
                minimum: 4.5
            )
            assertContrast(
                foreground: .white,
                background: UIColor(tile),
                style: .dark,
                minimum: 4.5
            )
        }
    }

    func testDiscoverStatusBadgeContrastInLightAndDarkAppearances() {
        let pairs: [(Color, Color)] = [
            (SideSeatTheme.statusSuccessText, SideSeatTheme.success.opacity(0.12)),
            (SideSeatTheme.statusWarningText, SideSeatTheme.warning.opacity(0.14)),
            (SideSeatTheme.statusDangerText, SideSeatTheme.danger.opacity(0.12)),
            (SideSeatTheme.textSecondaryStrong, SideSeatTheme.fillTertiary),
        ]

        for (foreground, background) in pairs {
            assertContrast(
                foreground: UIColor(foreground),
                background: UIColor(background),
                style: .light,
                minimum: 4.5
            )
            assertContrast(
                foreground: UIColor(foreground),
                background: UIColor(background),
                style: .dark,
                minimum: 4.5
            )
        }
    }

    func testSchoolIdentityBadgeContrastInLightAndDarkAppearances() {
        let pairs: [(Color, Color)] = [
            (SideSeatTheme.verifiedSeal, SideSeatTheme.verifiedSeal.opacity(0.12)),
            (SideSeatTheme.statusWarningText, SideSeatTheme.warning.opacity(0.14)),
            (SideSeatTheme.statusDangerText, SideSeatTheme.danger.opacity(0.12)),
            (SideSeatTheme.textSecondaryStrong, SideSeatTheme.fillTertiary),
        ]

        for (foreground, background) in pairs {
            assertContrast(
                foreground: UIColor(foreground),
                background: UIColor(background),
                style: .light,
                minimum: 4.5
            )
            assertContrast(
                foreground: UIColor(foreground),
                background: UIColor(background),
                style: .dark,
                minimum: 4.5
            )
        }
    }

    private func assertContrast(
        foreground: UIColor,
        background: UIColor,
        style: UIUserInterfaceStyle,
        minimum: CGFloat,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        let traits = UITraitCollection(userInterfaceStyle: style)
        let canvas = style == .dark ? UIColor.black : UIColor.white
        let resolvedBackground = composite(
            background.resolvedColor(with: traits),
            over: canvas
        )
        let resolvedForeground = composite(
            foreground.resolvedColor(with: traits),
            over: resolvedBackground
        )
        let ratio = contrastRatio(resolvedForeground, resolvedBackground)
        XCTAssertGreaterThanOrEqual(
            ratio,
            minimum,
            "Expected contrast >= \(minimum), got \(ratio) in \(style == .dark ? "dark" : "light") mode.",
            file: file,
            line: line
        )
    }

    private func composite(_ color: UIColor, over background: UIColor) -> UIColor {
        let foregroundComponents = rgba(color)
        let backgroundComponents = rgba(background)
        let alpha = foregroundComponents.alpha
        return UIColor(
            red: foregroundComponents.red * alpha + backgroundComponents.red * (1 - alpha),
            green: foregroundComponents.green * alpha + backgroundComponents.green * (1 - alpha),
            blue: foregroundComponents.blue * alpha + backgroundComponents.blue * (1 - alpha),
            alpha: 1
        )
    }

    private func contrastRatio(_ first: UIColor, _ second: UIColor) -> CGFloat {
        let firstLuminance = relativeLuminance(first)
        let secondLuminance = relativeLuminance(second)
        return (max(firstLuminance, secondLuminance) + 0.05)
            / (min(firstLuminance, secondLuminance) + 0.05)
    }

    private func relativeLuminance(_ color: UIColor) -> CGFloat {
        let components = rgba(color)
        return 0.2126 * linearize(components.red)
            + 0.7152 * linearize(components.green)
            + 0.0722 * linearize(components.blue)
    }

    private func hslSaturation(_ color: UIColor) -> CGFloat {
        let components = rgba(color)
        let maximum = max(components.red, max(components.green, components.blue))
        let minimum = min(components.red, min(components.green, components.blue))
        let delta = maximum - minimum
        guard delta > 0 else { return 0 }
        let lightness = (maximum + minimum) / 2
        return delta / (1 - abs(2 * lightness - 1))
    }

    private func linearize(_ component: CGFloat) -> CGFloat {
        component <= 0.04045
            ? component / 12.92
            : pow((component + 0.055) / 1.055, 2.4)
    }

    private func rgba(_ color: UIColor) -> (red: CGFloat, green: CGFloat, blue: CGFloat, alpha: CGFloat) {
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        XCTAssertTrue(color.getRed(&red, green: &green, blue: &blue, alpha: &alpha))
        return (red, green, blue, alpha)
    }
}
