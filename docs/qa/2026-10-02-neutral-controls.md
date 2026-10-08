# Neutral controls and restrained Rose emphasis

The owner requested fewer pink buttons, especially avoiding red text on pale pink fills. Routine navigation, bookmarks, filters, selection chips, menus, calendar utilities, profile editing and sharing controls now use adaptive neutral text and surfaces. Selected controls retain their icon, checkmark, border and accessibility state. Say hello keeps an opt-in deep-Rose fill with white text in both appearances. Brand artwork, user-selected profile decoration and semantic status colors remain separate from routine controls.

`ControlSelection` centralizes the neutral selected fill/border. `BrandAction` pairs the rare emphasized fill with its white foreground; its calculated contrast is 7.68:1. The original Rose brand asset is unchanged. The design contract and README record the new owner decision.

## Verification

Development builds succeeded on iPhone 17 Pro / iOS 26.5 Simulator. All 31 theme/contrast checks passed, including neutral selected text and the emphasized action pair at a minimum 7:1.

Six distinct UI flows passed across the initial run and the focused rerun:

- Auth and the five main destinations in the light appearance.
- Bookmarking retains the recommendation page and scroll position.
- Bookmark/contact controls with German accessibility5 text in dark mode.
- Message context actions at accessibility5, including readable neutral utility actions and semantic deletion.
- Together category headers and controls in light/dark appearances.
- Activity selection and intention publishing in light/dark appearances.

The initial run passed 36 checks and failed one UI flow because its old weekly-intent header identifier is merged into the existing editable header button. The captured accessibility hierarchy confirmed `weekly-intent-edit-ui-intent-coffee` exposes that header. Updated only that locator, retained all geometry assertions, and reran the flow successfully. The final build also includes the explicit paired foreground for the sharing-preview retry action.

Visually inspected recommendation controls, both intention-editor appearances, the calendar, the message menu and the largest-text controls. `git diff --check` passed. All 27 touched Swift source/test files match the final frozen build snapshot.

Evidence: [screenshots and test summaries](evidence/2026-10-02-neutral-controls/). Original result bundles are `/tmp/sideseat-neutral-controls-20261002/controls.xcresult` and `/tmp/sideseat-neutral-controls-20261002/final-controls.xcresult`.

This is simulator verification. This task did not install a phone build, upload TestFlight, deploy an API or modify live user data.
