# Preview 102 — availability interaction

Status: source committed/pushed, signed app installed; final physical acceptance
and normal launch await the default phone's unlock. Date: 2026-10-15, Europe/Berlin.

- Source: `f3a54be21f9b0eb715129fc4ea217a57d65fb45a` on
  `codex/ios-uxui-20260922`, pushed to origin.
- App: **SideSeat Preview / app.sideseat.mobile.preview / 1.0.0 (102)**.
- Device: **iPhone 14 Plus / iOS 26.6.1**, UDID
  `00008110-001A69110CC1401E`, CoreDevice
  `D906CC6D-3EC6-50A2-8D93-A6602521362A`.
- API: `https://api.sideseat.de`. Prior backend release ID:
  `dpl_4vBvPch35jxdarqmgnxmvSsGSt6u`. This UI-only stage did not redeploy or
  independently re-inspect that deployment ID.

Swipes now scroll the availability grid, taps edit individual cells, and a
deliberate hold starts range painting/erasure. Cells are larger and have visible
borders. A one-step Undo also autosaves. The planning/confirmation API and
Calendar rules are unchanged.

## Build and installation

Signed Preview build succeeded for the explicit default device. Strict/deep
signature verification passed and the profile includes the exact device UDID.
Bundle/build/API identity were checked. Final installation succeeded at **19:53**;
the later device inventory confirms Preview **102** and ordinary SideSeat **97**.

Signed executable SHA-256:
`2a79b3fafd63683e42e6f33a8778c1d54c6d25a60af7c38238de834c790e7a7f`.

Final signed app:
`/tmp/sideseat-preview102-availability/Build/Products/Preview-iphoneos/SideSeat Preview.app`.
Installation receipt: `/tmp/sideseat-availability102-20261015/install102c.json`.

The final phone UI runner was blocked before execution: Xcode destination
preparation requested unlocking, and CoreDevice reports `passcodeRequired: true`.
No final physical-gesture or normal-launch pass is claimed. Developer Mode was
already enabled; the owner was asked only to unlock/connect the phone.

## Verification

[QA evidence](../qa/2026-10-15-preview102-availability-gestures.md) records the
Preview 101 physical-device reproduction, two passing final Simulator interaction
cases, four passing existing unit tests and independent real-API persistence
checks. Disposable account/data cleanup completed. Pinned project generation
is stable; string-file lint and `git diff --check` passed.

No backend migration, TestFlight upload or App Store release occurred.
