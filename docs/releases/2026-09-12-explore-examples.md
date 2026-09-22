# Explore example publication — 2026-09-12

## Request, retry and production status

The owner requested visible Explore example data and explicitly asked to continue retrying after the prior attempt stopped. The earlier handoff says the execution request was blocked before deployment and seeding; it did not preserve the original rejection detail. The specific earlier cause is therefore unresolved, not a confirmed Vercel/database or source-code failure.

This normal retry succeeded: read-only database preflight, Vercel login, candidate deployment, the bounded seed, promotion and authenticated API readback all completed. No security setting was disabled.

- Source: `b363d464ab5b2da24fe77c5203dde7515aa29c25`, based on `137bc7a`, for `feat/native-ui-design-system`.
- Deployment: `dpl_8RhSkhnx7itZGMvRL5oBLNgVZDK1`, `sideseat-lnz7m7m8h-baichus-projects.vercel.app`.
- Production domain lookup for `api.sideseat.de` confirmed that READY deployment after promotion.
- Vercel records gitDirty=1 because the previous untracked handoff note remained in the reviewed workspace; runtime source changes were committed before upload.
- Build used `SKIP_DATABASE_MIGRATIONS=1`. Prisma reported all 135 migrations up to date; this operation added no migration.

## Data and visibility

- Published 10 explicit examples, 5 each for TUM and LMU: coffee, library study, badminton, food and campus walk.
- Expiry: `2026-09-26T07:36:56.446Z` (14 days from publication).
- Two reserved example owners are guests, unverified and hidden from person search, recommendations and course members. They have no login or matching sessions.
- Each example carries the bilingual “示例 / Demo · 非真实邀约” disclaimer. No verified-student badge is claimed; automaticMatching is false and no opportunities were generated for these owners.
- Genuine public intentions take priority; examples fill spare slots up to the existing free result cap. Unseen examples do not trigger a Plus upsell.
- The narrow reserved-ID example source is visible to eligible ordinary and internal readers. Same-school, viewer verification, opt-out, block and expiry rules remain unchanged. Unverified accounts have not been upgraded or granted access.
- A restricted local preflight snapshot covered original intention IDs/participation/visibility/version fields and the migration ledger, not a full database backup. SHA-256: `fc8965bec3c7a933a3c0e09aed86677912aad0f80888afa9dae3201559f0643d`.
- Production readback at `2026-09-12T07:42:27.564Z` confirmed all 41 pre-existing intentions retained exactly the same recorded visibility, participation, status and version fields; TUM and LMU each had five active examples.

## Verification

- The unchanged prepared implementation passed 3 isolated PostgreSQL integration tests in the previous attempt, including ordinary/internal readers, block/privacy gates and publication lifecycle; its local seed created 10 rows. These are local, not production-login evidence.
- This retry reran TypeScript, focused ESLint (0 errors; 1 unused test-variable warning) and 3 pure Explore tests successfully. Vercel compilation, lint and type validation completed.
- Candidate client feature configuration exactly matched the live baseline and rejected unauthenticated Explore access with HTTP 401; the reviewed candidate was then promoted.
- At `2026-09-12T07:41:54.410Z`, actual production login/read/logout checks passed for `test_001` and `test_002`. Each GET `/api/v1/explore/intents?limit=5` returned 5 labeled examples, no verified-student claim or identity/exact-window fields, and hasMore=false. Each temporary smoke session was revoked in a finally block. Tokens/passwords were not logged or committed.
- Production configuration retained all existing feature values. Deployment error/fatal log query covering `07:36:49Z` through `07:43:42Z` returned no entries; this is a bounded check, not monitoring.
- No new native build, TestFlight upload or phone UI automation ran. Existing Preview 44 can obtain the data by pulling to refresh in Together > Explore. Signed-phone visual acceptance remains separate from authenticated API evidence.

## Recovery and evidence

Promoting the preceding compatible deployment `dpl_74y9zXXzRvythTW2SPjvthD9MtF4` hides these guest-owned examples without changing ordinary intentions. Alternatively pause/hide only the 10 reserved example IDs. Do not bulk-edit user visibility or reverse the prior Explore migration.

Local evidence prefix: `/tmp/sideseat-explore-examples-retry-` with `deploy.log`, `production-seed.log`, `candidate-config.json`, `candidate-unauth.txt`, `promote.log`, `api-smoke.log`, `db-verification.json`, `tsc.log`, `lint.log`, and `unit.log`. The restricted backup path is recorded in `backup-path` outside Git. The earlier unpublished handoff is retained locally for provenance and superseded by this record.
