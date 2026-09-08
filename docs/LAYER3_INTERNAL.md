# Layer 3 — internal implementation and acceptance

**Status:** Implemented; local backend/HTTP and simulator acceptance passed on
2026-09-08. The owner-authorized migration/backend release is deployed, Layer 3
is enabled and TestFlight Build 34 is available internally. Signed two-account
private/repeat-to-Calendar acceptance passed on Baichu's explicitly available
iPhone on 2026-09-08; this is not public-release approval.

**Owner decision:** 2026-09-08. Build the complete repeat flow and perform
internal acceptance without waiting for real-user pilot samples. Do not claim
the Layer 2 product-data Gate passed or substitute QA data for organic usage.

## Contract

- After the viewer's own OCCURRED answer on an ended accepted Plan, offer a
  private Meet Again answer: YES, NO or WITHDRAWN. Only the viewer's value is
  returned. No counterpart answer, permission count, waiting state or permission
  notification is exposed.
- Derive repeat eligibility from the pair's latest ended accepted Plan: it
  must have a Shared Encounter and both permissions must be YES. Older consent
  must not override an unanswered or negative later encounter.
- Both participants need newly created ACTIVE compatible Intents after that
  Plan ended and explicit live matching sessions. Repeat does not read Calendar,
  grant generic contact rights, or reopen an old Opportunity or Plan.
- The repeat uses the existing bounded matcher without preferential ranking.
  Bilateral permission allows a completed pair to bypass the first-encounter
  cooldown, but does not bypass unresolved pair/Intent occupation or safety.
- A new Opportunity requires new private decisions and a new immutable source
  snapshot; mutual activation may reuse the existing canonical Conversation.
  Its new Plan must be accepted and create two new Calendar projections.
- Permission withdrawal or changing the viewer's Outcome away from OCCURRED
  invalidates pending repeats from that source. Existing mutually authorized
  coordination is not retroactively canceled. Returning to OCCURRED requires
  fresh permission after an Outcome-based withdrawal.
- Block and moderation remain hard stops. Unblock does not restore old access.
- Only a second independently bilaterally OCCURRED Plan is a repeat encounter.

## Release boundary

`V2_MEET_AGAIN_ENABLED` defaults off and obeys the global kill switch. Automated
mutation tests enable it only against localhost PostgreSQL. Production migration,
deployment, TestFlight upload and public release require separate authorization.
The owner subsequently authorized the migration/backend and internal Build 34
release; these steps completed on 2026-09-08, including internal activation.
See [Build 34 release evidence](./releases/2026-09-08-testflight-34.md) for backup,
deployment, signature, Apple processing and production HTTP smoke evidence.
The initial production HTTP smoke requested no Outcome or permission mutations.
The subsequent owner-authorized signed-device session used only existing QA
accounts for synthetic Outcome/permission answers and the new repeat Plan.
Build 33 already submitted to Apple does not contain Layer 3; no Build 34
external/public release was authorized or submitted.

Disabling the flag stops creation/acceptance of repeat opportunities, including
fallback to first-encounter matching for a pair with an ended accepted Plan.
Existing YES permission remains withdrawable. First-encounter matching for new
pairs continues under its existing flags.

Deploy the additive `20260908010000_meet_again_repeat` migration **before** the
new backend: Plan reads and Outcome edits use the new table even while the
feature is off. Keep the flag off until the intended environment is migrated
and the new backend/native version is ready. A rollback disables the flag;
do not drop consent/history tables or manufacture Outcome answers.

## Acceptance

Completed by `2026-09-08T02:18:18Z`, using isolated `sideseat_layer3_test`
PostgreSQL on localhost:5433 and the local Next.js server on localhost:3015.
No production users or Outcome rows were changed. Fixture passage of time and
answers are synthetic test setup, never organic pilot evidence.

| Check | Result | Evidence |
| --- | --- | --- |
| Layer 3 database and HTTP tests | 4 passed, 0 skipped | `tests/v2/meet-again-repeat-postgres.test.ts` |
| Existing Plan/matching/session PostgreSQL regressions | 21 passed | `mutual-opportunity-auto-match-postgres`, `legacy-plan-commitment-compat-postgres`, `mutual-opportunity-plan-closure-postgres`, `together-matching-session-postgres` under `tests/v2` |
| Plan, matching, pilot and OpenAPI contracts | 42 passed | `/tmp/sideseat-layer3-contract-tests-final.log` |
| Native private state | 2 passed | `MeetAgainPrivateStateTests` |
| Native Light/Dark UI | 2 passed | `testMeetAgainPrivatePermissionLightAndDark`, `testPlanFlowComposerAndOutcomeLightAndDark` |
| TypeScript, changed-file ESLint, Prisma validate, three localization files, whitespace | Passed | Final local checks |
| OpenAPI generation and route coverage | Passed, 170 implemented operations | Generated Swift client/types and `npm run check:openapi:v1` |

The database test executes real domain services through both private permissions,
fresh Intents/sessions, new bilateral Opportunity decisions, a fresh Context/Plan,
two Calendar projections and a second bilaterally OCCURRED Shared Encounter.
It verifies outsider rejection, unilateral privacy, new-Intent eligibility,
feature-off behavior, withdrawal, Outcome correction, Block and latest-encounter
consent precedence. The HTTP test additionally checks authentication, private
DTOs, idempotent replay/conflict and withdrawal through the actual routes.

