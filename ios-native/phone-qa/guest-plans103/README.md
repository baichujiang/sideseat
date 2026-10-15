# Preview 103 physical acceptance

Generate this standalone UI runner with the pinned XcodeGen. It controls an
already installed signed Preview; it never replaces the owner's login session.
Use iPhone 14 Plus `00008110-001A69110CC1401E` explicitly.

Run only `UnifiedPlanLiveUITests/testGuestNamesInvitationsAndCalendar` with
`SIDESEAT_UNIFIED_PLAN_QA=1`, API `https://api.sideseat.de`, Preview bundle ID,
and a private disposable-account JSON array supplied through the existing QA
environment variables. One account is sufficient for this test. It verifies
native nickname editing, guest roster, browser-API rename/confirmation and
Calendar outcome. The web UI is verified separately with two browser contexts.

The active AvailabilityGestureUITests and PlanCreationPresentationUITests are
also included for physical regression. Supply fresh synthetic gesture polls,
access token and Preview bundle through their explicit test environment variables;
run the single Plans cancel regression plus both gesture tests. Their existing
QA102 fixture title is a test assertion, not a historical implementation restore.

Keep xctestrun files, result bundles, credentials and operator keys out of Git.
Delete all QA polls/accounts after acceptance and remove the standalone runner.
Actual verdicts and installed source/build are recorded in docs/releases.
