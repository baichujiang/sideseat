# Build 40 discovery-first matching activation

## Authority and status

- Owner requested enabling the new rules and preparing two-account acceptance,
  then confirmed both phones are on TestFlight **1.0.0 (40)** on 2026-09-09.
- Activation is complete. Production reports `v2DiscoveryMatching=true`.
  Both existing QA accounts receive the enabled feature configuration.
- This is a flag activation using the already released Build 40 source. No new
  native upload, database migration or user-data seeding was performed.
- Phone versions are owner-confirmed; the signed-device acceptance journey is
  still for the owner to perform. API smoke does not claim physical acceptance.

## Deployment and verification

- API: `https://api.sideseat.de`, Vercel project `sideseat`, production.
- Source: `f7d59392bfb0380c3618b1dc6ee95828d1d571ba`, unchanged Build 40 code.
- Clean isolated checkout: `/private/tmp/sideseat-discovery-on.y2hEnS`.
  The main workspace's unrelated Info.plist edit, archives and media are excluded.
- Deployment: `dpl_FbLMGSJwzrEDEGoiqKAPDTJFZjBn`,
  `https://sideseat-lxm63hosr-baichus-projects.vercel.app`.
- Next.js 15.5.23; READY at `2026-09-09T19:37:30.143Z`; build/deployment
  duration 158.0 seconds. Compilation, lint and type validation passed.
- Created with `--prod --skip-domain`, discovery explicitly `1` at build and
  runtime, and automatic/flexible timing retained at `1`.
  `SKIP_DATABASE_MIGRATIONS=1` was explicitly honored in the build log.
- Candidate two-account smoke passed at `2026-09-09T19:38:19.007Z`.
  Then the existing Production `V2_DISCOVERY_MATCHING_ENABLED` variable was
  updated to `1` and the validated candidate was promoted.
- Production two-account smoke passed at `2026-09-09T19:38:51.073Z`.
  The production domain resolves to the validated deployment.
- Both endpoints were compared against the saved pre-activation configuration:
  **discovery is the only changed client feature**. Together, activity fit,
  automatic matching, flexible timing, Meet Again and production APNs remain ON.
- `test_001` and `test_002` each passed login, authenticated feature configuration,
  private Plan DTO checks, inbox and Calendar reads on candidate and production.
  Every temporary smoke session was revoked. Experiment reads use the existing
  assignment upsert; no opportunity generation, intention publication, interest,
  message, Plan or Outcome action was requested by the smoke.
- Deployment-scoped error/fatal log query from readiness through
  `2026-09-09T19:39:00.658Z` returned no records. This is a bounded initial check;
  no log drain or ongoing monitor was inspected or changed.

Other unreleased experiments (Action Interest, Plan Inheritance, Social
Preferences, Recommendations and Small Group Pilot) and StoreKit support remain
OFF. They are not part of the Build 40 Together acceptance scope.

## Two-account acceptance

1. Both phones use **1.0.0 (40)**. Background and reopen the app to refresh
   configuration, then open Together.
2. Each account explicitly publishes an intention. Review and publish old saved
   intentions; resume paused intentions when desired. No old intention is
   silently published by activation.
3. Check discovery across different activities/time/languages/schools/courses,
   the relevance score and visible differences. Low relevance alone must not
   exclude a pair. Existing safety, refusal and occupied-pair rules still apply.
4. First account chooses interest: it stays private. Second account chooses
   interest: the pair can chat. Interest alone must not confirm a Plan.
5. Create a Plan with a concrete time, accept it on the other account, and
   verify both Calendars. Then exercise cancellation/rescheduling as desired.
6. After a completed Plan, verify participant-private Outcome and Meet Again
   responses without fabricated answers. QA does not satisfy the organic Gate.

The original App Store Connect Build 40 testing notes described the flags-OFF
release. Those console notes were not edited during this activation; the enabled
status and instructions above supersede them.

## Recovery and evidence

Rollback: set the Production discovery variable back to `0` and promote
`dpl_2R3QJJVaWR18McE5qYWGpWyN93ZL`, the immediately preceding compatible
Build 40 deployment. Preserve automatic/flexible timing and user data.

Local evidence:

- `/tmp/sideseat-discovery-on-before-config.json`
- `/tmp/sideseat-discovery-on-deploy.log`
- `/tmp/sideseat-discovery-on-smoke.mjs`
- `/tmp/sideseat-discovery-on-candidate-smoke.log`
- `/tmp/sideseat-discovery-on-env.log`
- `/tmp/sideseat-discovery-on-promote.log`
- `/tmp/sideseat-discovery-on-production-smoke.log`
- `/tmp/sideseat-discovery-on-testing-notes.txt` (local enabled-flow instructions)
