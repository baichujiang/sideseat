# Compact profile editor — Preview 50

Date: 2026-09-12. User requested a more compact Edit Profile page.

## Change

Only `ProfileEditSheet.swift` changes relative to Preview 49. Normal-size field gaps decrease from 16 to 10pt, section gaps from 24 to 16pt, label gaps from 7 to 4pt, and card vertical padding from 16 to 12pt. Inputs retain a 44pt minimum height. The tagline grows from one to three lines instead of reserving two lines. Larger accessibility text retains 16pt field gaps, 24pt section gaps and the original card padding. Colors, fonts, fields, validation and save/dismiss behavior remain as before. Shared privacy sheets keep their previous padding through the default section setting.

## Verification

- Signed Development build and strict code-signature verification passed.
- Existing UI save test passed, including nickname and contact editing.
- Existing unsaved-change test passed, covering the swipe dismissal prompt, keeping edits, explicit discard and closing an unchanged editor. Two earlier attempts ended when the test runner was killed; the final separate run passed after the concurrent build finished. No assertion failure was observed in those interrupted attempts.
- `git diff --check` passed.
- File comparison against the preserved Preview 49 source confirmed only `Features/Profile/ProfileEditSheet.swift` differs in the app sources.

## Preview delivery

Built from `/tmp/sideseat-profile-compact-preview50-source/ios-native`, copied from the preserved Preview 49 source with the compact profile file overlaid. This keeps the API, generated types and intention lifecycle compatible with the current backend, while the separate persistent-intention changes await production authorization.

Identity: SideSeat Preview / `app.sideseat.mobile.preview` / 1.0.0 (50), API `https://api.sideseat.de`. Installed and launched on the paired iPhone 16 Pro Max; device inventory confirms Preview 50 and ordinary SideSeat 41. No production database migration, backend deployment or TestFlight upload is included.

Evidence:
- `/tmp/sideseat-profile-compact-ui-tests.log`
- `/tmp/sideseat-profile-compact-dismiss-final.log`
- `/tmp/sideseat-profile-compact-preview50-build.log`
- `/tmp/sideseat-profile-compact-preview50-install.json`
- `/tmp/sideseat-profile-compact-preview50-launch.json`
- `/tmp/sideseat-profile-compact-preview50-apps.json`
