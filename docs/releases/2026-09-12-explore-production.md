# Explore backend activation — 2026-09-12

## Authority and delivery

The owner explicitly requested connecting and enabling Explore for the existing phone Preview. This operation includes the additive production migration, backend deployment and feature activation; it does not authorize a TestFlight or App Store release.

- Source: `bd0ace8a13d79c9651fdac4214b2b47a46fa9735`, on `feat/native-ui-design-system`.
- Production API: `https://api.sideseat.de`; Vercel project `sideseat`.
- Deployment: `dpl_74y9zXXzRvythTW2SPjvthD9MtF4`, `https://sideseat-8xvugtdmu-baichus-projects.vercel.app`.
- Build became READY at 2026-09-12 06:48:11 UTC, after compilation, lint and type validation.
- Created with `--prod --skip-domain`, checked before promotion, then promoted to the production domain.
- Persistent Production `V2_EXPLORE_INTENTS_ENABLED=1` was added. Live client configuration at 06:54:59 UTC returned `v2ExploreIntents=true`; all previously returned feature values were unchanged.

## Database and privacy

- The sole pending migration was `20260911001000_explore_intent_visibility`. It adds `exploreVisible` with DEFAULT false and its index.
- A restricted local logical backup of the 41 WeeklyIntent rows, column definitions, indexes and Prisma ledger was written and checksum/readback verified before migration. This is a scoped backup, not a full Neon restore drill.
- Backup SHA-256: `bb75bcf456517d88380baef13cf9ab3539dcf54a5af5aca605e1e76c05d7dea5`.
- The backup is under the owner's `Library/Application Support/SideSeat/backups/`; its exact path is recorded locally in `/tmp/sideseat-explore-backup-path`. No backup contents or credentials are in Git.
- Migration was applied once from the controlled release checkout. Vercel builds explicitly used `SKIP_DATABASE_MIGRATIONS=1`; no persistent remote-migration permission was enabled.
- Immediately after migration all 41 original intentions were still private, with zero Explore-visible intentions. No existing intention was silently published, reset or deleted.
- Added an Explore-only filter: synthetic accounts classified by the existing internal-account policy are excluded from ordinary readers' Explore results. Matching policy is unchanged.

## Verification boundaries

- V2 suite: 230 passed, 0 failed; 136 database-dependent tests skipped in this pure run.
- Two additional isolated PostgreSQL integration tests passed without skips: actual create/publish/pause/resume/opt-out, privacy-safe projection, bilateral blocks, QA isolation and result cap. Three focused pure Explore checks, TypeScript and focused ESLint also passed.
- Candidate and production configuration were compared with the saved baseline. Explore is the only changed feature. Both endpoints reject unauthenticated Explore requests with HTTP 401.
- Production authenticated QA-login automation was blocked by the execution safety check and did not run. Do not report this as a passed signed-device or authenticated production journey. No new QA profiles, sessions or demonstration intentions were created by those blocked commands.

- Public Privacy, Support and AASA URLs returned HTTP 200 after promotion. Prisma reports all 135 migrations up to date.
- The existing `SideSeat Preview` 1.0.0 (44) was relaunched on the paired phone at 08:55:31 Europe/Berlin to refresh configuration. No new native binary was installed; ordinary SideSeat remains 1.0.0 (41).
- Deployment-scoped error/fatal logs from 06:48:11 to 06:54:11 UTC returned no entries. This is a bounded initial check, not ongoing monitoring.
- Explore may legitimately be empty until another eligible same-school account explicitly shares an active intention. Own, private, paused, expired and blocked intentions remain excluded. This rollout did not seed demonstration content.

## Recovery and local evidence

Disable Explore and deploy with `V2_EXPLORE_INTENTS_ENABLED=0`, or promote the immediately preceding compatible deployment `dpl_FbLMGSJwzrEDEGoiqKAPDTJFZjBn`. Keep the additive column, existing matching flags and user data; do not reverse the migration or bulk-change visibility.

Local evidence: `/tmp/sideseat-explore-preflight.log`, `/tmp/sideseat-explore-production-migration.log`, `/tmp/sideseat-explore-deploy.log`, `/tmp/sideseat-explore-candidate-config.json`, `/tmp/sideseat-explore-candidate-unauth.txt`, `/tmp/sideseat-explore-production-config.json`, `/tmp/sideseat-explore-production-env.log`, `/tmp/sideseat-explore-promote.log`, `/tmp/sideseat-explore-postgres-tests.log`, `/tmp/sideseat-explore-v2-tests.log`, `/tmp/sideseat-explore-tsc.log`, `/tmp/sideseat-explore-lint.log`, `/tmp/sideseat-explore-phone-relaunch.log`.
