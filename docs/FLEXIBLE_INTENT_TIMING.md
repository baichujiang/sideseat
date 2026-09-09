# Flexible activity intention timing

**Status:** Owner-approved, implemented and verified locally on 2026-09-09. Not deployed.

**Source delivery:** Owner authorized commit/push on 2026-09-09. Production
migration, backend rollout and the next internal TestFlight release remain pending.

**Decision:** 2026-09-09. Intent is willingness, not an appointment. Users can
choose tomorrow, this weekend, next week, a date range, exact times, or leave time
undecided. Relative choices are saved as absolute dates in the selected time zone.

## Contract

- Keep the API/model name WeeklyIntent for existing clients; visible copy becomes
  recent activity intentions. New timing-aware intentions last 14 days and may be
  extended explicitly while active/paused. Existing intentions retain their expiry.
- `timePreference.kind`: EXACT, FLEXIBLE or UNDECIDED. FLEXIBLE has inclusive
  startDate/endDate and a part-of-day field (ANY means no preference).
  UNDECIDED has no availability.
  Day-parts use the submitted IANA zone: morning 06:00–12:00, afternoon
  12:00–18:00, evening 18:00–24:00. ANY imposes no part-of-day preference.
  Existing rows without a preference mean EXACT, never implicitly flexible.
- Only EXACT uses timeWindows (30 minutes–12 hours each). Other modes store an
  empty array. Interest validity is separate from declared availability.
- Exact overlapping time is preferred in matching; intersecting date/part-of-day
  preferences and undecided time may also match. Explicit incompatible ranges
  do not match. Unknown never means both are free all day.
- Timing-aware activity fit excludes timing and normalizes activity/language/school points
  to 100. Timing certainty is a separate label; unknown earns neither zero nor
  invented time points. Historical score snapshots remain unchanged.
- Flexible opportunities have NULL appointment timestamps and an immutable
  privacy-filtered timing context. They expire within 48 hours or sooner when
  intentions/date preferences lapse. Mutual consent still opens chat only.
- A Plan proposal must have actual future start/end times chosen by its author.
  Undated context does not fill a fictitious appointment or enter Calendar.
  Confirmed Plan, Outcome and Shared Encounter contracts remain unchanged.

## Delivery boundary

Feature activation stays off by default until the additive database migration,
backend and compatible internal clients are ready. Old clients must never decode
nullable new Opportunity fields as their former required timestamps. No production
data, matching flags or TestFlight release is changed by this development task.

- Rollout flag: `V2_FLEXIBLE_TIMING_ENABLED=1`, exposed as `v2FlexibleTiming`.
  Default remains off, including when the global kill switch is active.
- New native requests send `X-SideSeat-Flexible-Timing: 1`. Legacy list reads
  exclude undated opportunities; V2 scores are returned as null to legacy clients
  on list/decision/withdraw. Historical V1 score snapshots are never rewritten.
- Deploy migration before backend; keep the rollout disabled until both testing
  phones have the compatible new internal build. Build 38 does not contain this work.
- Existing intentions retain their original expiry on EDIT. Use the explicit
  extension action first to select dates beyond that expiry. Extension does not
  shift dates/windows or restore an expired/ended intention.

## Verification and next step

- Applied all 133 migrations, including `20260909010000_flexible_intent_timing`,
  only to `sideseat_flexible_timing_20260909` on `127.0.0.1:5433`.
- Real PostgreSQL verification: 14 tests pass, none skipped. The new pair creates
  and edits/extends an intention, matches a broad date to undecided timing, keeps
  one-sided YES private, opens contextual chat after both YES, and creates two
  active Calendar projections only after the timed Plan is accepted. Legacy exact,
  related activity, parallel Study, session gating and Plan closure also pass.
- V2 suite: 223 pass, 131 database-dependent tests skipped, zero failures. The
  relevant database suites above were additionally run with an explicit local URL.
- OpenAPI: 170 routes checked, all 13 contract tests pass; generated native client
  updated without generator warnings. TypeScript, scoped ESLint, localization
  syntax checks for all three languages and `git diff --check` pass.
- Native model/Plan inheritance: 6 tests pass. Final simulator run: all 3 UI tests
  pass (Chinese Light + English Dark editor flows, German largest-text editor,
  and undated chat → Plan composer). Each editor verifies default undecided,
  next-week range and exact-time selection. Plan Send is disabled before explicit
  timing confirmation and enabled afterwards. Switching editor steps now resets
  scroll position without clearing input, including at the largest Dynamic Type.
- Final UI evidence: `/tmp/sideseat-flexible-timing-ui-7.xcresult`, log
  `/tmp/sideseat-flexible-native7.log`; native model evidence is in
  `/tmp/sideseat-flexible-timing-ui-5.xcresult`. Earlier UI entry/scroll failures
  were resolved and superseded by the final all-green run. Screenshots are local
  under `docs/visual-qa/flexible-*.png`, including three-language timing choices,
  neutral undated Opportunity cards and the Plan's disabled-send state.
- Visual follow-up: the German maximum-size day-part value now wraps instead of
  truncating, and Back is translated as Zurück. Reverified successfully in
  `/tmp/sideseat-flexible-timing-ui-8.xcresult` (one focused UI test); its refreshed
  screenshot was inspected. This supersedes that visual state from run 7.

Reproduce the database run with `LOCAL_TEST_DB_NAME=sideseat_flexible_timing_20260909
node scripts/with-local-test-db.mjs npx tsx --test
tests/v2/mutual-opportunity-auto-match-postgres.test.ts
tests/v2/together-matching-session-postgres.test.ts
tests/v2/mutual-opportunity-plan-closure-postgres.test.ts` (one shell command).

Next after source delivery: authorize migration and
backend deployment with rollout OFF → new internal TestFlight build → both phones
updated → enable flexible timing and accept the signed two-account flow. These
local synthetic QA results do not count toward the real-user Outcome Gate.
