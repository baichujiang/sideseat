# Preview 101 — single-sheet plan creation

Dated physical-device evidence: 2026-10-15, Europe/Berlin. The owner reported
that Plans → + opened two pages in succession on the iPhone 14 Plus.

## Cause and correction

Preview 100 presented `TimePollSheet`'s list, whose task immediately presented
another sheet containing the creation form. Cancel dismissed only the second
sheet. Earlier Plans/Calendar QA did not protect the expected one-step return.

Preview 101 makes the creation form the root of the existing sheet. Its owner
shows the created detail in place and controls dismissal. The explicitly opened
Messages plan list retains its own create/cancel behavior. API requests,
confirmation requirements and Calendar projection rules are unchanged.

## Results on iPhone 14 Plus / iOS 26.6.1

Target UDID: `00008110-001A69110CC1401E`; bundle: `app.sideseat.mobile.preview`.

| Case | Result |
| --- | --- |
| Preview 100 baseline: create → one Cancel → Plans | **Failed**, 20.789 s; the intermediate list remained |
| Preview 101: create/cancel three times | **Passed**, 24.610 s; each Cancel returns directly to Plans |
| Both timing modes, downward dismissal and reopening | **Passed**, 26.038 s |
| Messages → plan list → create → Cancel → list → Done → Messages | **Passed**, 16.169 s |
| Actual saving: Plans collection/direct-time creation, Done to Plans, then Messages collection creation to detail | **Passed**, 46.057 s |

The three permanent presentation regressions use an authenticated UI shell,
ephemeral credentials and an unreachable local API; they perform no business
writes. The separate save check used that shell with a real token for one fresh
disposable account and the production API. It did not test native login or
multi-person Calendar confirmation again. Real saved details displayed the
entered titles, and the two Plans modes returned directly to Plans via Done.

All disposable plans and the account were removed. The final plan list was
empty and the deleted-account token returned 401. An initial cleanup attempt
removed the latest collection plan before encountering a missing list field;
cleanup resumed using the invitation version from detail and completed.
Both temporary UI runners were uninstalled. Preview 101 was returned to normal
empty-argument launch, with its running process verified. Owner Keychain
credentials were not used or changed.

## Evidence

- [Machine-readable results](./evidence/2026-10-15-preview101-plan-creation/results.json).
- [Preview 100 stacked sheets](./evidence/2026-10-15-preview101-plan-creation/before-two-sheets.png).
- [Preview 101 single creation sheet](./evidence/2026-10-15-preview101-plan-creation/after-one-sheet.png).
- Permanent tests: `ios-native/SideSeatUITests/PlanCreationPresentationUITests.swift`.
- Local raw presentation results: `/tmp/sideseat-plan-presentation-20261015/`.
  Raw live-account result bundles and credential-bearing test configuration were
  removed after exporting the safe result summary and screenshots.

This is focused verification of the reported presentation regression and its
adjacent save paths, not a full application regression or VoiceOver audit.
