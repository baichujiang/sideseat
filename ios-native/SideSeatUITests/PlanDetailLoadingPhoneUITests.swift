import XCTest
import Network

/// Replays freshly captured API responses for this run's two disposable QA plans.
/// The Runner controls loopback responses; it makes no public-network requests.
@MainActor final class PlanDetailLoadingPhoneUITests: XCTestCase {
    fileprivate struct Fixture: Decodable {
        let bundle: String
        let accessToken: String
        let collectingToken: String
        let collectingTitle: String
        let confirmedToken: String
        let confirmedTitle: String
        let timeZone: String
        let snapshots: [String: Data]
    }
    private var app: XCUIApplication!
    private var proxy: PlanLoadingReadProxy!

    override func setUpWithError() throws { continueAfterFailure = false }

    func testCollectingAndConfirmedFastAndSlowEntryAtNormalAndMaximumText() throws {
        let fixture = try fixture()
        proxy = try PlanLoadingReadProxy(fixture: fixture)
        for large in [false, true] {
            launch(fixture, large: large)
            for confirmed in [false, true] {
                let token = confirmed ? fixture.confirmedToken : fixture.collectingToken
                let expected = confirmed ? fixture.confirmedTitle : fixture.collectingTitle
                let tag = "\(confirmed ? "confirmed" : "collecting")-\(large ? "maximum" : "normal")"
                print("PLAN_LOADING_CASE \(tag) fast-and-held-get")
                selectSection(confirmed: confirmed)

                proxy.arm(token, hold: false)
                tapCard(token)
                assertLoaded(expected, confirmed: confirmed)
                capture("loading-fast-\(tag)")
                backToPlans()

                proxy.arm(token, hold: true)
                tapCard(token)
                waitForGate(token)
                assertPlaceholder(expected, timeZone: fixture.timeZone)
                capture("loading-slow-start-\(tag)")
                RunLoop.current.run(until: Date().addingTimeInterval(3))
                assertPlaceholder(expected, timeZone: fixture.timeZone)
                capture("loading-slow-held-\(tag)")
                proxy.release(token)
                assertLoaded(expected, confirmed: confirmed)
                capture("loading-slow-complete-\(tag)")
                backToPlans()
            }
            app.terminate()
        }
        XCTAssertEqual(proxy.rejectedRequestCount, 0, "The focused flow must only read its allowed QA routes")
    }

    func testFailureRetryAndBackToAnotherPlanNeverReuseThePreviousSummary() throws {
        let fixture = try fixture()
        proxy = try PlanLoadingReadProxy(fixture: fixture)
        for large in [false, true] {
            launch(fixture, large: large)
            selectSection(confirmed: false)
            proxy.arm(fixture.collectingToken, hold: true, fail: true)
            tapCard(fixture.collectingToken)
            waitForGate(fixture.collectingToken)
            assertPlaceholder(fixture.collectingTitle, timeZone: fixture.timeZone)
            proxy.release(fixture.collectingToken)
            let retry = app.buttons["Retry"]
            XCTAssertTrue(retry.waitForExistence(timeout: 15))
            XCTAssertFalse(element("time-poll-loading").exists)
            XCTAssertFalse(element("time-poll-loading-title").exists)
            XCTAssertFalse(app.staticTexts["time-poll-detail-title"].exists)
            assertNoPrematureActions()
            capture("loading-failed-\(large ? "maximum" : "normal")")

            proxy.arm(fixture.collectingToken, hold: true)
            XCTAssertTrue(retry.isHittable); retry.tap()
            waitForGate(fixture.collectingToken)
            // Existing retry keeps the error page until the real GET succeeds.
            XCTAssertTrue(retry.exists)
            XCTAssertFalse(element("time-poll-loading-title").exists)
            XCTAssertFalse(app.staticTexts["time-poll-detail-title"].exists)
            assertNoPrematureActions()
            XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label == %@", fixture.confirmedTitle)).firstMatch.exists)
            capture("loading-retry-\(large ? "maximum" : "normal")")
            proxy.release(fixture.collectingToken)
            assertLoaded(fixture.collectingTitle, confirmed: false)
            backToPlans()

            selectSection(confirmed: true)
            proxy.arm(fixture.confirmedToken, hold: true)
            tapCard(fixture.confirmedToken)
            waitForGate(fixture.confirmedToken)
            assertPlaceholder(fixture.confirmedTitle, timeZone: fixture.timeZone)
            XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label == %@", fixture.collectingTitle)).firstMatch.exists)
            capture("loading-another-plan-\(large ? "maximum" : "normal")")
            proxy.release(fixture.confirmedToken)
            assertLoaded(fixture.confirmedTitle, confirmed: true)
            backToPlans()

            selectSection(confirmed: false)
            proxy.arm(fixture.collectingToken, hold: true)
            tapCard(fixture.collectingToken)
            waitForGate(fixture.collectingToken)
            assertPlaceholder(fixture.collectingTitle, timeZone: fixture.timeZone)
            capture("loading-reentry-\(large ? "maximum" : "normal")")
            proxy.release(fixture.collectingToken)
            assertLoaded(fixture.collectingTitle, confirmed: false)
            backToPlans()
            app.terminate()
        }
        XCTAssertEqual(proxy.rejectedRequestCount, 0)
    }

