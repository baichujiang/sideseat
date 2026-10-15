# Preview 103 physical acceptance

This directory retains the standalone native/API split runner, generated with
the pinned XcodeGen. The full Safari flow below uses the main Preview scheme.
Both use ephemeral QA credentials and preserve the owner's login session.
Use iPhone 14 Plus `00008110-001A69110CC1401E` explicitly.

## Full phone Safari flow

The canonical complete phone acceptance is now
`SideSeatUITests/UnifiedPlanLiveUITests/testSafariGuestShareNicknameAndConfirmation`
in the main `SideSeat-Preview` scheme. It runs on the same installed Preview 103
and opens real Safari on the phone. It exercises Copy link, guest filling, guest
nickname editing, native roster/invitation and nickname editing, Safari acceptance,
then native confirmed details and Calendar. Only initial fixture setup and
persistence assertions use API calls from the Mac; guest UI actions use Safari.

Build for testing with the exact device and main scheme. Supply the same private
QA environment values below to a private xctestrun copy; do not put credentials
in generated project settings, command arguments or Git. Keep the account
ephemeral and clean up its polls/account after acceptance.

`SIDESEAT_GUEST_PHONE_FIXTURE_JSON` supplies `token`, `title` and `shareUrl` for a
fresh collecting plan with two expected people, one future date, 09:00–12:00 and
a 60-minute duration. The Mac prepares it through the active API. The owner
account's availability and all guest responses are filled through the phone UI.
Use a fresh fixture for each attempt because painting an existing range erases it.

The test prints `GUEST_PHONE_PHASE awaiting-confirmation` and `... confirmed`.
At those boundaries, the Mac verifies no premature Calendar row, the final
CONFIRMED state, both edited names, the same guest response identity and exactly
one registered-user Calendar row with the named guest companion. Keep these
authenticated checks local and store only sanitized verdicts as evidence.

On a host phone that also has SideSeat installed, opening a universal link can
show Safari's Open in SideSeat dialog. The test enters the canonical www web
destination through Safari's address field to exercise the guest page on this
same phone. The naked-domain redirect is checked separately. No associated-domain
or app-opening preference is disabled. The runner dismisses a leftover Safari
keyboard before accessing the address bar, replaces existing names through the
visible Select All menu, and waits for the native foreground transition before
opening results. These are automation-state requirements, not product changes.

Some devices deny Wi-Fi to the newly installed XCTest runner even though Preview
and Safari have internet access. This test needs no runner network access: fixture
creation and data assertions stay on the Mac. The older native/API split test
below requires its own runner networking permission.

## Device authorization

An unlocked device is not sufficient proof of XCTest authorization. After a
device restart or a new automation session, iOS can show **Enable UI automation /
为 XCTest 输入 iPhone 密码** while `devicectl ... lockState` still reports
`passcodeRequired: false`. The owner must enter the passcode directly on the
phone. Do not request or enter their passcode from the test runner.

`Timed out while enabling automation mode` means this separate authorization
has not completed. Earlier stale sessions can instead report exit 74 / IDE
disconnection. Inspect the phone screen and the XCTest result before retrying;
do not repeatedly rebuild or change signing solely because of that message.

Use the wired default device. If the device testing service remains stuck after
ordinary reconnection, a deliberate phone restart clears its session state but
requires the owner's unlock and automation authorization again. Do not automate
reboots as a generic test retry policy.

For the standalone native/API split check, run only
`UnifiedPlanLiveUITests/testGuestNamesInvitationsAndCalendar` with
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