The dedicated simulator was `DA2735F2-9D4B-40C2-AD18-AA88E537A40C`, iPhone 17 Pro,
iOS 26.5. The owner's phone and other simulators were not used. Native UI tests
use local DEBUG fixtures, separately from the real local backend tests; this
is **not** a signed TestFlight-to-production end-to-end acceptance run.
The native result is `/tmp/SideSeatLayer3InternalRetry.xcresult`; 12 screenshots
were exported to `/tmp/sideseat-layer3-native-evidence`. Eight key screenshots
were visually inspected: private permission before/after saving, Plan editor
and Outcome controls in both appearances. New product UI text is Chinese in
the Chinese run; English Plan titles/locations are fixture user content.

Concrete issues fixed during verification: a Swift localization parameter type,
a duplicate translation key and feature-off fallback for historical pairs.
Two existing source-contract assertions were aligned with the already-shipped
shared button components. The historical fixture transaction was corrected to
respect the existing deferred Plan commitment constraint.

### Signed TestFlight acceptance

On 2026-09-08 the owner explicitly made Baichu's iPhone available. Updated the
installed app from Build 33 to `1.0.0 (34)` through TestFlight and independently
verified its version. On an iPhone 16 Pro Max / iOS 26.0.1, both QA accounts
completed private Outcome and Meet Again answers, withdrawal/NO/YES editing,
relaunch persistence, fresh Intents and explicit matching sessions, new bilateral
Opportunity decisions, a new source-prefilled Plan, receiver acceptance and both
Calendar views. The core continuation passed at `2026-09-08T03:13:40Z`.

Scoped read-only production snapshots verified unilateral privacy, Shared
Encounter creation only after both source answers were OCCURRED, the new immutable
repeat source, and distinct new Calendar entries. One XCTest title-entry assertion
failed because the harness left a prefilled suffix; acceptance continued from the
actual saved QA Plan without duplicate writes. See the
[Build 34 record](./releases/2026-09-08-testflight-34.md) for successful result
bundles, the retained failed-run log and limitations. This follows the complete
device → API → persisted data → second-account UI path, not simulator fixtures.

The new future Plan's Outcome remains unanswered, so this session does not claim
a second production Shared Encounter. QA is excluded from organic pilot metrics;
the product-data Gate, APNs/device matrix and public monitoring/recovery
requirements remain independent. No external/public submission was made.

### Reproduce the backend checks

Run `npm run db:start`, then apply migrations only to the isolated database:

```sh
LOCAL_TEST_DB_NAME=sideseat_layer3_test node scripts/with-local-test-db.mjs npx prisma migrate deploy
```

For the optional HTTP case, start the local server in another terminal with
the same explicit **local-test-only** signing key, never a production secret:

```sh
LOCAL_TEST_DB_NAME=sideseat_layer3_test V2_MEET_AGAIN_ENABLED=1 ACCESS_TOKEN_SECRET=sideseat-layer3-local-only-http-test-secret node scripts/with-local-test-db.mjs npx next dev --hostname 127.0.0.1 --port 3015
```

Run all four Layer 3 tests, including HTTP:

```sh
LOCAL_TEST_DB_NAME=sideseat_layer3_test ACCESS_TOKEN_SECRET=sideseat-layer3-local-only-http-test-secret LAYER3_LOCAL_HTTP_URL=http://127.0.0.1:3015 node scripts/with-local-test-db.mjs npx tsx --test tests/v2/meet-again-repeat-postgres.test.ts
```

Without `LAYER3_LOCAL_HTTP_URL`, the HTTP case is explicitly skipped. The other
two database cases also refuse non-local database targets.

## Pilot rule synchronization

The existing `Layer2 非 QA Gate 周度快照` automation was updated in place on
2026-09-08, retaining Monday 12:38 Europe/Berlin and the earliest formal
snapshot of `2026-09-14T10:37:35Z`. It still collects only read-only organic
aggregates and requires two qualifying snapshots at least seven days apart.
It now reports the product-data Gate independently and must not re-block
Layer 3 development or authorize any release. No new snapshot was collected.

## Next step

The implementation/release commits are pushed; the additive migration, backend,
internal Build 34, Layer 3 activation and signed private/repeat-to-Calendar
acceptance are complete. The owner subsequently requested completing the actual
repeat Plan's Outcome as well. Next, resume the staged device/checker phases in
the Build 34 record after its unchanged `2026-09-08T04:15:00Z` end time. Pre-end
device/DTO checks passed; after-end phases are compiled but not executed. A new
one-off heartbeat could not be added because this task already has the weekly
pilot; that automation has not been changed. Preserve the scoped acceptance
record and push when authorized after recording real results. The subsequent
distribution step is owner-approved Build 34 external
TestFlight assignment/Beta review, not automatic public publication. Complete
remaining public-release monitoring/recovery and device requirements separately.
Do not relabel Build 33 as containing Layer 3. Continue truthful non-QA usage in
parallel; its product-data Gate is still open and QA is not qualifying evidence.
