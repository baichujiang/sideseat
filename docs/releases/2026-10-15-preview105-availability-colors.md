# Preview 105 — availability state colors

The owner requested clearer color distinctions in availability editing. Selected
cells and full-day headers now use teal; partly selected days use amber; empty
time remains unfilled. A compact localized legend and existing checkmarks/minus
symbols explain the states. Light/Dark have explicit contrasting color pairs, and
legend text uses the strong secondary token. Navigation and other routine controls
retain their current palette.

Source **`f508e646df9851750881c2c90eae35c900558359`** is committed and pushed on
`codex/ios-uxui-20260922`. Signed **SideSeat Preview / app.sideseat.mobile.preview /
1.0.0 (105)** is installed on the default **iPhone 14 Plus**,
`00008110-001A69110CC1401E`. Signing team `V4238R5R53`, device profile inclusion
and deep/strict signature verification pass.

Final physical acceptance passes full-day/partial/fill/clear/Undo/reopen in Light
and Dark (83.108 s), plus ordinary scrolling without edits (25.111 s). Actual
Chinese screenshots were inspected. Live API assertions confirm unchanged saved
slots and preserved selections on other dates. [QA and screenshots](../qa/2026-10-15-availability-colors.md).
English/Chinese/German strings and the signed build pass. Calculated contrast for
the four new foreground/fill pairs is 5.61, 5.28, 6.42 and 7.84:1.

No backend/schema/API or archived implementation changed. The existing backend
remains `2285ad1` / `dpl_6Un8qZtCE26v7edqKd2UBexBUHLx`; no deployment or migration
was required. Guest sharing, nickname editing and web confirmation continue from
103, and weekday selection/Undo continue from 104. No TestFlight/App Store upload.

The disposable account and both polls were deleted; its old token returns 401.
The QA runner was removed, then normal empty-argument Preview 105 launch (PID 765)
was verified as running. Ordinary SideSeat 97 remains installed and owner
credentials/preferences were preserved. Evidence excludes private credentials
and raw device diagnostics.
