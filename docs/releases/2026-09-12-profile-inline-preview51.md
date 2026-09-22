# Inline profile editor — Preview 51

Date: 2026-09-12. User requested titles on the left with inputs or choices on the right.

## Change

All profile fields use an aligned label column and right-hand control at ordinary text sizes. The gender control uses the same menu style as school, student status and degree. The tagline counter sits below its label and the input still grows from one to three lines. Empty text fields no longer repeat the adjacent title as a placeholder; explicit accessibility labels preserve their names. At accessibility text sizes, rows stack vertically to leave controls enough width. Input heights, theme colors, field bindings, validation and save/dismiss behavior are preserved.

The only changed app source relative to Preview 50 is `Features/Profile/ProfileEditSheet.swift`. The existing school-change UI test also updates obsolete Me-page identifiers to the current verification row and campus summary, retaining assertions for the selected school, unverified status and course archive.

## Verification

- Existing nickname/contact save UI test passed (22.751s).
- Existing unsaved-edit protection UI test passed (27.429s).
- Existing school-change UI test initially failed after successful save because it expected removed Me-page identifiers. After updating the selectors to the current page, the complete confirmation and archive flow passed (26.285s).
- Simulator screenshot inspected: labels and controls align horizontally without clipping at the tested ordinary text size. Evidence: `docs/visual-qa/profile-inline-preview51.png`.
- Source comparison confirms state, validation, save and dismissal logic matches Preview 50.

## Delivery source

Prepared from `/tmp/sideseat-profile-compact-preview50-source` with the updated profile file and existing UI-test correction overlaid at `/tmp/sideseat-profile-inline-preview51-source`. This retains the API and intention lifecycle used by the currently deployed backend. The separate pending persistent-intention backend changes are not included.

Signed Development build and strict code-signature verification passed. Identity: SideSeat Preview / `app.sideseat.mobile.preview` / 1.0.0 (51), API `https://api.sideseat.de`. Installed and launched successfully on the paired iPhone 16 Pro Max. Device inventory confirms Preview 51 and ordinary SideSeat 41. `git diff --check` passed.

Source lineage: commit `891b627` plus the preserved Preview 49/50 UI overlays and this profile layout change; the shared working tree remains uncommitted. No database migration, backend deployment, TestFlight/App Store upload, archive/export or production dSYM upload was performed. Physical-device verification covers installation and launch; profile interactions and the screenshot were verified with simulator fixtures.

Evidence logs:
- `/tmp/sideseat-profile-inline-ui-tests.log`
- `/tmp/sideseat-profile-inline-school-ui-test.log`
- `/tmp/sideseat-profile-inline-preview51-build.log`
- `/tmp/sideseat-profile-inline-preview51-install.json`
- `/tmp/sideseat-profile-inline-preview51-launch.json`
- `/tmp/sideseat-profile-inline-preview51-apps.json`
