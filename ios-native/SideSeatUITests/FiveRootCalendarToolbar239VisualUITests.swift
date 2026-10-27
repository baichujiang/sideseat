import XCTest
import Darwin

/// Offline visual fixtures only. No account credentials, event save, share creation,
/// plan action or API business write belongs to this focused toolbar acceptance.
@MainActor final class FiveRootCalendarToolbar239VisualUITests: XCTestCase {
    private struct Variant {
        let language: String
        let appearance: String
        let maximum: Bool
        var tag: String { "\(language)-\(appearance)-\(maximum ? "system-max" : "ordinary")" }
    }
    private let variants = [
        Variant(language: "zh-Hans", appearance: "light", maximum: false),
        Variant(language: "de", appearance: "dark", maximum: false),
        Variant(language: "zh-Hans", appearance: "dark", maximum: true),
        Variant(language: "de", appearance: "light", maximum: true),
    ]
    private var app: XCUIApplication!
    private var window: CGRect { app.windows.firstMatch.frame }
    private func element(_ id: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: id).firstMatch
    }
    override func setUpWithError() throws {
        continueAfterFailure = false
        try XCTSkipUnless(ProcessInfo.processInfo.environment["SIDESEAT_CALENDAR_TOOLBAR_241_EXECUTE"] == "1",
                          "Run only after the root task installs and authorizes frozen Preview241.")
    }
    override func tearDown() async throws { await MainActor.run { app?.terminate() } }

    func testOfflineCalendarToolbarAndReadOnlyProjectionAcrossFourVariants() throws {
        try require(ProcessInfo.processInfo.environment["SIMULATOR_UDID"] == nil,
                    "This focused acceptance requires the default physical iPhone14Plus.")
        var ordinaryTitleHeights: [String: CGFloat] = [:]
        for variant in variants {
            if variant.maximum { try waitForOffGridLaunchMinute() }
            launch(variant)
            try openDetail(query: "Weekly planning", resultID: "ui-recurring-event")
            let title = element("calendar-readonly-detail").staticTexts["Weekly planning"].firstMatch
            try require(title.waitForExistence(timeout: 10) && title.isHittable && title.frame.height > 0,
                        "The personal fixture's real detail title must be present.")
            if variant.maximum {
                let ordinary = try XCTUnwrap(ordinaryTitleHeights[variant.language])
                try require(title.frame.height > 40 && title.frame.height > ordinary * 1.7,
                            "The uncapped detail body must actually grow at system maximum text.")
                try require(element("calendar-readonly-detail").frame.height > window.height * 0.75,
                            "Maximum text must use the real large detail detent.")
            } else {
                ordinaryTitleHeights[variant.language] = title.frame.height
            }
            try verifyPersonalToolbar(variant)
            capture("01-personal-toolbar-\(variant.tag)")
            print("CALENDAR_TOOLBAR241_VARIANT \(variant.tag) titleHeight=\(title.frame.height)")
            fflush(stdout)
            if variant.maximum { try recordSearchTiming(variant) }

            try tapToolbar(app.buttons["calendar-detail-share-event"])
            try require(element("event-share-compose").waitForExistence(timeout: 10),
                        "Share must open the existing preview through the actual toolbar action.")
            let preview = element("event-share-preview-title")
            try require(preview.waitForExistence(timeout: 10) && preview.label == "Weekly planning",
                        "The unsent share preview must retain the same fixture event.")
            capture("02-share-preview-cancel-only-\(variant.tag)")
            try tapToolbar(toolbar(["取消", "Abbrechen", "Cancel"]))
            try require(element("event-share-compose").waitForNonExistence(timeout: 10),
                        "Cancel must close the unsent preview.")
            try require(element("calendar-readonly-detail").exists, "Cancel must return to the same personal detail.")
            try verifyPersonalToolbar(variant)

            try tapToolbar(app.buttons["calendar-detail-edit"])
            try require(element("event-editor-form").waitForExistence(timeout: 10),
                        "Edit must open the existing event editor through its original callback.")
            try require(app.textFields["event-title"].value as? String == "Weekly planning"
                        && app.buttons["event-save"].exists,
                        "The editor must contain the fixture; Save is observed but never tapped.")
            capture("03-edit-open-cancel-only-\(variant.tag)")
            if variant.maximum { try inspectMaximumEditor(variant) }
            try tapToolbar(toolbar(["取消", "Abbrechen", "Cancel"]))
            try require(element("event-editor-form").waitForNonExistence(timeout: 10)
                        && app.buttons["calendar-search"].isHittable,
                        "Cancel the unchanged editor and return to the Calendar root.")

            try openDetail(query: "Coffee meetup", resultID: "ui-plan-projection")
            try require(app.staticTexts["Coffee meetup"].firstMatch.waitForExistence(timeout: 10),
                        "The selected result must be the read-only Plan projection.")
            try verifyProjectionHasNoMutationToolbar()
            capture("04-readonly-plan-toolbar-\(variant.tag)")
            let manage = app.buttons["calendar-manage-plan"]
            try revealDetailControl(manage)
            try require(manage.exists && manage.isHittable,
                        "The read-only Plan must retain its existing management route, without opening it.")
            try verifyProjectionHasNoMutationToolbar()
            capture("05-readonly-plan-management-visible-\(variant.tag)")
            try tapToolbar(toolbar(["完成", "Fertig", "Done"]))
            try require(element("calendar-readonly-detail").waitForNonExistence(timeout: 10)
                        && app.buttons["calendar-search"].isHittable,
                        "Done must return from the projection to Calendar.")
            print("CALENDAR_TOOLBAR241_VERIFIED \(variant.tag)"); fflush(stdout)
            app.terminate()
        }
    }

    private func waitForOffGridLaunchMinute() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Berlin")!
        for _ in 0..<24 {
            let now = Date(), minute = calendar.component(.minute, from: Date())
            let second = calendar.component(.second, from: now)
            if minute % 5 != 0 && !(minute % 5 == 4 && second > 35) {
                print("CALENDAR_TOOLBAR241_OFFGRID_LAUNCH hostDate=\(now) minute=\(minute) second=\(second)"); fflush(stdout)
                return
            }
            print("CALENDAR_TOOLBAR241_OFFGRID_WAIT minute=\(minute) second=\(second) waitSeconds=5"); fflush(stdout)
            Thread.sleep(forTimeInterval: 5)
        }
        try require(false, "Wait only for a genuine off-grid launch minute; never modify the device clock or fixture values.")
    }
    private func recordSearchTiming(_ variant: Variant) throws {
        for (identifier, name) in [("calendar-detail-start", "starts"), ("calendar-detail-end", "ends")] {
            let target = element(identifier)
            try revealDetailControl(target)
            let text = target.label
            let expression = try NSRegularExpression(pattern: "[0-9]{1,2}:([0-9]{2})")
            let range = NSRange(text.startIndex..., in: text)
            let match = try XCTUnwrap(expression.firstMatch(in: text, range: range), "The real detail row must expose its clock time.")
            let minute = try XCTUnwrap(Int((text as NSString).substring(with: match.range(at: 1))))
            print("CALENDAR_TOOLBAR241_SEARCH_DETAIL variant=\(variant.tag) source=search-Date-now id=\(identifier) minute=\(minute) exactAXLabel=\(text)"); fflush(stdout)
            capture("01-search-\(name)-complete-\(variant.tag)")
        }
    }
    private func launch(_ variant: Variant) {
        app?.terminate()
        app = XCUIApplication(bundleIdentifier: "app.sideseat.mobile.preview")
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials",
            "--ui-testing-skip-tutorial", "--ui-testing-local-api", "--ui-testing-chats",
            "--ui-testing-language=\(variant.language)", "--ui-testing-appearance=\(variant.appearance)",
            "-UIPreferredContentSizeCategoryName", variant.maximum
                ? "UICTContentSizeCategoryAccessibilityXXXL" : "UICTContentSizeCategoryL"]
        if variant.maximum { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
        app.launchEnvironment = ["SIDESEAT_API_BASE_URL_OVERRIDE": "http://127.0.0.1:9"]
        app.launch()
    }
    private func openDetail(query: String, resultID: String) throws {
        try require(app.tabBars.firstMatch.waitForExistence(timeout: 20), "The offline fixture shell must load.")
        let calendar = app.tabBars.buttons.element(boundBy: 2)
        try tap(calendar)
        try require(calendar.isSelected && app.buttons["calendar-search"].waitForExistence(timeout: 10),
                    "The actual Calendar root must be selected.")
        try tap(app.buttons["calendar-search"])
        let input = app.searchFields.firstMatch
        try require(input.waitForExistence(timeout: 10) && input.isHittable, "The real search input must open.")
        input.tap(); input.typeText(query)
        let result = app.buttons["calendar-search-result-\(resultID)"]
        try require(result.waitForExistence(timeout: 10) && result.isHittable, "The exact offline fixture result must load.")
        let navigation = app.navigationBars.firstMatch.frame
        let bottom = app.keyboards.firstMatch.exists ? app.keyboards.firstMatch.frame.minY : window.maxY - 36
        let clip = CGRect(x: window.minX, y: navigation.maxY + 4,
                          width: window.width, height: max(0, bottom - navigation.maxY - 8))
        let region = result.frame.intersection(clip)
        try require(!region.isNull && region.width >= 44 && region.height >= 44,
                    "Tap only a verified visible44pt region of the genuine search result.")
        app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: region.midX, dy: region.midY)).tap()
        try require(element("calendar-readonly-detail").waitForExistence(timeout: 10), "The selected detail must open.")
        try require(element("calendar-search-sheet").waitForNonExistence(timeout: 10)
                    && app.keyboards.firstMatch.waitForNonExistence(timeout: 10),
                    "The search and keyboard must be dismissed before reviewing the toolbar.")
    }
    private func verifyPersonalToolbar(_ variant: Variant) throws {
        let share = app.buttons["calendar-detail-share-event"], edit = app.buttons["calendar-detail-edit"]
        try assertToolbarAction(share); try assertToolbarAction(edit)
        try require(share.label == (variant.language == "de" ? "Termindetails teilen" : "分享日程详情")
                    && edit.label == (variant.language == "de" ? "Bearbeiten" : "编辑"),
                    "Icon actions must preserve their original localized accessibility titles.")
        let navigation = app.navigationBars.firstMatch.frame.insetBy(dx: -0.5, dy: -0.5)
        try require(navigation.contains(share.frame) && navigation.contains(edit.frame),
                    "Both complete actions must remain within the current navigation bar.")
        try require(edit.frame.minX - share.frame.maxX >= 4,
                    "Share and Edit must have separate visible actions with a geometric gap.")
        let actualNavigation = app.navigationBars.firstMatch.frame
        let geometry = "variant=\(variant.tag) shareAX=\(share.frame) editAX=\(edit.frame) navAX=\(actualNavigation) window=\(window) navWidthRatio=\(actualNavigation.width / window.width). "
            + "SSActionButtonStyle declares an outer logical minimum44x44 and Rectangle contentShape. "
            + "Native toolbar AX frames are screen geometry and may be transformed or glyph bounds; this suite checks visibility, separation and real callbacks, not a continuous44screen-point hit region."
        print("CALENDAR_TOOLBAR241_GEOMETRY \(geometry)"); fflush(stdout)
        let evidence = XCTAttachment(string: geometry)
        evidence.name = "calendar-toolbar241-geometry-" + variant.tag
        evidence.lifetime = .keepAlways; add(evidence)
    }
    private func verifyProjectionHasNoMutationToolbar() throws {
        try require(!app.buttons["calendar-detail-edit"].exists
                    && !app.buttons["calendar-detail-share-event"].exists,
                    "The read-only Plan projection must not acquire personal-event Edit or Share actions.")
    }
    private func revealDetailControl(_ target: XCUIElement) throws {
        let detail = element("calendar-readonly-detail")
        let scroll = detail.collectionViews.firstMatch.exists ? detail.collectionViews.firstMatch : detail.tables.firstMatch
        try require(scroll.waitForExistence(timeout: 10), "The current detail's actual native list must exist.")
        for attempt in 0..<18 {
            let top = app.navigationBars.firstMatch.frame.maxY + 4
            let clip = scroll.frame.intersection(window).intersection(
                CGRect(x: window.minX, y: top, width: window.width, height: max(0, window.maxY - 38 - top)))
            print("CALENDAR_TOOLBAR241_REVEAL attempt=\(attempt) detail=\(detail.frame) list=\(scroll.frame) clip=\(clip) targetExists=\(target.exists) targetFrame=\(target.exists ? target.frame : .zero)"); fflush(stdout)
            if target.exists && target.isHittable && clip.insetBy(dx: -0.5, dy: -0.5).contains(target.frame) { return }
            try require(!clip.isNull && clip.height > 96, "The actual detail list must have a usable visible area.")
            let down = target.exists && target.frame.minY < clip.minY
            if detail.frame.height <= window.height * 0.75 {
                if down { scroll.swipeDown() } else { scroll.swipeUp() }
            } else {
                let gap = target.exists ? (down ? clip.minY - target.frame.minY : target.frame.maxY - clip.maxY) : 180
                let distance = min(CGFloat(180), max(CGFloat(48), gap))
                let endY = min(clip.maxY - 24, max(clip.minY + 24, clip.midY + (down ? distance : -distance)))
                let origin = app.coordinate(withNormalizedOffset: .zero)
                origin.withOffset(CGVector(dx: clip.minX + 24, dy: clip.midY)).press(forDuration: 0.05,
                    thenDragTo: origin.withOffset(CGVector(dx: clip.minX + 24, dy: endY)), withVelocity: .slow, thenHoldForDuration: 0.1)
            }
        }
        try require(false, "The requested detail row or control must be completely reachable within the detail viewport.")
    }
    private func inspectMaximumEditor(_ variant: Variant) throws {
        let baseline = ["event-start": nativePickerState(element("event-start")),
                        "event-end": nativePickerState(element("event-end"))]
        for (id, name) in [("event-start", "starts"), ("event-end", "ends"),
                           ("event-repeat", "repeat"), ("event-repeat-until", "repeat-until")] {
            try revealEditorControl(identifier: id)
            let target = element(id)
            if id != "event-repeat" {
                try require(target.elementType == .datePicker && target.frame.height > 200
                            && target.buttons["DatePicker.Show"].exists && target.buttons.count >= 28,
                            "The actual native graphical DatePicker and calendar grid must be present.")
                let state = nativePickerState(target)
                try require(state.count >= 2, "The graphical calendar must expose its month and selected day.")
                if let original = baseline[id], !original.isEmpty {
                    try require(state == original, "Scrolling the same editor must preserve the exposed native picker state.")
                }
                if id == "event-start" || id == "event-end" {
                    let clock = try XCTUnwrap(state.last, "The existing editor must expose its native clock button.")
                    let minute = try XCTUnwrap(Int(clock.suffix(2)))
                    try require(clock.contains(":") && minute % 5 != 0,
                                "The editor's own cached fixture time must exercise the legacy off-grid branch.")
                }
                print("CALENDAR_TOOLBAR241_EDITOR_NATIVE variant=\(variant.tag) source=editor-store-fixture id=\(id) frame=\(target.frame) nativeState=\(state)"); fflush(stdout)
            }
            capture("03-max-\(name)-complete-\(variant.tag)")
        }
    }
    private func nativePickerState(_ picker: XCUIElement) -> [String] {
        guard picker.exists else { return [] }
        var state: [String] = []
        if let month = picker.buttons["DatePicker.Show"].value as? String { state.append(month) }
        state += picker.buttons.allElementsBoundByIndex.filter { $0.isSelected }.map { $0.label }
        let clock = picker.buttons.matching(NSPredicate(format: "label MATCHES %@", "[0-9]{1,2}:[0-9]{2}")).firstMatch
        if clock.exists { state.append(clock.label) }
        return state
    }
    private func revealEditorControl(identifier: String) throws {
        let editor = element("event-editor-form"), target = element(identifier)
        let origin = app.coordinate(withNormalizedOffset: .zero)
        for attempt in 0..<24 {
            let top = app.navigationBars.firstMatch.frame.maxY + 4
            let clip = editor.frame.intersection(window).intersection(
                CGRect(x: window.minX, y: top, width: window.width, height: max(0, window.maxY - 38 - top)))
            var wanted = target.exists ? target.frame : .zero
            if target.exists && target.elementType == .datePicker {
                // Preserve visual context for the separate, potentially two-line accessibility-size label.
                wanted.origin.y -= 144; wanted.size.height += 144
            }
            print("CALENDAR_TOOLBAR241_EDITOR_REVEAL id=\(identifier) attempt=\(attempt) target=\(target.exists ? target.frame : .zero) context=\(wanted) clip=\(clip)"); fflush(stdout)
            if target.exists && target.isHittable && clip.insetBy(dx: -0.5, dy: -0.5).contains(wanted) { return }
            try require(!clip.isNull && clip.height > 120, "The current editor must have a usable viewport.")
            if target.exists { try require(wanted.height <= clip.height + 0.5, "The graphical picker and its label context must fit in the current viewport.") }
            let down = target.exists && wanted.minY < clip.minY
            let gap = target.exists ? (down ? clip.minY - wanted.minY : wanted.maxY - clip.maxY) : 180
            let distance = min(CGFloat(180), max(CGFloat(48), gap))
            let endY = min(clip.maxY - 24, max(clip.minY + 24, clip.midY + (down ? distance : -distance)))
            origin.withOffset(CGVector(dx: clip.minX + 24, dy: clip.midY)).press(forDuration: 0.05,
                thenDragTo: origin.withOffset(CGVector(dx: clip.minX + 24, dy: endY)), withVelocity: .slow, thenHoldForDuration: 0.1)
        }
        try require(false, "The unedited editor control and label context must become completely visible.")
    }
    func testMaximumGraphicalEditorViewportWithoutWrites() throws {
        try require(ProcessInfo.processInfo.environment["SIMULATOR_UDID"] == "AEBD816E-53A7-4012-B76A-FEF82CF02A6B",
                    "This preparatory maximum-editor diagnostic runs only on the authorized Simulator.")
        try waitForOffGridLaunchMinute()
        let variant = Variant(language: "zh-Hans", appearance: "dark", maximum: true)
        launch(variant)
        try openDetail(query: "Weekly planning", resultID: "ui-recurring-event")
        try tapToolbar(app.buttons["calendar-detail-edit"])
        try require(element("event-editor-form").waitForExistence(timeout: 10), "The unchanged fixture editor must open.")
        try inspectMaximumEditor(variant)
        try tapToolbar(toolbar(["取消", "Abbrechen", "Cancel"]))
        try require(element("event-editor-form").waitForNonExistence(timeout: 10)
                    && app.buttons["calendar-search"].isHittable, "Cancel must return to Calendar without saving.")
        print("CALENDAR_TOOLBAR241_SINGLE_MAX_VERIFIED"); fflush(stdout)
    }
    private func toolbar(_ labels: [String]) -> XCUIElement {
        app.navigationBars.buttons.matching(NSPredicate(format: "label IN %@", labels)).firstMatch
    }
    private func assertTarget(_ target: XCUIElement) throws {
        try require(target.waitForExistence(timeout: 10) && target.isEnabled && target.isHittable,
                    "The real action must be enabled and reachable.")
        try require(window.insetBy(dx: -0.5, dy: -0.5).contains(target.frame)
                    && target.frame.width >= 43.5 && target.frame.height >= 43.5,
                    "The complete visible action must provide at least44pt within AX rounding tolerance.")
    }
    private func assertToolbarAction(_ target: XCUIElement) throws {
        try require(target.waitForExistence(timeout: 10) && target.isEnabled && target.isHittable,
                    "The real toolbar action must be enabled and reachable.")
        let frame = target.frame
        try require(frame.width > 0 && frame.height > 0
                    && window.insetBy(dx: -0.5, dy: -0.5).contains(frame)
                    && app.navigationBars.allElementsBoundByIndex.contains {
                        $0.frame.insetBy(dx: -0.5, dy: -0.5).contains(frame)
                    }, "The complete toolbar AX action must remain in its visible navigation bar and window.")
    }
    private func tapToolbar(_ target: XCUIElement) throws { try assertToolbarAction(target); target.tap() }
    private func tap(_ target: XCUIElement) throws { try assertTarget(target); target.tap() }
    private func require(_ condition: Bool, _ message: String) throws {
        guard condition else {
            if let app, app.state == .runningForeground {
                let failure = XCTAttachment(screenshot: app.screenshot())
                failure.name = "calendar-toolbar241-failure-private"; failure.lifetime = .keepAlways; add(failure)
            }
            XCTFail(message)
            throw NSError(domain: "CalendarToolbar239Visual", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
        }
    }
    private func capture(_ name: String) {
        XCTAssertEqual(app.secureTextFields.count, 0, "Authentication must never enter this offline visual suite.")
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "calendar-toolbar241-" + name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
