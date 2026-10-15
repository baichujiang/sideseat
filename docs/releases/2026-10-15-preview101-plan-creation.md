# Preview 101 — single-sheet plan creation

Status: committed, pushed and installed on the default iPhone 14 Plus on
2026-10-15, Europe/Berlin.

- Branch: `codex/ios-uxui-20260922` in the active `Sideseat-ios-uxui` checkout.
- Native source commit: `f3def22fcd9e70ecd5dcae12a42087b6aac7f349`, pushed to origin.
- App: **SideSeat Preview / app.sideseat.mobile.preview / 1.0.0 (101)**.
- Device: **iPhone 14 Plus / iOS 26.6.1**, UDID
  `00008110-001A69110CC1401E`, CoreDevice
  `D906CC6D-3EC6-50A2-8D93-A6602521362A`.
- API: `https://api.sideseat.de`. The existing backend release records deployment
  `dpl_4vBvPch35jxdarqmgnxmvSsGSt6u`; this UI-only delivery did not redeploy or
  independently re-inspect that deployment ID.

Plans → + now presents the creation form directly in one sheet. Cancel and a
downward dismissal return directly to Plans. Saving opens the created detail in
the same sheet, with Done returning to Plans. The Messages list's explicit
creation entry remains usable.

## Build and device verification

A fresh signed Preview build completed with the exact device destination.
`codesign --verify --deep --strict` passed; the profile includes the target UDID.
Bundle, version and API identity were checked before installation.

Signed executable SHA-256:
`ec506b8cb679cfc2a2cb567f9ed9e1264579d4713d2640e11e625f95cef79c86`.

`devicectl` installation succeeded, and device app inventory confirms Preview
**101** alongside ordinary SideSeat **97**. Normal foreground launch with empty
app arguments succeeded at **19:36 Europe/Berlin**, PID **886**, followed by a
successful running-process check. Temporary UI runners were removed.

[Physical QA](../qa/2026-10-15-preview101-plan-creation.md) reproduces the failure
on 100 and verifies three permanent UI regressions plus an isolated real-API
save-flow check on 101. Disposable account/data cleanup completed. Pinned project
regeneration was stable and `git diff --check` passed.

Local signed app:
`/tmp/sideseat-preview101-plan-presentation/Build/Products/Preview-iphoneos/SideSeat Preview.app`.
Local installation/launch receipts: `/tmp/sideseat-plan-presentation-20261015/`.

No backend/database migration, TestFlight upload or App Store release occurred.
