# Build 36 activity-fit backend rollout

**Status:** Production backend deployed and related matching enabled. Installed
Build 36 signed two-account matching-to-both-Calendars acceptance passed, with
the explicit QA time-alignment setup described below.

## Authority and target

The owner confirmed both phones are updated to Build 36, completing the agreed
condition for backend deployment and activation. The connected Baichu iPhone
independently reports `app.sideseat.mobile`, `1.0.0 (36)`; the second phone's
version is owner-confirmed, not independently inspected by this task.

- Source: `bbb6a3c67af33eab9ab6fcfe4619c14c9bdf195f`, containing feature `2ec160d`.
- Target: Vercel `baichus-projects/sideseat`, project
  `prj_Mmv4C0ROdAmglCHaI41vrzTXiH2N`; production API `https://api.sideseat.de`.
- Deployed a clean Git archive. The owner's unrelated Info.plist edit and old
  Build 29/30 archives remain excluded. No native binary was rebuilt/replaced.
- Prior production: `dpl_Fe5VGrTs3V6p7vtHmAQ87MMMqP8j`.
- Database endpoint was asserted before read-only migration status: all 132
  migrations applied, schema up to date. No migration or SQL write was run.
- Reviewed the recorded recovery branch `br-super-dust-apsx56sw` (expires Sep 15)
  and six-hour production history limitation from the Build 34 release. This
  release has no schema change; it does not certify a new restore drill.

## Candidate, activation and smoke evidence

Both candidates used production configuration, `--skip-domain`, and build-time
`SKIP_DATABASE_MIGRATIONS=1`. Existing Together, Meet Again and push settings
were retained. Next.js `15.5.23` remote builds and type/lint checks passed.

| Candidate                       | Deployment                         | Runtime setting             | Result                                                         |
| ------------------------------- | ---------------------------------- | --------------------------- | -------------------------------------------------------------- |
| Compatible feature-off rollback | `dpl_6Qmnn6XufJNFEYzscQKnR9xr9cCf` | `V2_ACTIVITY_FIT_ENABLED=0` | Ready; both QA accounts passed API smoke at `11:11:43.925 UTC` |
| Enabled candidate               | `dpl_DJCXoD7q7tuvNmFpabKdAAZ3zrNm` | `V2_ACTIVITY_FIT_ENABLED=1` | Ready; both QA accounts passed API smoke at `11:14:38.209 UTC` |

The enabled candidate was promoted only after its smoke passed and client
readiness was confirmed. The same flag was added to the project's Production
environment for subsequent deployments. Production-domain smoke then passed at
`11:15:07.589 UTC`, independently reporting `v2ActivityFit=true` while existing
Together, Meet Again and production APNs flags remained true.

Smoke covered both existing QA logins, private Plan DTOs, intents, inbox and
Calendar reads. Each temporary HTTP login was revoked. No Outcome, decision,
Intent or Plan writes were requested by those smoke scripts. An initial enabled
candidate probe ran before Ready and received a non-JSON building page; its
failed harness log is retained separately, not counted as a passing check.

## Signed-device acceptance scope

One connected iPhone runs the already installed Build 36. A separately signed
XCTest host drives that App without DEBUG fixture arguments, sequentially using
the two existing QA accounts. This is not simultaneous automation of two phones.

The original coffee preflight found another account with an active coffee
matching intent, so no coffee QA intent was created. The exploration preflight
found no other active candidates in that category. The QA pair's latest Shared
Encounter had only participant A's Meet Again YES; B must explicitly answer on
its own UI before fresh matching. No Outcome correction or SQL bypass is allowed.

Passed: different exploration descriptions → real score card and explanation →
independent YES decisions → source message → accepted Plan → both Calendars,
with scoped read-only database verification. No new Outcome closure was requested.

### Setup and intermediate evidence

- Initial signed harness run stopped at profile/settings navigation before any
  QA mutation. A separate read-only signed navigation inspection passed and
  confirmed the profile and settings controls. The subsequent account switching
  succeeded without a product patch. The first run is not counted as passed.
- Both distinct exploration descriptions were created through the installed
  App. B also supplied its own missing repeat permission through its Plan UI,
  and explicitly started matching. A's pre-existing active matching session was
  preserved. No new opportunity decision had yet been submitted.
- The sequential entry crossed a 15-minute default-time rounding boundary:
  A declared `12:00–12:30 UTC`, B `12:15–12:45 UTC`. The readback at
  `11:30:54.039 UTC` correctly showed no opportunity with only 15 minutes overlap.
  This test attempt is not a passing 30-minute matching case.
- At `11:32:31.559 UTC`, the authenticated, version-checked public Intent API
  extended only A's newly created QA end time to `12:45 UTC`; its description
  and start stayed unchanged. The temporary setup login was revoked. This is
  explicit QA fixture alignment, not an all-UI time-edit test or a SQL bypass.
