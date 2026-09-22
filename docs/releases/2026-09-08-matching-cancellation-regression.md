# Build 34 matching cancellation regression — 2026-09-08

**Current status: fixed and pushed as `a734117`; targeted native regression and
real local two-account UI acceptance passed.** Replacement internal TestFlight
Build 35 is uploaded, processed and available in `SideSeat Internal` under the
owner's explicit upload authorization. Phones still on Build 34 must update.
Track distribution in the
[Build 35 release record](./2026-09-08-testflight-35.md).

## Fix and two-account acceptance — 2026-09-08

The owner explicitly authorized the fix and two-account matching verification
after the initial failing regression below.

- `MutualOpportunityStore.load` preserves loaded cards on cancellation.
- The matching-session, Weekly Intent and Plan reads used together by the
  Together screen no longer render cancellation as a user-facing failure.
- Cancelled start/stop responses trigger one status read while the calling task
  is still active, without replaying the mutation. Success is based on that
  readback. If the task itself is cancelled, recovery is left to the next active
  load. Non-cancellation errors still use the existing error handling.
- Updated the existing real-API UI test to use the current two-step intention
  editor and assert absence of the raw cancellation message after each start.

Verification used a new isolated local database,
`sideseat_matching_regression_20260908` on `127.0.0.1:5433`, with all existing
migrations and the repository's test-account seed. The Next.js API ran at
`http://127.0.0.1:3015`, with Together/Meet Again enabled, a local-only signing
key and APNs/Web Push sending disabled. No production data or settings changed.
Both accounts were exercised sequentially on the dedicated simulator, not on
two physical phones. Matching, decisions and Plan writes used the real local
API and database; no matching-response fixtures or database-generated answers
were substituted for the UI actions.

| Boundary                             | Evidence                                                                                                                                                                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Native cancellation/state regression | **6 functions / 9 cases passed**, including all original failing cases, an unaccepted write and an actually cancelled task. Completed normally at `04:58:54 UTC`.                                                                                                  |
| Backend matching integration         | **8 passed, 0 failed, 0 skipped** against the new local test database.                                                                                                                                                                                             |
| Actual two-account UI flow           | **1 end-to-end test passed, 0 skipped**, 134.826 seconds, completed `05:02:10 UTC`: save both intents → start both sessions → separate private YES answers → create Plan → accept → both Calendar views show the Plan. A's matching status also survived relaunch. |
| Database readback                    | Passed at `05:03:20.018 UTC`: two distinct intent owners, same activity, one MUTUAL opportunity, two private YES answers, one source message, one ACCEPTED Plan, two ACTIVE Calendar projections belonging to the two participants.                                |

The matched window was `2026-09-08T05:45:00Z–06:15:00Z`. Both source intents
correctly became `ENDED` when the Plan was accepted, as implemented by
`finalizeAcceptedMutualOpportunityPlan`; this is successful lifecycle closure.
Both matching sessions were then stopped through their local API, preserving
the accepted Plan and Calendar history. Temporary readback/cleanup login
sessions were revoked. The locally started API, database process and dedicated
simulator were stopped after verification; the isolated database data remains
available for diagnosis. The user's existing plist edit and archives were
preserved and excluded from the fix.

The end-to-end verification guide shaped the acceptance: UI assertions were
checked against actual HTTP activity and the persisted Plan/Calendar records,
not just the absence of a banner. No remaining blocking defect was found in
this tested flow. The exact event that cancelled the owner's earlier phone
requests is still unproven; this is not TestFlight-binary or physical-device
acceptance, organic pilot evidence, or public-release approval.

Final local artifacts:

- `/tmp/SideSeatMatchingFixStores-20260908.xcresult` and
  `/tmp/sideseat-matching-fix-stores.log`
- `/tmp/SideSeatMatchingFixTwoAccountUI-20260908.xcresult` and
  `/tmp/sideseat-matching-fix-two-account-ui.log`
- `/tmp/sideseat-matching-fix-backend.log`
- `/tmp/sideseat-matching-fix-ui-readback-verified.log`
- `/tmp/sideseat-matching-fix-post-cleanup-readback.log` (matching stopped;
  accepted Plan and both active Calendar projections still present)
- `/tmp/sideseat-matching-fix-api.log` and `/tmp/sideseat-matching-fix-cleanup.log`

Harness corrections were not product failures: the preflight omitted required
Calendar query parameters and received 422; real UI Calendar requests included
them and returned 200. The first readback incorrectly expected intents still
ACTIVE after acceptance; its correction asserts the documented ENDED lifecycle
without changing any data. The successful UI test bundle contains no screenshot
attachments; a post-test simulator capture showed Springboard and is not Calendar
evidence. Earlier failed-run artifacts below remain preserved.

## Initial regression — before the fix

**Initial result: FAILED / open client defect.** Controlled cancellation reproduces the
owner's exact Chinese message: `未能完成操作。（Swift.CancellationError错误1。）`.
This is not a “no compatible person” response. Do not treat the earlier signed
Outcome acceptance as clearance of this newly reported matching defect.

### Initial scope and environment

- Reported flow: two test phones save what they want to do, then both press
  Start matching and see the error. Neither phone was used during this run.
- Source: `cfb7f2a`; tracked app source under `ios-native/SideSeat` is unchanged
  from Build 34 release source `0a59d5e`. No production code was modified.
- Backend: existing PostgreSQL integration tests against isolated
  `sideseat_layer3_test` on `127.0.0.1:5433`; temporary fixture users were cleaned
  by the tests. No production API or database test writes were made.
