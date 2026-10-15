# Preview 104 — tap a weekday to select its whole day

The owner requested a faster way to edit availability by tapping a weekday.
In My availability, tapping a weekday/date header selects that date's complete
configured time range. Tapping a fully selected header clears that day; a partly
selected day becomes full. Other dates keep their selections. Headers show empty,
partial and full states, and the change supports Undo and automatic saving.
Group results retains read-only date labels. English, Chinese and German labels
and accessibility values/hints are included.

Native/config/test source **`b314a90e90ca857139ba1034d22e119c22ee3a2a`** is
committed and pushed on `codex/ios-uxui-20260922`. The signed **SideSeat Preview /
app.sideseat.mobile.preview / 1.0.0 (104)** is installed on the default **iPhone 14
Plus**, UDID `00008110-001A69110CC1401E`. Identity, signing team
`V4238R5R53`, device profile inclusion and deep/strict signature checks pass.

Three real physical UI tests pass: day select/partial/fill/clear/Undo/reopen and
Chinese accessibility (71.547 s), existing deliberate range editing and persistence
(56.475 s), and ordinary swipes without edits (23.240 s). Live API assertions
verify all 48 slots plus one preserved slot on another date, and the unchanged
range/scroll outcomes. [QA and phone screenshots](../qa/2026-10-15-day-selection.md).

Backend remains the existing `2285ad1` / `dpl_6Un8qZtCE26v7edqKd2UBexBUHLx`;
this delivery needs no backend deployment or database migration. Guest sharing,
nickname editing and web confirmation remain from 103. No archived code was used.
Ordinary SideSeat 97 stays installed; no App Store/TestFlight upload occurred.

The temporary account and all three polls were deleted; its token now returns
401. The test runner was removed. Empty-argument normal launch of Preview 104
succeeded (PID 731) and was verified as running after cleanup. The owner's
persistent credentials were preserved. Delivery evidence contains no private QA
credentials or raw device diagnostics.
