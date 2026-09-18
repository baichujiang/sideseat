# Profile input interaction — Preview 55

Date: 2026-09-12. The owner reported that editable profile fields still felt awkward. This task fixes input interaction and continues the authorized Preview update workflow without opening the phone app for testing.

## Change

- Editable text remains leading-aligned inside the right-hand input column. The compact label/input layout and field order remain in place.
- Tapping the label or row whitespace focuses the corresponding text input.
- A shared focus state supports single-line Next/Done and a native keyboard toolbar with previous/next field and Done. The tagline keeps Return for new lines.
- Focus animation applies only to the subtle Rose wash, so text/layout do not inherit the transition. The leading pink marker stays removed.
- Keyboard navigation labels are localized in Chinese, German and English.

## Verification

The new main-path regression first failed against the previous implementation because tapping the nickname label did not open the keyboard (`/tmp/sideseat-profile-input-repro.log`). After the fix, three UI tests passed together with no failures: continuous keyboard navigation and saving the correct field values, ordinary center-tap nickname/contact editing, and unsaved-edit protection (`/tmp/sideseat-profile-input-fixed-tests.log`). The screenshot capture run also passed (`/tmp/sideseat-profile-input-capture.log`). The multiline keyboard screenshot was visually inspected; see [visual QA](../visual-qa/profile-editor-polish-2026-09-12.md). Localization syntax checks passed for all three languages.

## Build identity

The concurrently active Explore task built Preview 55 from the shared working tree after this input fix. Its signed binary contains the new ProfileEditInputField and all three keyboard control identifiers. The app passed strict code-signature verification and targets `app.sideseat.mobile.preview`, display name SideSeat Preview, 1.0.0 (55), API `https://api.sideseat.de`. Build log: `/tmp/sideseat-explore-interest-preview55-build.log`.

Profile source SHA-256: `c1705b88967f619cf3da63e6be9484d8a2a06ae4c8d19c7be0b5c48f9e855260`. Preserved app, post-build source copy, manifest and build identity: `/tmp/sideseat-profile-input-preview55/`. This is a post-build source snapshot, not a pre-build source manifest. The binary hash is recorded separately in `build-identity.json`.

The combined Preview includes the Explore task's changes; this task did not deploy or migrate the backend. Installation is coordinated through that release so it retains both sets of changes.

## Delivery

The combined Preview 55 was installed by the Explore release task. A fresh device inventory in this task confirms SideSeat Preview 1.0.0 (55), with ordinary SideSeat remaining at build 41. Receipt: `/tmp/sideseat-profile-input-preview55-apps.json`. The preserved executable hash still matches the built Preview 55 artifact. No phone launch or physical-device interaction test was issued by this task; interaction verification ran in the simulator.
