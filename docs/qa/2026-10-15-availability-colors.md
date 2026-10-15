# Availability colors QA — 2026-10-15

Native source `f508e646df9851750881c2c90eae35c900558359`, committed and pushed.
Preview **1.0.0 (105)** / `app.sideseat.mobile.preview`, wired iPhone 14 Plus
`00008110-001A69110CC1401E`, iOS 26.6.1 (23G83). No other phone was used.

## Appearance and behavior

Selected time cells and fully selected date headers now use teal, with a paired
foreground. A partly selected day has an amber header/minus symbol; unselected
time stays empty. The three-state legend uses strong secondary text. Existing
checkmarks, accessible values and full-day selection behavior remain. The shared
palette is `SideSeatTheme.Availability`; other routine controls and the existing
results heatmap retain their colors.

Actual Chinese Light and Dark screenshots were inspected: full/partial/empty
headers and selected/unselected cells are distinct, legend labels fit, and dates
and symbols remain readable. Calculated sRGB foreground/fill contrast is **5.61:1
/ 5.28:1** for selected Light/Dark and **6.42:1 / 7.84:1** for partial Light/Dark.
These are token-pair calculations, not hardware display measurements.

The final signed build passes two physical tests:

| Test | Result |
| --- | --- |
| `testDayHeaderSelectsClearsUndoesAndPersists` | PASS, 83.108 s; Light and Dark |
| `testOrdinarySwipesScrollWithoutEditing` | PASS, 25.111 s |

The day test covers another date's single cell, full-day selection, partial state,
fill, clear, Undo and results read-only headers, then Chinese Light/Dark relaunch.
Live API reads match all 48 first-day slots plus the preserved other-date slot;
the scrolling poll remains empty. No save semantics, gestures or API contract
changed. Strings validation passes in English, Chinese and German; project
regeneration, signed build and deep/strict signature checks pass.

## Reproduction and evidence

Run the two named cases in the main `SideSeat-Preview` scheme with the explicit
arm64 physical destination. Use two disposable empty five-date polls from
09:00–21:00, title `QA102 Gesture regression` (the active test's fixture assertion).
Use the existing private `SIDESEAT_AVAILABILITY_GESTURE_QA` bundle/token/poll
variables plus `SIDESEAT_AVAILABILITY_DAY_QA_FIXTURE_JSON` with the day poll's
`token`, `firstDate` and first `secondSlotId`. QA credentials remain ephemeral.

- [Light phone screenshot](./evidence/2026-10-15-availability-colors105/phone-colors-light.png)
- [Dark phone screenshot](./evidence/2026-10-15-availability-colors105/phone-colors-dark.png)
- [XCTest summary](./evidence/2026-10-15-availability-colors105/xctest-summary.json)
- [API persistence](./evidence/2026-10-15-availability-colors105/api-verification.json)
- [Color contrast](./evidence/2026-10-15-availability-colors105/color-contrast.json)
- [Device and normal launch](./evidence/2026-10-15-availability-colors105/device-and-launch.json)
- [Cleanup](./evidence/2026-10-15-availability-colors105/cleanup-summary.json)
- [SHA-256 manifest](./evidence/2026-10-15-availability-colors105/manifest.json)

Both temporary polls and the disposable account were deleted; its old token
returns 401. The test runner was uninstalled. Empty-argument normal Preview 105
launch (PID 765) was verified in the running-process list; ordinary SideSeat 97
remains installed. The owner's persistent credentials and appearance preference
were preserved. Private credentials/xctestrun, raw results/recordings and diagnostics
were removed after extracting this sanitized evidence. No backend release,
database migration or App Store/TestFlight upload occurred.
