import XCTest

/// One local bookmark prepares the card; profile visits never send or change real data.
@MainActor final class SavedProfileHeaderPhoneUITests: XCTestCase {
    private var app: XCUIApplication!
    private let opportunityID = "cmutualui0000000000000001"
    private var bundleID: String {
        ProcessInfo.processInfo.environment["SIDESEAT_PLAN_PRESENTATION_QA_BUNDLE"] ?? "app.sideseat.mobile.preview"
    }

    override func setUpWithError() throws { continueAfterFailure = false }
    override func tearDown() { app?.terminate() }

    func testSavedProfileHeaderAcrossAppearanceAndTextSizes() {
        for (language, appearance, large) in [("zh-Hans", "light", false), ("zh-Hans", "dark", false),
                                               ("de", "light", true), ("de", "dark", true)] {
            let tag = "\(language)-\(appearance)-\(large ? "largest" : "normal")"
            launch(language: language, appearance: appearance, large: large)
            select("recommendations")

            // Fixture interactions stay in memory; no account, plan, message or backend mutation.
            let bookmarkID = "mutual-opportunity-bookmark-\(opportunityID)"
            let setupBookmark = page("recommendations").buttons[bookmarkID]
            reveal(setupBookmark, section: "recommendations")
            let unsavedLabel = setupBookmark.label
            tap(setupBookmark)
            let saved = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label != %@", unsavedLabel), object: setupBookmark)
            XCTAssertEqual(XCTWaiter.wait(for: [saved], timeout: 8), .completed)
            select("bookmarks")

            let surface = page("bookmarks")
            let peer = surface.descendants(matching: .any)["mutual-opportunity-peer-\(opportunityID)"].firstMatch
            let profileID = "mutual-opportunity-profile-\(opportunityID)"
            let profile = surface.buttons[profileID]
            let bookmark = surface.buttons[bookmarkID]
            reveal(profile, section: "bookmarks"); assertTarget(profile)
            XCTAssertEqual(surface.buttons.matching(identifier: profileID).count, 1,
                           "The saved card must have a single profile entry, in its identity header")
            XCTAssertTrue(peer.exists)
            XCTAssertTrue(peer.frame.insetBy(dx: -0.5, dy: -0.5).contains(profile.frame))
            capture("fixture-saved-profile-header-\(tag)")

            // The decorative avatar is accessibility-hidden, so tap its real header location.
            let avatarPoint = CGVector(dx: 18, dy: profile.frame.height / 2)
            XCTAssertGreaterThan(profile.frame.width, avatarPoint.dx)
            profile.coordinate(withNormalizedOffset: .zero).withOffset(avatarPoint).tap()
            verifyProfileAndClose(tag: "avatar-\(tag)")
            reveal(profile, section: "bookmarks"); assertTarget(profile)

            // Tap the visible name itself to verify both parts of the shared identity target.
            let name = profile.staticTexts["Mia"].firstMatch
            XCTAssertTrue(name.waitForExistence(timeout: 5)); XCTAssertTrue(name.isHittable)
            XCTAssertTrue(profile.frame.insetBy(dx: -0.5, dy: -0.5).contains(name.frame))
            name.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
            verifyProfileAndClose(tag: "name-\(tag)")

            reveal(bookmark, section: "bookmarks"); assertTarget(bookmark)
            XCTAssertNotEqual(bookmark.label, unsavedLabel, "Profile visits keep the local bookmark")
            let message = surface.buttons["mutual-opportunity-message-\(opportunityID)"]
            reveal(message, section: "bookmarks"); assertTarget(message)
            capture("fixture-saved-profile-actions-\(tag)")
            XCTAssertFalse(app.textFields["opportunity-message-body"].exists)
            reveal(profile, section: "bookmarks"); assertTarget(profile)
            XCTAssertEqual(surface.buttons.matching(identifier: profileID).count, 1)
            capture("fixture-saved-profile-returned-\(tag)")
            app.terminate()
        }
    }

