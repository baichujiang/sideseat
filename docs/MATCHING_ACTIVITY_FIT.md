# Activity fit and broader opportunities

**Owner decision:** 2026-09-08 — improve matching coverage and show the degree of
fit instead of only delivering extremely compatible opportunities.

**Status:** Implemented locally; native, three-language visual and real-API
two-account acceptance passed.
Owner authorized commit/push and a new internal TestFlight build on 2026-09-08.
Release preparation is in progress; not deployed or included in TestFlight Build 35.
Related matching must remain disabled until both test phones confirm their update.

## Eligibility before score

Preserve verified/onboarded same-school users, at least one shared language,
two explicit active matching sessions, active intents, at least 30 minutes of
actionable overlapping declared availability, course scope, Block/moderation,
pair cooldown, repeat consent and one unresolved opportunity per intent.
Calendar contents and precise locations are not matching inputs. Location and
the final concrete activity remain Plan coordination, not inferred agreement.

Coffee, Food, Explore and Events no longer require identical text when related
matching is enabled. Same-category different descriptions become an opportunity
to agree on details, not a claim that both already want the same exact thing.
Sports keeps concrete-activity compatibility. Different Study goals still
require both users to allow parallel study; explicit course scope is respected.

## Explainable policy `ACTIVITY_FIT_V1`

| Component       | Points   | Rule                                                                                             |
| --------------- | -------- | ------------------------------------------------------------------------------------------------ |
| Activity        | up to 50 | Exact normalized activity: 50; mutually allowed parallel study: 35; related general category: 25 |
| Shared time     | up to 30 | One point per two whole minutes of the chosen overlap, capped at 60 minutes / 30 points          |
| Common language | 10       | The eligibility requirement is satisfied; no fluency/person ranking                              |
| Same school     | 10       | The eligibility requirement is satisfied                                                         |

Example: “喝咖啡” and “咖啡聊聊” with 30 shared minutes yields **60/100** and
is deliverable. Exact activity with 60 shared minutes yields **100/100**.
These are declared heuristic points, not calibrated percentages or the chance
of a successful meeting. A score does not rate either person.

The score orders currently feasible candidates, then activity points break ties;
stable remaining ties keep existing oldest-first order. There is **no minimum
score cutoff**, no requirement to wait for a higher-scoring person, no public
candidate directory and no guaranteed match when eligible supply is absent.
Existing batch bounds, finite cards and private bilateral decisions remain.

## Data and display

- Store `activityFit` inside the existing immutable Opportunity context snapshot;
  no new database columns or migration. The lifecycle policy remains
  `MUTUAL_OPPORTUNITY_V1`; the scoring subpolicy is independently identified.
- Return additive nullable `matchFit` with score, components, overlap minutes,
  basis and viewer-relative concrete texts. Never return participant IDs,
  private notes, raw consent or candidate rank in this object.
- Historical opportunities lacking a valid score snapshot return null; do not
  reconstruct or fabricate a historical score from changed Intent data.
- Newly considered pre-concrete legacy intents also omit score rather than
  inventing activity points when their actual activity is unknown.
- Both users see identical points and reversed viewer/peer descriptions.
  Responses and decisions do not change the score.
- iOS card shows “Activity fit N/100”, calculation details and a plain-language
  disclaimer. Related cards show both original descriptions, a neutral category
  title and “details to agree”; Plan inherits the neutral title, not either
  participant's description as a supposed bilateral agreement.
- Chinese, English and German strings are maintained together.

## Safe internal rollout

`V2_ACTIVITY_FIT_ENABLED` defaults off. It only permits related general-category
matching; existing exact/parallel generation and already-delivered safe-drain
paths remain available. The global kill switch also disables the feature.
Build 35 does not understand the new explanation; do not enable related matching
while the internal test phones still use it.