    func testDeepLinkWithoutCardSummaryUsesNeutralNoninteractivePlaceholder() throws {
        let fixture = try fixture()
        proxy = try PlanLoadingReadProxy(fixture: fixture)
        for large in [false, true] {
            proxy.arm(fixture.collectingToken, hold: true)
            launch(fixture, large: large, deepLinkToken: fixture.collectingToken)
            waitForGate(fixture.collectingToken)
            XCTAssertTrue(element("time-poll-loading").waitForExistence(timeout: 5))
            XCTAssertFalse(element("time-poll-loading-title").exists)
            XCTAssertFalse(element("time-poll-loading-dates").exists)
            XCTAssertFalse(app.staticTexts["time-poll-detail-title"].exists)
            XCTAssertEqual(app.activityIndicators.count, 0)
            assertNoPrematureActions()
            capture("loading-neutral-deep-link-\(large ? "maximum" : "normal")")
            proxy.release(fixture.collectingToken)
            assertLoaded(fixture.collectingTitle, confirmed: false)
            backToPlans()
            app.terminate()
        }
        XCTAssertEqual(proxy.rejectedRequestCount, 0)
    }

    private func fixture() throws -> Fixture {
        let raw = ProcessInfo.processInfo.environment["SIDESEAT_PLAN_LOADING_JSON"]
        try XCTSkipIf(raw == nil || raw!.isEmpty, "Requires this run's disposable collecting and confirmed QA plans")
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(raw!.utf8))
        addTeardownBlock { [self] in MainActor.assumeIsolated { app?.terminate(); proxy?.stop() } }
        XCTAssertNotEqual(fixture.collectingToken, fixture.confirmedToken)
        XCTAssertNotEqual(fixture.collectingTitle, fixture.confirmedTitle)
        return fixture
    }

    private func launch(_ fixture: Fixture, large: Bool, deepLinkToken: String? = nil) {
        app?.terminate(); app = XCUIApplication(bundleIdentifier: fixture.bundle)
        app.launchArguments = ["--ui-testing-authenticated", "--ui-testing-ephemeral-credentials",
            "--ui-testing-skip-tutorial", "--ui-testing-time-poll-live", "--ui-testing-local-api",
            "--ui-testing-language=en", "--ui-testing-appearance=\(large ? "dark" : "light")",
            "-UIPreferredContentSizeCategoryName", large ? "UICTContentSizeCategoryAccessibilityXXXL" : "UICTContentSizeCategoryL"]
        if large { app.launchArguments.append("--ui-testing-dynamic-type-accessibility") }
        if let deepLinkToken { app.launchArguments.append("--ui-testing-deep-link=/time-polls/\(deepLinkToken)") }
        app.launchEnvironment = ["SIDESEAT_QA_ACCESS_TOKEN": fixture.accessToken,
                                 "SIDESEAT_API_BASE_URL_OVERRIDE": proxy.baseURL]
        app.launch()
        if deepLinkToken != nil {
            XCTAssertTrue(element("time-poll-loading").waitForExistence(timeout: 20)); return
        }
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 20))
        let plans = app.tabBars.buttons.element(boundBy: 1)
        XCTAssertTrue(plans.isHittable); plans.tap()
        XCTAssertTrue(app.buttons["plans-tab-waitingResponse"].waitForExistence(timeout: 20))
    }

    private func selectSection(confirmed: Bool) {
        let section = app.buttons["plans-tab-\(confirmed ? "upcoming" : "waitingResponse")"]
        XCTAssertTrue(section.waitForExistence(timeout: 10)); XCTAssertTrue(section.isHittable)
        if !section.isSelected { section.tap() }
        XCTAssertTrue(section.isSelected)
    }

    private func tapCard(_ token: String) {
        let card = app.buttons["plans-coordinated-\(token)"]
        XCTAssertTrue(card.waitForExistence(timeout: 20))
        let window = app.windows.firstMatch.frame
        let top = app.navigationBars.firstMatch.frame.maxY + 4
        let unifiedCreate = app.buttons["plans-create-unified"]
        let create = unifiedCreate.exists ? unifiedCreate : app.buttons["plans-create-primary"]
        XCTAssertTrue(create.exists)
        let bottom = min(app.tabBars.firstMatch.frame.minY, create.frame.minY) - 8
        let viewport = CGRect(x: window.minX + 12, y: top, width: window.width - 24, height: bottom - top)
        let visible = card.frame.intersection(viewport)
        XCTAssertTrue(card.isHittable && visible.width >= 44 && visible.height >= 44,
                      "Tap an actual visible segment of the same card at true maximum text")
        let point = app.coordinate(withNormalizedOffset: .zero)
            .withOffset(CGVector(dx: visible.midX, dy: visible.midY))
        point.tap()
    }

    private func waitForGate(_ token: String) {
        let requested = XCTNSPredicateExpectation(predicate: NSPredicate { [self] _, _ in proxy.isWaiting(token) }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [requested], timeout: 15), .completed)
    }

    private func assertPlaceholder(_ expected: String, timeZone: String) {
        let placeholder = element("time-poll-loading")
        XCTAssertTrue(placeholder.waitForExistence(timeout: 5))
        let title = app.staticTexts["time-poll-loading-title"]
        XCTAssertEqual(title.label, expected)
        XCTAssertTrue(title.isHittable)
        let dates = element("time-poll-loading-dates")
        XCTAssertTrue(dates.exists, "The existing plan's date or chosen-time metadata stays visible")
        XCTAssertTrue(placeholder.label.contains(timeZone) ||
            app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", timeZone)).firstMatch.exists,
            "Loading preserves the complete actual time zone")
        XCTAssertEqual(app.activityIndicators.count, 0, "The detail never replaces its content with an independent spinner")
        XCTAssertFalse(app.staticTexts["time-poll-detail-title"].exists, "A preview must not masquerade as an authorized poll")
        assertNoPrematureActions()
    }

    private func assertNoPrematureActions() {
        for id in ["time-poll-cell-0", "time-poll-submit", "plan-share-open", "time-poll-menu",
                   "unified-plan-invite-window", "unified-plan-publish", "unified-plan-accept", "plan-view-calendar"] {
            XCTAssertFalse(app.buttons[id].exists, "Loading or failed GET cannot expose \(id)")
        }
    }

    private func assertLoaded(_ expected: String, confirmed: Bool) {
        let title = app.staticTexts["time-poll-detail-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 25)); XCTAssertEqual(title.label, expected)
        XCTAssertTrue(element("time-poll-loading").waitForNonExistence(timeout: 5))
        XCTAssertEqual(app.activityIndicators.count, 0)
        XCTAssertTrue(app.buttons[confirmed ? "plan-view-calendar" : "time-poll-cell-0"].exists)
    }

    private func backToPlans() {
        let back = app.navigationBars.firstMatch.buttons.firstMatch
        XCTAssertTrue(back.waitForExistence(timeout: 5)); XCTAssertTrue(back.isHittable); back.tap()
        XCTAssertTrue(app.buttons["plans-tab-waitingResponse"].waitForExistence(timeout: 10))
        XCTAssertFalse(element("time-poll-loading").exists)
    }

    private func element(_ id: String) -> XCUIElement { app.descendants(matching: .any)[id].firstMatch }
    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}