    private func launch(language: String, appearance: String, large: Bool) {
        app?.terminate(); app = XCUIApplication(bundleIdentifier: bundleID)
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
            "--ui-testing-local-api", "--ui-testing-discover", "--ui-testing-weekly-intent", "--ui-testing-mutual-opportunity",
            "--ui-testing-automatic-matching", "--ui-testing-together-matching", "--ui-testing-flexible-timing",
            "--ui-testing-discovery-matching", "--ui-testing-language=\(language)", "--ui-testing-appearance=\(appearance)",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
        if large { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
        app.launchEnvironment = ["SIDESEAT_API_BASE_URL_OVERRIDE": "http://127.0.0.1:9"]
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 20))
        app.tabBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.descendants(matching: .any)["together-home"].firstMatch.waitForExistence(timeout: 8))
    }

    private func page(_ section: String) -> XCUIElement { app.scrollViews["together-section-\(section)"].firstMatch }

    private func select(_ section: String) {
        let menu = app.buttons["together-section-menu"]
        if menu.exists {
            assertTarget(menu); tap(menu)
            let sheet = app.descendants(matching: .any)["together-section-picker"].firstMatch
            XCTAssertTrue(sheet.waitForExistence(timeout: 5))
            let option = sheet.buttons["together-tab-\(section)"]
            for _ in 0..<6 where !fullyVisible(option, inSheet: true) { app.swipeUp(velocity: .slow) }
            assertReachable(option); tap(option)
            XCTAssertTrue(sheet.waitForNonExistence(timeout: 5))
        } else {
            let option = app.buttons["together-tab-\(section)"]
            assertTarget(option); tap(option); XCTAssertTrue(option.isSelected)
        }
        XCTAssertTrue(page(section).waitForExistence(timeout: 5))
    }

    private func verifyProfileAndClose(tag: String) {
        // The existing fixture intentionally has no public user ID; retain its private fallback.
        let details = app.descendants(matching: .any)["together-private-profile"].firstMatch
        XCTAssertTrue(details.waitForExistence(timeout: 8))
        XCTAssertFalse(app.descendants(matching: .any)["public-profile"].firstMatch.exists)
        capture("fixture-saved-profile-details-\(tag)")
        let done = app.buttons["together-profile-done"]
        assertReachable(done)
        // The unchanged native toolbar can be projected by a floating sheet; do not lower header requirements.
        tap(done)
        XCTAssertTrue(details.waitForNonExistence(timeout: 8))
        XCTAssertTrue(page("bookmarks").waitForExistence(timeout: 8))
    }

    private func reveal(_ element: XCUIElement, section: String) {
        XCTAssertTrue(element.waitForExistence(timeout: 8))
        for _ in 0..<10 {
            if fullyVisible(element) { return }
            let top = max(app.navigationBars.firstMatch.frame.maxY,
                app.descendants(matching: .any)["together-segmented-control"].firstMatch.frame.maxY)
            if element.frame.minY < top { page(section).swipeDown(velocity: .slow) }
            else { page(section).swipeUp(velocity: .slow) }
        }
        XCTFail("The complete saved-card control must be reachable: \(element.identifier)")
    }

    private func fullyVisible(_ element: XCUIElement, inSheet: Bool = false) -> Bool {
        guard element.exists, element.isHittable else { return false }
        let frame = element.frame, bounds = app.windows.firstMatch.frame
        let top = inSheet ? app.navigationBars.firstMatch.frame.maxY : max(app.navigationBars.firstMatch.frame.maxY,
            app.descendants(matching: .any)["together-segmented-control"].firstMatch.frame.maxY)
        let bottom = !inSheet && app.tabBars.firstMatch.exists ? app.tabBars.firstMatch.frame.minY : bounds.maxY
        return !frame.isEmpty && frame.minX >= bounds.minX - 0.5 && frame.maxX <= bounds.maxX + 0.5
            && frame.minY >= top - 0.5 && frame.maxY <= bottom + 0.5
    }

    private func assertTarget(_ element: XCUIElement) {
        assertReachable(element)
        XCTAssertGreaterThanOrEqual(element.frame.width + 0.001, 44)
        XCTAssertGreaterThanOrEqual(element.frame.height + 0.001, 44)
    }

    private func assertReachable(_ element: XCUIElement) {
        XCTAssertTrue(element.waitForExistence(timeout: 5)); XCTAssertTrue(element.isHittable)
        let frame = element.frame, bounds = app.windows.firstMatch.frame
        XCTAssertFalse(frame.isEmpty)
        XCTAssertGreaterThanOrEqual(frame.minX, bounds.minX - 0.5)
        XCTAssertLessThanOrEqual(frame.maxX, bounds.maxX + 0.5)
        XCTAssertGreaterThanOrEqual(frame.minY, bounds.minY - 0.5)
        XCTAssertLessThanOrEqual(frame.maxY, bounds.maxY + 0.5)
    }

    private func tap(_ element: XCUIElement) {
        element.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.5)).tap()
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