Next release, with explicit authorization: deploy the additive backend with the
flag off, upload the new internal native build, update/confirm both test phones,
then enable the flag on a reviewed deployment and perform signed two-account
acceptance. No production flag, data or deployment is changed by this local task.
Do not expose this policy to old external clients without a compatible client rollout.

## Verification

Local verification uses `sideseat_activity_fit_20260908` on localhost PostgreSQL
and the dedicated simulator; no real-user data or phones are used.

- Pure compatibility/privacy tests: 22 passed, none skipped.
- PostgreSQL tests: 10 passed, none skipped; includes the 60/100 related-coffee
  scenario through separate YES answers, accepted Plan and both active Calendars,
  plus exact Sports, parallel Study, strict Study, session boundaries, the
  disabled-rollout boundary and unscored pre-concrete legacy rows.
- Native: 4 test functions / 6 cases passed at `2026-09-08T05:46:03Z`, including
  new score decoding, no-score compatibility and cancellation regressions.
- Visual: one test covering Chinese/English/German passed in 33.356 seconds at
  `05:48:52 UTC`; expanded calculation text and scores asserted, six screenshots
  captured. Chinese light and German dark screenshots were visually inspected.
  Raw user-entered activity/major text is not silently translated.
- Real local API UI: `testRelatedActivitiesShowFitAndReachBothCalendars` passed,
  136.497 seconds, at `05:52:00 UTC`. Two accounts were used sequentially on the
  dedicated simulator, not two physical phones. Both activities were entered
  through the UI; the 60/100 score and different descriptions were asserted
  before consent. The neutral source title prefilled the Plan successfully.
- Read-only database verification at `05:52:19.386 UTC`: one related opportunity,
  score 60, distinct descriptions, two YES answers, one source message, one
  accepted Plan, two ACTIVE Calendar projections with different owners, both
  source intents ENDED and zero Outcome answers on that Plan.
- Local matching sessions were stopped through the API and temporary cleanup
  logins revoked at `05:53:28 UTC`. A second readback confirmed the Plan and
  Calendar evidence remained intact. Initial cleanup login omitted required
  device metadata and received 422; correcting the test helper resolved it.
- Plan/repeat/safety checks: 10 passed; one separate Layer 3 HTTP test skipped
  because `LAYER3_LOCAL_HTTP_URL` was not configured. The new matching HTTP path
  was verified by the actual UI run above, not inferred from that skipped test.
- TypeScript, ESLint, 13 OpenAPI contract tests, 170-operation route validation,
  Swift generation and all three localization plist checks passed.
- Production or TestFlight-binary acceptance: not performed.

These QA records do not count toward the organic pilot Gate.

The full-story verification procedure connected UI assertions to actual local
HTTP requests and persisted records; screenshots alone were not treated as
matching evidence. Local app API address: `http://127.0.0.1:3015`; native/Web Push
sending was disabled. The dedicated simulator is
`DA2735F2-9D4B-40C2-AD18-AA88E537A40C`. No phone, production setting, DB migration
or remote deployment was touched. Existing main-workspace plist edits and old
archives remain excluded from this work.

Machine-local evidence (not uploaded release artifacts):

- `/tmp/SideSeatActivityFitNative-20260908.xcresult`
- `/tmp/SideSeatActivityFitVisual-20260908.xcresult`
- `/tmp/SideSeatActivityFitTwoAccount-20260908.xcresult`
- `/tmp/sideseat-activity-fit-final-tests.log`
- `/tmp/sideseat-activity-fit-api.log`
- `/tmp/sideseat-activity-fit-final-readback.log`
- `/tmp/sideseat-activity-fit-lifecycle.log`
- `docs/visual-qa/activity-fit-{zh-Hans,en,de}.png` and the corresponding
  `activity-fit-details-{zh-Hans,en,de}.png` (local ignored captures).

**Next:** Commit/push this scoped change when authorized, then follow the internal
rollout order above. Collect real intent-to-opportunity and Plan conversion
evidence after rollout; this small QA run does not establish a real-world lift.
