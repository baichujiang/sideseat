# Together task tabs

Updated: 2026-09-11. Owner-approved native redesign on `feat/native-ui-design-system`.
Source baseline: `877149d`. This is not a TestFlight or backend release.

## Product behavior

- Pinned task navigation: Recommendations / My intentions / Explore. Only the selected task is rendered; the old horizontal intention strip and bottom Explore preview are removed.
- Recommendations reuse the existing opportunity cards and decisions. A compact participation summary replaces the intention-management module. Legacy matching controls stay available only when the automatic flow is disabled.
- My intentions uses vertical activity cards with full activity titles, concrete dates/times or explicit flexible timing, participation status, visibility, and visible edit/pause/resume actions. End requires confirmation; extension stays in the overflow menu.
- The intention count includes only currently participating, unexpired intentions, including explicit legacy sessions. ACTIVE alone is not sufficient. Paused, unpublished, expired, ended and feature-unavailable states remain distinct.
- First use with no intentions/opportunities opens My intentions. Existing supply or opportunities opens Recommendations. Refresh never overrides an explicit tab selection; saving returns to My intentions and new intentions insert at the top.
- Explore is a standalone task, not an extra home feed. Its feature gate is unchanged. Disabled, empty and failed loads have different presentations.
- “I want to do this too” opens a draft containing only the activity choice. It does not express interest, open chat, copy another person's note/course enrollment/exact timing, or promise a match with that person. Cancel returns to Explore; publication remains explicit.
- New intentions default to Explore visibility OFF. When Explore is disabled, the editor hides that control and omits the additive `exploreVisible` request field for compatibility with the currently deployed API.
- Chinese, English and German copy are included. Normal text uses the native segmented picker; accessibility text uses full-size labeled selection buttons. Controls have explicit touch regions.

## Scope and evidence

No matching rules, production data, database migrations or server feature flags were changed. Offline fixture lifecycle support is DEBUG-only and requires `--ui-testing-intent-card-states`.

The preview is the separate `app.sideseat.mobile.preview` app, with local build-number override `42` and a temporary Info.plist outside the repository. The tracked release build number and the ordinary `app.sideseat.mobile` app are not changed by this task.

## Verification

- Simulator model/store/Swift Testing checks: 337 passed in 60 suites, plus the XCTest checks in SideSeatTests. New tests cover task order/default selection and genuine participation status.
- Task UI checks cover separation, pause/resume/edit, Explore draft creation/cancel, save-to-My-intentions, first use, disabled/empty Explore, English dark mode, German largest Dynamic Type and Plus search.
- Existing editor light/dark and recommendation empty-state checks passed. Accessibility viewport selectors were updated for pinned task navigation.
- Failed-save regression now makes a second actual touch/release against a fail-once offline fixture, verifying successful retry instead of relying on a non-hittable SwiftUI accessibility wrapper around the UIKit pan surface. The production gesture implementation was left unchanged.
- Final consolidated acceptance: **371 passed, 0 failed, 0 skipped**, including 8 focused UI tests; `TEST SUCCEEDED`. Bundle: `/tmp/SideSeatTogetherTabsAcceptance-20260911.xcresult`; log: `/tmp/sideseat-together-tabs-acceptance.log`. This supersedes the earlier assertion failures. Existing light/dark editor and recommendation empty-state checks also passed in the preceding regression run.

## Phone preview delivery

Signed Development build `1.0.0 (42)` was validated, installed and launched on the paired owner iPhone at 2026-09-11 23:42 Europe/Berlin. Device app metadata confirmed `SideSeat Preview` / `app.sideseat.mobile.preview` / build `42`. The ordinary SideSeat bundle stayed at `1.0.0 (41)`.

The Preview uses the existing production API, not a new staging server. Explore's existing server feature gate is preserved; when disabled, the new Explore tab explicitly says it is not yet available. No mock launch arguments were used on the phone, and no QA data was modified by this redesign.

Evidence: `/tmp/sideseat-together-preview42-install-build.log`, `/tmp/sideseat-together-preview42-install.log`. Screenshots in `docs/visual-qa/together-tabs-*.png` were inspected locally; these use offline simulator fixtures and are not proof of a production matching journey.
