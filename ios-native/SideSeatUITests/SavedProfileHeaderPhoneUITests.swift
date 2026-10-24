import XCTest

/// One local bookmark prepares the card; profile visits never send or change real data.
@MainActor final class SavedProfileHeaderPhoneUITests: XCTestCase {
    private struct Account: Decodable { let role: String; let accessToken: String }
    private struct PublicProfileFixture: Decodable {
        struct Expected: Decodable { let displayName: String; let username: String }
        let bundle: String
        let peerID: String
        let accounts: [Account]
        let profileExpected: Expected
    }
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
            verifyProfileAndClose(tag: "avatar-\(tag)", large: large)
            reveal(profile, section: "bookmarks"); assertTarget(profile)

            // Tap the visible name itself to verify both parts of the shared identity target.
            let name = profile.staticTexts["Mia"].firstMatch
            XCTAssertTrue(name.waitForExistence(timeout: 5)); XCTAssertTrue(name.isHittable)
            XCTAssertTrue(profile.frame.insetBy(dx: -0.5, dy: -0.5).contains(name.frame))
            name.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
            verifyProfileAndClose(tag: "name-\(tag)", large: large)

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

    func testSavedProfileHeaderOpensRealPublicProfile() throws {
        let raw = try XCTUnwrap(ProcessInfo.processInfo.environment["SIDESEAT_PLAN_CONTACTS_JSON"])
        let fixture = try JSONDecoder().decode(PublicProfileFixture.self, from: Data(raw.utf8))
        let owner = try XCTUnwrap(fixture.accounts.first { $0.role == "owner" })
        XCTAssertFalse(fixture.peerID.isEmpty)
        XCTAssertFalse(fixture.profileExpected.displayName.isEmpty)
        XCTAssertFalse(fixture.profileExpected.username.isEmpty)
        for (language, appearance, large) in [("zh-Hans", "light", false), ("de", "dark", true)] {
            let tag = "\(language)-\(appearance)-\(large ? "largest" : "normal")"
            launch(language: language, appearance: appearance, large: large, publicFixture: fixture,
                   accessToken: owner.accessToken)
            select("recommendations")
            let bookmarkID = "mutual-opportunity-bookmark-\(opportunityID)"
            let setupBookmark = page("recommendations").buttons[bookmarkID]
            reveal(setupBookmark, section: "recommendations")
            let unsavedLabel = setupBookmark.label
            tap(setupBookmark)
            let saved = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label != %@", unsavedLabel), object: setupBookmark)
            XCTAssertEqual(XCTWaiter.wait(for: [saved], timeout: 8), .completed)
            select("bookmarks")
            let surface = page("bookmarks")
            let profileID = "mutual-opportunity-profile-\(opportunityID)"
            let profile = surface.buttons[profileID]
            reveal(profile, section: "bookmarks"); assertTarget(profile)
            XCTAssertEqual(surface.buttons.matching(identifier: profileID).count, 1)
            capture("live-saved-profile-header-\(tag)")
            profile.coordinate(withNormalizedOffset: .zero)
                .withOffset(CGVector(dx: 18, dy: profile.frame.height / 2)).tap()
            verifyProfileAndClose(tag: "live-avatar-\(tag)", large: large, expected: fixture.profileExpected)
            reveal(profile, section: "bookmarks"); assertTarget(profile)
            let name = profile.staticTexts["Mia"].firstMatch
            XCTAssertTrue(name.waitForExistence(timeout: 5)); XCTAssertTrue(name.isHittable)
            XCTAssertTrue(profile.frame.insetBy(dx: -0.5, dy: -0.5).contains(name.frame))
            name.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
            verifyProfileAndClose(tag: "live-name-\(tag)", large: large, expected: fixture.profileExpected)
            let bookmark = surface.buttons[bookmarkID]
            reveal(bookmark, section: "bookmarks"); assertTarget(bookmark)
            XCTAssertNotEqual(bookmark.label, unsavedLabel, "Reading the public profile preserves the local bookmark")
            XCTAssertFalse(app.textFields["opportunity-message-body"].exists)
            capture("live-saved-profile-returned-\(tag)")
            app.terminate()
        }
    }