- Read-only database evidence at `11:32:47.299 UTC`: exactly one new PENDING
  related exploration opportunity, `ACTIVITY_FIT_V1`, score **60/100**
  (`25 + 15 + 10 + 10`), 30 minutes overlap, both distinct original descriptions,
  neutral source title, zero decisions and no Plan/source message yet. Repeat
  eligibility used the pre-existing Shared Encounter plus both UI permissions.

### Completed signed closure

- `testBuild36ExistingRelatedOpportunityToBothCalendars` passed on the installed
  distribution binary at `11:36:55.195 UTC`: one test, zero failures, 162.297 seconds.
  It continued the existing opportunity rather than recreating either Intent.
- Both accounts saw the real 60/100 score. B's screen showed both original
  descriptions and expanded calculation, then B's YES remained private with no
  start-Plan action. A independently selected YES before the source chat opened.
- The source prefilled a neutral exploration title, not either user's desired
  activity as a supposed agreement. A added a QA marker and sent the Plan; B
  explicitly accepted. The resulting Plan appeared in B's and then A's Calendar.
- Read-only database assertions at `11:36:37.752 UTC`: two source Intents ENDED,
  one related score-60 MUTUAL opportunity, two different participants' YES,
  one source message, one ACCEPTED QA Plan, two owner-distinct ACTIVE Calendar
  projections and zero new Outcome answers. No score, decision, Plan, Calendar
  or encounter was inserted directly into SQL.
- Seven screenshots were exported. The score/breakdown and final proposer
  Calendar were visually inspected. This is functional closure, not exhaustive
  visual certification: the generated neutral Plan title remained English in
  the Chinese UI, and the immediate expanded-disclosure capture does not show
  the full disclaimer. Record these for a focused display follow-up; neither
  prevented consent, Plan creation/acceptance or Calendar projection.
- At `11:37:27.557 UTC`, only B's matching session started by this run was
  stopped through B's authenticated API, returning to IDLE. A's pre-existing
  matching session was not stopped. The temporary cleanup login was revoked;
  QA consent, Plan and Calendar evidence were retained, not deleted.
- Post-cleanup readback at `11:39:11.885 UTC` passed the same complete database
  assertions. Documentation formatting and `git diff --check` also passed.

The full-story verification procedure tied the actual signed client actions
to production API behavior and persisted records; screenshots alone were not
treated as proof of matching. This is one connected phone with sequential QA
accounts, not simultaneous independent automation of both owner phones.

## Recovery and limits

If rollback is required, set the project flag to `0` and promote the verified
feature-off candidate `dpl_6Qmnn6XufJNFEYzscQKnR9xr9cCf`. Updating project env
alone does not change a running deployment. Do not delete history or reverse
Outcome/consent data. The feature-off backend retains the new DTO support.

The bounded deployment-specific error-log scan returned no matching logs. This
is not continuous monitoring certification. No log drain was added or certified;
the previously recorded cron/backup/restore-readiness gaps remain open.
QA data does not count toward organic pilot metrics or authorize public release.

Local evidence: `/tmp/sideseat-activity-fit-{off,on}-deploy.log`,
`/tmp/sideseat-build36-{disabled,enabled-ready,production}-smoke.log`,
`/tmp/sideseat-build36-promote.log`, `/tmp/sideseat-build36-runtime-errors.log`,
`/tmp/sideseat-build36-installed-apps.json`, and the signed-device result bundles
recorded after completion.

- `/tmp/SideseatBuild36RelatedClosure.xcresult` and
  `/tmp/sideseat-build36-related-closure.log` (passing signed closure).
- `/tmp/sideseat-build36-related-attachments/manifest.json` (seven captures).
- `/tmp/sideseat-build36-{final-readback,post-cleanup-readback}.json` and
  `/tmp/sideseat-build36-{closure-assert,post-cleanup-assert}.log` (scoped DB checks).
- `/tmp/sideseat-build36-{align-qa-time,qa-cleanup}.log` (explicit QA setup/cleanup).
- `/tmp/sideseat-build36-related-device.log` and
  `/tmp/SideseatBuild36RelatedExploreRetry.xcresult` retain the unsuccessful
  navigation/default-time attempts; neither is counted as a passing test.

## Next step

Use the enabled Build 36 with the existing internal testers and collect actual
Intent → opportunity → bilateral YES → accepted Plan conversion evidence. Do
not interpret this synthetic QA encounter as a real meeting or organic Gate
pass. Fix the observed auto-title localization and verify stable expanded-text
layout in the next focused display change. External/public rollout remains a
separate approval and readiness decision.

**Subsequent native follow-up:** The owner requested both display fixes; they
are implemented in the [title/disclosure follow-up](./2026-09-08-native-title-disclosure-fix.md)
and available in [internal Build 37](./2026-09-08-testflight-37.md). Update both
phones and confirm these displays next. This does not rewrite the Build 36
screenshots, stored Plan titles or production evidence above.
