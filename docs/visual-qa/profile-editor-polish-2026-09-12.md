# Profile editor visual polish — 2026-09-12

Local UI revision; no phone install/launch, signing, Preview release or backend deployment.

## Result

The editor retains the compact left-label/right-value layout. It now uses grouped cards with inset section headers, semantic neutral colors and fine separators instead of a gray well around every field. The header displays the existing avatar and account handle. Native menu/picker selection uses a consistent trailing chevron; the semester control occupies only the width it needs. Empty optional fields show the existing localized Optional prompt.

Focused text rows receive a restrained Rose wash and a leading marker, with animation disabled for Reduce Motion. Accessibility text sizes stack labels and values. Decorative header icons retain fixed sizes so they cannot overlap larger text. Shared profile/privacy header and section implementations, draft normalization, field validation, save, school-change confirmation and dismissal logic remain unchanged.

## Verification

- Simulator Development compilation succeeded with signing disabled.
- Three existing UI tests passed together: nickname/contact save, unsaved-edit protection and school-change confirmation/archive navigation. Final ordinary-size run: `/tmp/sideseat-profile-polish-dark-ui-tests.log`, 3 tests, 0 failures.
- The first run found that the old tests' center taps inserted their suffix before right-aligned text. Tests now tap the end of the value to explicitly append, retaining their original saved-value assertions.
- Ordinary Light and Dark screenshots and focused-row appearance were inspected. The first largest-text screenshot exposed a decorative icon overflowing its badge; icon sizing was corrected. The final largest-text screenshot has no icon/title overlap and the existing school-change flow passed again: `/tmp/sideseat-profile-polish-accessibility-final.log`.
- `git diff --check` passed. No production/API changes accompany this local UI revision.

## Screenshots

- [Light](profile-editor-polish-light.png)
- [Dark](profile-editor-polish-dark.png)
- [Focused input](profile-editor-polish-focus.png)
- [Largest accessibility text, final](profile-editor-polish-accessibility.png)

Ordinary-size captures precede the final decorative-icon size correction; all field geometry is unchanged by that correction. The accessibility screenshot and final test use the completed source.

## Field-order follow-up

User approved identity-first grouping. Basics now contains nickname → gender → tagline. School, student status and degree move together into Study, before major and semester/graduation year. Contact ordering stays the same. Row dividers follow the new grouping; field bindings and save/confirmation logic are unchanged.

The reordered ordinary-size simulator screenshot was inspected: [current field order](profile-editor-reordered-light.png). The two existing save and school-change UI tests passed with 0 failures; log: `/tmp/sideseat-profile-reorder-ui-tests.log`. No phone install/launch was performed.

## Focus refinement

The owner requested removal of the left Rose focus marker. Focused inputs now retain only the subtle background wash and their native caret. The simulator screenshot was inspected: [focus without marker](profile-editor-focus-without-marker.png). The existing nickname/contact save UI test passed with the updated source: `/tmp/sideseat-profile-focus-ui-test.log`. Earlier screenshots above preserve the prior design.

## Input interaction refinement

Text inputs now keep a stable leading alignment within the right-hand input column. Labels and row whitespace activate their field. One focus state coordinates nickname, tagline, major and contact handles. Single-line Return advances to the next input (Done at the last); the tagline retains multiline Return. Native keyboard previous/next and Done controls allow continuous entry and dismissal. Only the focus background animates.

The new interaction regression test first reproduced the defect: tapping the nickname label did not show the keyboard (`/tmp/sideseat-profile-input-repro.log`). After the fix, three UI tests passed together: continuous keyboard navigation/multiline entry/save, ordinary center-tap nickname/contact save, and unsaved-edit protection (`/tmp/sideseat-profile-input-fixed-tests.log`). Tests no longer need to tap the far trailing edge of right-aligned values. The new regression also verifies edits reach the intended nickname, major, WeChat and WhatsApp fields, including returning to a previous field.

[Multiline input with keyboard navigation](profile-editor-input-keyboard.png) was captured from the simulator and visually inspected: the focused input and native caret remain visible above the keyboard and Save action, with no leading marker. Capture run passed: `/tmp/sideseat-profile-input-capture.log`. This task did not open or test the phone app.
