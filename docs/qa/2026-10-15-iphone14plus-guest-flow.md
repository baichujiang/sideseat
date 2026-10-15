# iPhone 14 Plus guest flow — 2026-10-15 follow-up

This is a new physical verification record. The earlier Preview 103 bootstrap
failures in [guest QA](./2026-10-15-guest-plans.md) remain historical evidence.

## Device and source

- Wired iPhone 14 Plus, `00008110-001A69110CC1401E`, CoreDevice
  `D906CC6D-3EC6-50A2-8D93-A6602521362A`, iOS 26.6.1 (23G83).
- Xcode 26.6 (17F113), explicit arm64 destination, `SideSeat-Preview` main scheme.
- Installed Preview **1.0.0 (103)** / `app.sideseat.mobile.preview`, native source
  `827b570`. Ordinary SideSeat 97 remains separate and installed.
- Backend/web source `2285ad1`, live deployment
  `dpl_6Un8qZtCE26v7edqKd2UBexBUHLx`; API alias inspected again this session.
  No app feature code, database schema or production deployment changed here.
- Physical test/reproduction source: `3eb3e3184657586cb986fc29320a0c97b95eb48d`, committed and pushed.

## Connection recovery

The old service session first reported IDE disconnection / runner exit 74.
Restarting the Mac CoreDevice service and the phone testing service alone did not
restore testing. After a deliberate full phone reboot and owner unlock, XCTest
reported **Timed out while enabling automation mode**. Xcode's phone screenshot
showed the separate **Enable UI automation / 为 XCTest 输入 iPhone 密码** screen.
`devicectl` had still reported `passcodeRequired: false`: ordinary unlock did not
prove automation permission. The owner entered the passcode directly on the phone
and explicitly confirmed authorization. No passcode was read, stored or entered
by the test, and no signing or device security setting was weakened.

The main bound Preview runner then entered and passed physical UI tests. The
newly installed runner's own URLSession was denied Wi-Fi (-1009), while Preview
and Safari had working access. Fixture setup and persistence assertions therefore
run on the Mac; all guest actions run in real phone Safari. No runner network
permission change is needed by this UI flow.

## Physical results

| Check | Actual result |
| --- | --- |
| Plans creation → Cancel, three consecutive cycles | PASS, 28.808 s; directly returns to Plans each time |
| Safari guest filling → rename → App invitation → web confirmation → native Calendar | PASS, 129.412 s; real Safari and Preview |
| Long hold/range, tap erase, undo, restart and saved selection | PASS, 56.388 s; saved slots `[0, 1, 2, 3]` |
| Ordinary vertical/horizontal swipes over cells without edits | PASS, 23.338 s; saved slots remain empty |

The Safari story uses one new disposable registered owner and one browser-scoped
guest. The Mac creates an empty future poll; the phone fills both people's
availability. The native Copy link action is exercised, then Safari explicitly
loads the returned link's canonical www destination. On a phone that also has
SideSeat installed, a normal universal-link open can offer to open the App; no
associated-domain preference was changed. The naked link's 307 and www 200 were
also checked directly.

Guest `Guest Lin` becomes `Lin Xia` while collecting and `Lin Final` during the
invitation; owner `Host Ming` becomes `Host Li`. Host API checks at UI phase
boundaries verify the same guest response identity, one accepted/no Calendar
before guest confirmation, then two accepted/exactly one owner Calendar entry
with the named guest companion. The phone reopens Calendar search, the entry and
Manage plan, checking the final guest name again. No guest download or account
registration occurs.

Initial UI attempts exposed test-harness issues: Safari's universal-link dialog,
leftover keyboard hiding the address field, caret/selection handling and app
foreground transition timing. They are recorded here as failed attempts, not passing
verdicts. Nicknames are replaced with Safari's visible Select All menu and checked
before saving. No product code was changed to bypass the UI.

## Evidence and cleanup

Only passing synthetic phone screenshots and sanitized summaries are retained:

- [Safari confirmed](./evidence/2026-10-15-iphone14plus-guest103/phone-web-confirmed.png),
  [native confirmed](./evidence/2026-10-15-iphone14plus-guest103/phone-native-confirmed.png),
  [Calendar details](./evidence/2026-10-15-iphone14plus-guest103/phone-calendar.png).
- [Safari XCTest](./evidence/2026-10-15-iphone14plus-guest103/safari-xctest-summary.json),
  [creation XCTest](./evidence/2026-10-15-iphone14plus-guest103/creation-xctest-summary.json),
  [gesture XCTest](./evidence/2026-10-15-iphone14plus-guest103/gesture-xctest-summary.json).
- [API boundary assertions](./evidence/2026-10-15-iphone14plus-guest103/api-verification.json),
  [gesture persistence](./evidence/2026-10-15-iphone14plus-guest103/gesture-verification.json),
  [device/normal launch](./evidence/2026-10-15-iphone14plus-guest103/device-and-launch.json),
  [SHA-256 manifest](./evidence/2026-10-15-iphone14plus-guest103/manifest.json).

The disposable account and its final three polls were deleted; previous attempt
fixtures were deleted between retries. The deleted access token returns 401.
[Cleanup verdict](./evidence/2026-10-15-iphone14plus-guest103/cleanup-summary.json).
Private credentials/xctestrun copies, raw recordings, device diagnostics and the
operator-created authorization screenshots were removed after extracting this
sanitized evidence. The QA runner was uninstalled. Preview 103 was then launched
with empty arguments (PID 694) and verified in the running-process list; ordinary
SideSeat 97 remains installed. Ephemeral QA credentials never replaced the owner's
persistent login. This follow-up required no new build number or backend release.
