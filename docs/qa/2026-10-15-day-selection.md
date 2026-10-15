# Day-header availability QA — 2026-10-15

Source `b314a90e90ca857139ba1034d22e119c22ee3a2a`, committed and pushed.
Signed Preview **1.0.0 (104)**, `app.sideseat.mobile.preview`, on wired iPhone 14
Plus `00008110-001A69110CC1401E` / iOS 26.6.1 (23G83). The old iPhone was not used.

## Physical acceptance

| Test | Result |
| --- | --- |
| `testDayHeaderSelectsClearsUndoesAndPersists` | PASS, 71.547 s |
| `testDeliberateRangeTapEraseAndUndoPersist` | PASS, 56.475 s |
| `testOrdinarySwipesScrollWithoutEditing` | PASS, 23.240 s |

The new test selects one cell on another date, taps the first day's header to
select all 48 slots, erases one cell and verifies the partial state, taps the
header to fill the missing cell, taps again to clear that day, then undoes.
The other date's selected cell survives each action. Results has no editing
header buttons. Relaunching in Chinese preserves the selection and exposes the
localized full-day accessibility value. Existing long-hold selection, tap erase,
Undo, relaunch persistence and ordinary vertical/horizontal scrolling still pass.

Authenticated API reads verify exact persisted selections for all three polls:
range `[0, 1, 2, 3]`, ordinary scrolling `[]`, and all 48 first-day slots plus the
one selected slot on the other date. “All day” means all candidate slots within
this plan's configured hours (09:00–21:00 here), preserving its immutable range.

Project generation, signed physical build-for-testing, deep/strict signature,
correct team/profile inclusion and English/Chinese/German strings validation pass.
No backend, OpenAPI, database, archived code or guest web implementation changed.
The existing production API is used for autosave; no backend release was needed.

## Reproduction

Use the main `SideSeat-Preview` scheme and explicit physical arm64 destination.
Run only `SideSeatUITests/AvailabilityGestureUITests`. Prepare three fresh empty
future five-date polls, 09:00–21:00, titled `QA102 Gesture regression` (the active
test's fixture assertion). Use one disposable account and ephemeral native
credentials. Supply the existing `SIDESEAT_AVAILABILITY_GESTURE_QA=1`, bundle,
access token, range-poll and scroll-poll environment values through a private
xctestrun copy. Add `SIDESEAT_AVAILABILITY_DAY_QA_FIXTURE_JSON` containing the third
poll's `token`, `firstDate` and `secondSlotId` (the first slot of its second date).
The new case skips when that extra fixture is absent. Never use owner credentials
or commit a credential-bearing xctestrun file.

## Evidence and cleanup

- [Chinese full-day header after relaunch](./evidence/2026-10-15-day-selection104/phone-day-reopened-chinese.png)
- [English full-day header](./evidence/2026-10-15-day-selection104/phone-day-selected.png)
- [XCTest summary](./evidence/2026-10-15-day-selection104/xctest-summary.json)
- [API persistence assertions](./evidence/2026-10-15-day-selection104/api-verification.json)
- [Install and normal launch](./evidence/2026-10-15-day-selection104/device-and-launch.json)
- [Cleanup](./evidence/2026-10-15-day-selection104/cleanup-summary.json)
- [SHA-256 evidence manifest](./evidence/2026-10-15-day-selection104/manifest.json)

All three temporary polls and the disposable account were deleted; its old token
returns 401. The QA runner was removed and Preview 104 launched with empty
arguments (PID 731), verified in the running-process list. Ordinary SideSeat 97
remains installed. Private credentials, raw results/recordings, diagnostics and the
secret xctestrun copy were removed after extracting sanitized evidence. Ephemeral
QA credentials did not replace the owner's persistent login.
