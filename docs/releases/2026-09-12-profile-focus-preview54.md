# Profile focus refinement — Preview 54

Date: 2026-09-12. User requested removal of the pink line on the left of focused profile inputs, keeping the subtle focus background. Preview updates remain authorized; do not launch the phone app automatically.

## Change and source

Removed the five-line leading-marker overlay from `Features/Profile/ProfileEditSheet.swift`. The existing Rose wash, native caret, field order and input/save logic remain intact. This is the only changed app file compared with Preview 53's full source manifest. Source: `891b627` plus the current working tree. No backend or migration changes accompany this update.

## Verification

- Existing nickname/contact save simulator UI test passed: `/tmp/sideseat-profile-focus-ui-test.log`.
- Focused-input screenshot inspected: `docs/visual-qa/profile-editor-focus-without-marker.png`; the left marker is absent and the background wash is present.
- Signed Development build and strict code-signature verification passed: `/tmp/sideseat-profile-focus-preview54-build.log`.
- App-source hashes matched before/after build; manifest: `/tmp/sideseat-profile-focus-preview54/source-manifest.json`.
- `git diff --check` passed.

## Delivery

Installed SideSeat Preview / `app.sideseat.mobile.preview` / 1.0.0 (54) on the paired iPhone 16 Pro Max. API: `https://api.sideseat.de`. Post-install inventory confirms Preview 54 and ordinary SideSeat 41. No app launch command was issued; physical-device verification covers installation identity only. No TestFlight/App Store upload or production dSYM upload was performed.

Artifact: `/tmp/sideseat-profile-focus-preview54/SideSeat.app`.

Receipts:
- `/tmp/sideseat-profile-focus-preview54/build-identity.json`
- `/tmp/sideseat-profile-focus-preview54-install.json`
- `/tmp/sideseat-profile-focus-preview54-apps.json`