/// Runs on the App's device and replays Mac-captured QA responses. It controls
/// delivery timing and errors without a persistent server or product hook.
private final class PlanLoadingReadProxy: @unchecked Sendable {
    private struct Rule { let hold: Bool; let fail: Bool }
    private let listener: NWListener
    private let queue = DispatchQueue(label: "sideseat.qa.plan-loading")
    private let lock = NSLock()
    private let fixture: PlanDetailLoadingPhoneUITests.Fixture
    private var rules: [String: Rule] = [:]
    private var pending: [String: () -> Void] = [:]
    private var connections: [NWConnection] = []
    private var rejected = 0
    private(set) var baseURL = ""
    var rejectedRequestCount: Int { lock.withLock { rejected } }

    init(fixture: PlanDetailLoadingPhoneUITests.Fixture) throws {
        self.fixture = fixture
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
        listener = try NWListener(using: parameters)
        let ready = DispatchSemaphore(value: 0)
        listener.stateUpdateHandler = { state in
            if case .ready = state { ready.signal() }
            if case .failed = state { ready.signal() }
        }
        listener.newConnectionHandler = { [weak self] connection in self?.accept(connection) }
        listener.start(queue: queue)
        guard ready.wait(timeout: .now() + 5) == .success, let port = listener.port else {
            listener.cancel(); throw NSError(domain: "PlanLoadingReadProxy", code: 1)
        }
        baseURL = "http://127.0.0.1:\(port.rawValue)"
    }