    private func launch(language: String, appearance: String, large: Bool,
                        publicFixture: PublicProfileFixture? = nil, accessToken: String? = nil) {
        app?.terminate(); app = XCUIApplication(bundleIdentifier: publicFixture?.bundle ?? bundleID)
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials", "--ui-testing-skip-tutorial",
            "--ui-testing-discover", "--ui-testing-weekly-intent", "--ui-testing-mutual-opportunity",
            "--ui-testing-automatic-matching", "--ui-testing-together-matching", "--ui-testing-flexible-timing",
            "--ui-testing-discovery-matching", "--ui-testing-language=\(language)", "--ui-testing-appearance=\(appearance)",
            "-UIPreferredContentSizeCategoryName", large ? "UICTContentSizeCategoryAccessibilityXXXL" : "UICTContentSizeCategoryL"]
        if large { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
        if let publicFixture, let accessToken {
            app.launchArguments += ["--ui-testing-public-profile-live", "--ui-testing-time-poll-live"]
            app.launchEnvironment = ["SIDESEAT_QA_ACCESS_TOKEN": accessToken,
                "SIDESEAT_QA_PUBLIC_PROFILE_USER_ID": publicFixture.peerID]
        } else {
            app.launchArguments.append("--ui-testing-local-api")
            app.launchEnvironment = ["SIDESEAT_API_BASE_URL_OVERRIDE": "http://127.0.0.1:9"]
        }
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

    private func verifyProfileAndClose(tag: String, large: Bool, expected: PublicProfileFixture.Expected? = nil) {
        let details = app.descendants(matching: .any)[expected == nil ? "together-private-profile" : "public-profile"].firstMatch
        guard details.waitForExistence(timeout: expected == nil ? 8 : 25) else {
            diagnose("profile-missing-\(tag)"); XCTFail("The intended private or real public profile must load"); return
        }
        XCTAssertFalse(app.descendants(matching: .any)[expected == nil ? "public-profile" : "together-private-profile"].firstMatch.exists)
        let name = details.staticTexts.matching(NSPredicate(format: "label == %@", expected?.displayName ?? "Mia")).firstMatch
        guard name.waitForExistence(timeout: 5) else {
            diagnose("profile-name-missing-\(tag)"); XCTFail("The exact profile name must remain accessible"); return
        }
        revealInProfile(name, surface: details, tag: tag)
        print("SAVED_PROFILE_NAME_FRAME \(tag) \(name.frame)")
        if large { XCTAssertGreaterThan(name.frame.height, 40, "The presented profile must use the real system maximum font") }
        capture("fixture-saved-profile-details-\(tag)")
        if let expected {
            let username = details.staticTexts.matching(NSPredicate(format: "label == %@", "@\(expected.username)")).firstMatch
            guard username.waitForExistence(timeout: 5) else {
                diagnose("profile-username-missing-\(tag)"); XCTFail("The real peer username must match the API fixture"); return
            }
            revealInProfile(username, surface: details, tag: tag)
            if large { XCTAssertGreaterThan(username.frame.height, 80, "The long public username must wrap instead of truncating at the real system maximum font") }
            capture("live-saved-profile-identity-\(tag)")
        }
        let done = app.buttons["together-profile-done"]
        assertReachable(done)
        // The unchanged native toolbar can be projected by a floating sheet; do not lower header requirements.
        tap(done)
        XCTAssertTrue(details.waitForNonExistence(timeout: 8))
        XCTAssertTrue(page("bookmarks").waitForExistence(timeout: 8))
    }

    private func revealInProfile(_ element: XCUIElement, surface: XCUIElement, tag: String) {
        for _ in 0..<8 {
            let bounds = app.windows.firstMatch.frame
            let navBottom = app.navigationBars.allElementsBoundByIndex.filter { $0.isHittable }
                .map { $0.frame.maxY }.max() ?? bounds.minY
            let visible = CGRect(x: bounds.minX, y: navBottom, width: bounds.width,
                                 height: max(0, bounds.maxY - 12 - navBottom)).insetBy(dx: -0.501, dy: -0.501)
            if element.isHittable && visible.contains(element.frame) { assertReachable(element); return }
            if element.frame.minY < visible.minY { surface.swipeDown(velocity: .slow) }
            else { surface.swipeUp(velocity: .slow) }
        }
        diagnose("profile-reveal-failed-\(tag)")
        XCTFail("The complete profile identity must be visible: \(element.label) \(element.frame)")
    }

    private func diagnose(_ name: String) {
        print("SAVED_PROFILE_HIERARCHY \(name)\n\(app.debugDescription)")
        capture(name)
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
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
