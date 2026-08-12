import SwiftUI
import UIKit
import XCTest
@testable import SideSeat

final class ThemeContrastTests: XCTestCase {
    func testTodayButtonContrastInLightAndDarkAppearances() {
        assertContrast(
            foreground: .white,
            background: UIColor(SideSeatTheme.calendarNowFill),
            style: .light,
            minimum: 4.5
        )
        assertContrast(
            foreground: .white,
            background: UIColor(SideSeatTheme.calendarNowFill),
            style: .dark,
            minimum: 4.5
        )
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
            foreground: UIColor(SideSeatTheme.ink),
            background: UIColor(SideSeatTheme.accent),
            style: .light,
            minimum: 4.5
        )
        assertContrast(
            foreground: UIColor(SideSeatTheme.ink),
            background: UIColor(SideSeatTheme.accent),
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
