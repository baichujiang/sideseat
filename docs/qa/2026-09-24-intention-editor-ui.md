# Intention editor UI refinement — 2026-09-24

## Changes

The existing one-page editor still contains Activity, What exactly?, and Time. The activity menu is shorter, the description has a larger writing area, section titles have a consistent hierarchy, and section spacing is explicit. Timing choices appear side by side at ordinary text sizes and stack at accessibility sizes, with one concise explanation beneath them.

Input-length feedback now appears immediately above the pinned action button. Chinese action labels consistently use “意愿”. Existing selection colors, typography, backgrounds and control radii are reused; submission mappings and timing behavior are unchanged by this refinement.

## Verification

Development build-for-testing passed. English, German and Chinese localization files pass `plutil -lint`.

Tests run on the SideSeat UX QA iPhone 17 Pro simulator, iOS 26.5, using ephemeral credentials, local intent fixtures and the loopback API override. These journeys verify the native UI and fixture save behavior, not live backend writes.

- `/tmp/sideseat-intention-ui-20260924.xcresult`: 3 passed, 0 failed, 0 skipped. Chinese light/dark category selection and publishing, Chinese/English flexible/exact timing and draft retention, and German maximum accessibility text with keyboard and length-error visibility all passed.
- Visual inspection found that the native Form section clipped the outside corners of the timing controls. Added section-row insets so each control's border remains inside the native rounded container.
- `/tmp/sideseat-intention-ui-20260924-final.xcresult`: 3 passed, 0 failed, 0 skipped after rebuilding with the inset correction. All three affected journeys passed again. Final screenshot inspection confirms complete control borders in Chinese light/dark, English dark, and German maximum accessibility text. Length guidance and the focused input remain above the keyboard and action button.

`git diff --check` passed. Final screenshots are in ignored `docs/visual-qa/`: `compact-intention-empty-light.png`, `compact-intention-filled-light.png`, `compact-intention-filled-dark.png`, `flexible-undecided-en-dark.png`, `compact-intention-de-large-type.png`, and `flow-intent-limit-de-large-type-keyboard.png`.

## Keyboard action placement follow-up

On entering the description field, the bottom action dock is replaced by a top-right navigation action, using the shorter “发布” / “Publish” / “Aktivieren” label. Editing an existing intention uses the corresponding Save action. When input focus ends, the action returns to the bottom dock. Both placements use the same validation and submission path, and only one action exists at a time. Input-length guidance remains above the keyboard and blends with the form background while typing.

- `/tmp/sideseat-intention-toolbar-20260924.xcresult`: 3 passed, 1 failed, 0 skipped. Chinese light/dark toolbar placement, unique action, empty-input validation, restoration of the bottom action and direct keyboard-visible publishing passed. German maximum accessibility text and the Coffee create/edit/refresh/pause/resume/end lifecycle passed.
- The length/category/timing journey passed its input validation assertions but stopped in the test scrolling helper: it enumerated a transient scroll view after dismissing the keyboard, even though the editor Form was already identified. The helper now uses that Form directly and only searches other scroll views outside the editor. No validation assertions were removed. The focused error background was also adjusted after screenshot inspection showed a small isolated white rectangle.
- `/tmp/sideseat-intention-toolbar-20260924-final.xcresult`: 2 passed, 0 failed, 0 skipped after rebuilding. The maximum-accessibility keyboard/error/save journey passed again, and the complete text-limit/category/timing/draft-retention/publish journey passed. Screenshot inspection confirms the error background blends with the form. All four selected UI journeys ultimately passed across these two runs.

Build-for-testing and `git diff --check` passed. Keyboard-visible Chinese previews are `docs/visual-qa/intention-toolbar-publish-keyboard-light.png` and `docs/visual-qa/intention-toolbar-publish-keyboard-dark.png`. Tests use the same local-fixture, ephemeral-credential environment described above.

The later [optional-details refinement](2026-09-24-optional-intention-details.md) makes the description optional and reduces it to one row under Activity. It supersedes the earlier required-description layout while preserving the keyboard action placement.