    func arm(_ token: String, hold: Bool, fail: Bool = false) {
        lock.withLock { rules[token] = Rule(hold: hold, fail: fail) }
    }
    func isWaiting(_ token: String) -> Bool { lock.withLock { pending[token] != nil } }
    func release(_ token: String) { lock.withLock { pending.removeValue(forKey: token) }?() }
    func stop() {
        listener.cancel()
        lock.withLock { connections.forEach { $0.cancel() }; connections.removeAll(); pending.removeAll() }
    }

    private func accept(_ connection: NWConnection) {
        lock.withLock { connections.append(connection) }
        connection.start(queue: queue)
        receive(connection, data: Data())
    }
    private func receive(_ connection: NWConnection, data: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 16_384) { [weak self] chunk, _, complete, error in
            guard let self else { return }
            var received = data; received.append(chunk ?? Data())
            if let header = String(data: received, encoding: .utf8), header.contains("\r\n\r\n") {
                self.handle(connection, header: header)
            } else if received.count < 32_768 && !complete && error == nil {
                self.receive(connection, data: received)
            } else { connection.cancel() }
        }
    }
    private func handle(_ connection: NWConnection, header: String) {
        let lines = header.components(separatedBy: "\r\n")
        let request = (lines.first ?? "").split(separator: " ")
        let auth = lines.first { $0.lowercased().hasPrefix("authorization:") }?
            .split(separator: ":", maxSplits: 1).last?.trimmingCharacters(in: .whitespaces)
        let route = request.count >= 2 ? String(request[1]) : ""
        let allowed = [fixture.collectingToken, fixture.confirmedToken]
        let token = route.hasPrefix("/api/v1/time-polls/") ? String(route.dropFirst("/api/v1/time-polls/".count)) : nil
        if request.first == "GET", auth == "Bearer \(fixture.accessToken)", route == "/api/v1/plans" {
            reply(connection, status: 200, data: Data("{\"data\":{\"plans\":[]}}".utf8)); return
        }
        guard request.first == "GET", auth == "Bearer \(fixture.accessToken)",
              route == "/api/v1/time-polls" || token.map(allowed.contains) == true else {
            lock.withLock { rejected += 1 }
            reply(connection, status: 403, data: Data("{\"error\":\"QA read allowlist\"}".utf8)); return
        }
        let rule = token.flatMap { value in lock.withLock { rules.removeValue(forKey: value) } }
        let respond = { [self] in
            if rule?.fail == true {
                reply(connection, status: 500, data: Data("{\"error\":\"Controlled disposable QA read failure\"}".utf8))
                return
            }
            guard let body = fixture.snapshots[route] else {
                reply(connection, status: 500, data: Data("{\"error\":\"Missing current QA snapshot\"}".utf8)); return
            }
            reply(connection, status: 200, data: body)
        }
        if let token, rule?.hold == true { lock.withLock { pending[token] = respond } }
        else { respond() }
    }
    private func reply(_ connection: NWConnection, status: Int, data: Data) {
        var response = Data("HTTP/1.1 \(status) QA\r\nContent-Type: application/json\r\nContent-Length: \(data.count)\r\nConnection: close\r\n\r\n".utf8)
        response.append(data)
        connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
    }
}
