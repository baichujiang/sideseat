# Intention activity tiles — 2026-09-24

## Layout

The activity menu is replaced by six compact selection tiles at the top of the editor, in two rows of three at normal text sizes. The tiles reuse the existing `ActivityArtwork-*` illustrations at 28 points. Labels, borders and a checkmark make the current selection explicit. The optional description appears underneath in the same card with a multiline writing area, followed by timing.

At accessibility text sizes, the six choices use a single column with their original small illustrations and full-width labels. The selected activity remains exposed through the button's accessibility selected trait. Changing a tile preserves the description and ends text focus. The previous top-right publishing behavior while typing, optional details and default undecided time remain in place.

## Verification environment

Development build-for-testing and `git diff --check` passed. UI tests use the SideSeat UX QA iPhone 17 Pro simulator (iOS 26.5), ephemeral credentials, local intent fixtures and a loopback-only API override. These journeys test native UI and local persistence, not live backend writes.

Updated the existing category helper to select the visible activity buttons directly. Existing journeys check six-category empty-detail creation and editing, Chinese light/dark layout and publishing, and German maximum accessibility text with keyboard/error visibility. The normal-size layout check asserts six visible buttons arranged in two rows of three above the description.

## Results

`/tmp/sideseat-intention-activity-tiles-20260924.xcresult`: 3 passed, 0 failed, 0 skipped.

- `testAllActivitiesPublishWithoutDetails`: all six categories publish without details and retain their selection when reopened; existing details can also be cleared for Coffee, Study and Sports.
- `testTogetherFlowEditorLightAndDark`: Chinese light/dark layout, selection, optional description and publishing from the navigation bar while typing.
- `testActivityPickerAtLargestDynamicType`: German maximum accessibility text, activity selection, keyboard and error visibility.

Visually inspected `docs/visual-qa/tiled-intention-filled-light.png`, `tiled-intention-filled-dark.png`, `tiled-intention-de-large-type.png` and `minimal-intention-coffee.png`. The original illustrations remain clear at the smaller size, selection is visible in both appearances, and the description follows the activity choices.

## Composer detail refinement

Replaced the native Form separator below the activity choices with a divider inside the description row. It now has equal 16-point horizontal insets and aligns with the description text. The visible Chinese prompt is “详细说说你想做什么…”, with matching English and German prompts. Details remain optional; accessibility text sizes retain the short optional prompt.

The first verification run (`/tmp/sideseat-intention-composer-polish-20260924.xcresult`) passed the Chinese light/dark journey and exposed a large-text scrolling regression: the nested input identity no longer scrolled the whole Form row into view when the length warning appeared. Moving the scrolling identity to the containing row fixed the positioning; the refreshed large-text screenshot shows the input above the warning and keyboard.

Final verification: `/tmp/sideseat-intention-composer-polish-20260924-final.xcresult` — 2 passed, 0 failed, 0 skipped (Chinese light/dark and German largest accessibility size). Build-for-testing, all three localization-file syntax checks and `git diff --check` passed. Refreshed empty-state screenshots show the symmetric divider and new prompt in both appearances.
