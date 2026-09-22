# Intention single-save flow — Preview 45

Date: 2026-09-12. Baseline `ea2b164` on `feat/native-ui-design-system`.

## Cause and correction

The owner reported the redundant “确认并开始寻找” button in My intentions.
`WeeklyIntentCard` rendered “Review and start” for `.unpublished`, but its callback was the same `onEdit` used by the adjacent Edit action.
Normal creation/editing already sends `automaticMatching=true` when automatic finding is enabled; the backend runs `autoMatchAfterMutation` after committing. A second start action is not needed for a published intention.

- Removed the duplicate button and its unused localized title.
- Editor copy now states that saving starts automatic finding; paused edits explicitly remain paused.
- Retained visible Edit and Pause/Resume controls and truthful unpublished/expired/unavailable states.
- Old saved, non-participating intentions are not silently enrolled. Their normal edit/save can enroll them; merely opening My intentions cannot.
- Explore visibility remains independent and opt-in. No matching rule, backend deployment, flag or production-data write was performed.

## Verification and delivery

- Simulator acceptance: 370 passed, 0 failed, 0 skipped (341 Swift Testing, 26 XCTest, 3 UI tests).
- The added UI regression covers the missing duplicate action, old-record state, single edit/save starting finding, paused editing retaining pause and one-action resume. The new-intention test now requires the exact Finding company status after saving.
- UI tests use explicit offline fixtures, not production-account evidence. A production QA read attempt was blocked by the execution check and was not retried through another route; no current account-state conclusion relies on it.
- Inspected `docs/visual-qa/intentions-no-extra-confirmation.png` locally. Localization plists and `git diff --check` passed.
- Signed `SideSeat Preview` / `app.sideseat.mobile.preview` / 1.0.0 (45) was installed and launched on the paired iPhone at 10:45 Europe/Berlin. Ordinary SideSeat stayed on 1.0.0 (41).
- Name/build use an external temporary Info.plist and build overrides. Tracked release identity and unrelated original-workspace edits were untouched.
- Evidence: `/tmp/SideSeatIntentSingleSave-20260912.xcresult`, `/tmp/sideseat-intent-single-save-tests.log`, `/tmp/sideseat-intent-single-save-summary.json`, `/tmp/sideseat-intent-single-save-preview45-build.log`, `/tmp/sideseat-intent-single-save-preview45-install.log`.
