# Profile field order — Preview 53

Date: 2026-09-12. User reported the approved field order was missing from phone Preview. Read-only inventory confirmed Preview 52 was installed; the later local profile polish and regrouping had only been validated in the simulator. User's instruction not to open the app on the phone is respected by installing this update without launching it.

## Included behavior

- Basics: nickname → gender → tagline.
- Study: school → student status → degree → major → semester / graduation year for alumni.
- Contact handles retain their existing order.
- Includes the polished grouped form, avatar/account header and focused-input feedback already verified locally.

## Source and verification

Source is `891b627` plus the current working tree. Within the seven-file source manifest saved for Preview 52, only `Features/Profile/ProfileEditSheet.swift` differs. This build uses the current persistent-intention client contract, as delivered in Preview 52; it does not use the older isolated UI source copies.

Signed Development build succeeded using `/tmp/SideSeatPreviewNamed41`. Strict code-signature verification passed. A full app-source hash manifest taken before the build matched after completion: `/tmp/sideseat-profile-order-preview53/source-manifest.json`.

The unchanged profile source already passed the two relevant simulator tests for nickname/contact saving and school-change confirmation after regrouping: `/tmp/sideseat-profile-reorder-ui-tests.log`, 2 tests, 0 failures. No repeat test run or physical UI test is claimed for this delivery. The inspected layout screenshot is `docs/visual-qa/profile-editor-reordered-light.png`.

## Installation

Identity: SideSeat Preview / `app.sideseat.mobile.preview` / 1.0.0 (53), API `https://api.sideseat.de`. Installed on the paired iPhone 16 Pro Max. Post-install inventory confirms Preview 53 and ordinary SideSeat 41. No app launch command was issued. No production migration, backend deployment, TestFlight/App Store upload or production dSYM upload was performed.

Preserved artifact: `/tmp/sideseat-profile-order-preview53/SideSeat.app`.

Evidence:
- `/tmp/sideseat-profile-order-preview53-build.log`
- `/tmp/sideseat-profile-order-preview53/build-identity.json`
- `/tmp/sideseat-profile-order-preview53-install.json`
- `/tmp/sideseat-profile-order-preview53-apps.json`