- Native: Development build on the dedicated iPhone 17 Pro / iOS 26.5 simulator,
  `DA2735F2-9D4B-40C2-AD18-AA88E537A40C`. The host app's API setting was verified as
  `http://127.0.0.1:3015`; the new store tests use an in-memory `APITransport`
  through the real `APIClient`, `SessionStore` and Together stores. They do not
  use the UI flags that bypass matching requests.
- This is backend integration plus simulator-native store regression, **not** a
  new two-phone end-to-end UI acceptance. The cancellation is injected at the
  transport boundary; the event that cancelled the owner's actual requests is
  still unproven. Their actual server-side matching state was not queried.

### Initial executed checks

| Check                                                                  | Observed result                                                                                                                                                                                       |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing matching-session and dual-account auto-match PostgreSQL tests | **8 passed, 0 failed, 0 skipped**; includes matching, bilateral consent, Plan and both Calendar projections.                                                                                          |
| Native start → load opportunities → fresh matching-state readback      | **1 passed**; matching active, opportunity present, one start write, no issue.                                                                                                                        |
| Start response cancelled after the test transport accepts the write    | **Failed for both `CancellationError` and `URLError(.cancelled)`**; raw Chinese system error is exposed even though a fresh readback returns active matching, version 1, without another start write. |
| Opportunity refresh cancelled after an opportunity was loaded          | **Failed for both cancellation types**; the loaded card becomes `[]` and the same raw error is exposed. Matching remains active.                                                                      |

The cancellation run contains two parameterized test functions, four failing
cases and six failed expectations. The first baseline invocation selected zero
tests because Swift Testing selectors require function signatures; it is **not
passing evidence**. The corrected selector actually executed and passed one test.

The baseline completed normally at approximately `04:40:12 UTC`. The cancellation
assertions completed at `04:40:49 UTC`, but Xcode stalled while finalizing the
run; interrupt diagnostics named the coverage-profile download/merge operation.
One bounded rerun with coverage collection disabled produced the same six failed
expectations at `04:44:41 UTC` and also stalled during finalization. Both stuck
Xcode processes were terminated (exit 143), not reported as normal completed
`xcodebuild` failures. **The raw Swift Testing logs are the cancellation evidence;
their `.xcresult` directories are incomplete and must not be used as finalized
result bundles.** The rerun does not add independent cases to the counts above.

The write-accepted/readback scenario is deliberately modeled test state, not
evidence that the owner's two production requests succeeded. It protects the
important distinction between a cancelled response and a rolled-back write.

### Confirmed broken boundary before the fix

`TogetherRootView` starts matching, then loads opportunities after a successful
start. `APIClient` correctly propagates Swift cancellation and normalizes URL
cancellation. However, `TogetherMatchingSessionStore.start` catches every error
as a displayable failure, and `MutualOpportunityStore.load` additionally clears
the loaded collection. The UI renders these issue strings directly.

Per the end-to-end verification procedure, broader acceptance stopped at this
confirmed failing boundary. No production fix, commit, push or upload was made.
The added regression tests were retained as failing evidence for the subsequent fix.
The user's pre-existing plist edit and old archives were left untouched.

### Initial evidence and rerun

Native tests live in `ios-native/SideSeatTests/DiscoverStoreTests.swift`:

- `togetherMatchingStartAndReadback()`
- `togetherCancelledStartDoesNotExposeSystemError(cancellation:)`
- `togetherCancelledOpportunityRefreshPreservesMatch(cancellation:)`

Local results and logs (temporary machine-local artifacts):

- `/tmp/SideSeatMatchingRegressionBaselineSelected-20260908.xcresult`
- `/tmp/sideseat-matching-regression-baseline-selected-20260908.log`
- `/tmp/sideseat-matching-cancellation-regression-20260908.log`
- `/tmp/sideseat-matching-cancellation-no-coverage-20260908.log`
- Incomplete cancellation artifacts: `/tmp/SideSeatMatchingCancellationRegression-20260908.xcresult`
  and `/tmp/SideSeatMatchingCancellationNoCoverage-20260908.xcresult`
- Excluded zero-test run: `/tmp/SideSeatMatchingRegressionBaseline-20260908.xcresult`

Backend rerun:

```sh
LOCAL_TEST_DB_NAME=sideseat_layer3_test node scripts/with-local-test-db.mjs npx tsx --test tests/v2/together-matching-session-postgres.test.ts tests/v2/mutual-opportunity-auto-match-postgres.test.ts
```

For native reruns, use `xcodebuild test` with `SideSeat-Development`, the dedicated
simulator above, `SIDESEAT_API_BASE_URL=http://127.0.0.1:3015`, and exact
`-only-testing:SideSeatTests/DiscoverStoreTests/<signature>` selectors. This
machine currently needs `CC=/tmp/sideseat-clang-wrapper`. Do not regenerate the
project over the unrelated plist edit or point these tests at production.

`git diff --check` and Prettier for this record and `docs/ROADMAP.md` pass. The
Build 34 release record has a pre-existing Prettier table-alignment warning,
also reproduced from `HEAD`; its unrelated historical tables were not reformatted.
The locally started PostgreSQL process and dedicated simulator were stopped after
testing. Other simulators and both physical phones were left alone.

## Next step

Update both test phones through TestFlight to `1.0.0 (35)` and verify matching
on that signed binary; upload and existing internal-group availability are complete.
Keep the unrelated plist change and old archives out of the release. The
matching regression and local two-account flow pass; Build 34 must be updated
before these fixes reach the owner/testers.
No real-user pilot or public-release gate is passed by this QA run.
