# Web invitation time defaults and confirmation wording — 2026-10-30

Status: implemented, locally verified and committed; subsequently deployed and verified with the [shared-plan copy release](2026-10-30-web-plan-copy.md) as READY `dpl_8THpobYYYsaGDMoPJ3CVZrjkzaSN`. No native build or phone installation is included.

The web final-time dialog preserves the first future candidate day's complete range when no saved invitation interval exists. A 12:00–15:30 candidate no longer defaults to 12:00–13:00. Multi-day candidates use one day's endpoints, and a saved explicitly chosen interval is retained. With no future candidate or saved interval, the required inputs remain blank instead of inventing a time. INVITING displays “拟定时间，待确认”; CONFIRMED alone displays “这次，我们约好了。” Closed phases use “计划详情”.

The implementation is in `components/web/plans.tsx`. During shared-workspace execution, its four time/presentation hunks were captured in source commit `6350c987aac40ee52a78777d9a08af5defabf32e`, which also contains a separate invitation-capacity stage. This record does not certify or authorize that other stage. A time-only patch and component were separately prepared against preceding commit `1c2f35a0`, excluding the capacity/contact changes, for a narrowly scoped release.

## Local verification

The existing Next server was reused only after checking PID 8263, port 3344 and its working directory against the active checkout. Its actual database connections were to loopback port 15434. Two disposable `timeqa_` accounts and four owned plans supplied real API-backed browser cases; ordinary account data was not changed.

- A new 12:00–15:30 candidate opened with those exact endpoints. Sending the invitation from the browser persisted 12:00–15:30 and INVITING, and the actual page displayed “拟定时间，待确认”.
- Publishing that invitation from the browser persisted CONFIRMED, retained 12:00–15:30, changed the heading to “这次，我们约好了。”, and produced exactly one owner Calendar entry.
- A two-day candidate opened with the first day's 12:00–15:30 endpoints, without extending into the second day.
- A 12:00–12:30 candidate retained its half-hour endpoints.
- Reopening an existing saved 12:30–14:45 invitation retained those exact endpoints.

Actual browser screenshots of both invitation and confirmed headings were reviewed. Focused ESLint passed for both the active component and the isolated time-only component; whitespace validation passed. The ordinary whole-project TypeScript command failed on stale generated `/web` route declarations from other build directories. A temporary configuration using only the running server's current generated route types passed the full source typecheck; the user's TypeScript configuration and generated-reference edits were preserved.

All two owned QA accounts were deleted; their old cookies returned 401 and all four public plan APIs returned 404. Production verification and any correction of an already persisted production invitation remain separate from these local results; no historical saved interval was guessed or rewritten.

## First authorized publication attempt

The owner explicitly authorized publishing this web correction. The intended target was verified as `baichus-projects/sideseat`, project `prj_Mmv4C0ROdAmglCHaI41vrzTXiH2N`. All three production aliases still mapped to READY `dpl_HAeYXJf2hvaWiA2RcyBb3vfPKbcC`. Its complete 1,436-file remote source tree was checked against cached source hashes; 1,435 files were preserved, the time-only component replaced the remaining file, and one provenance marker brought the candidate to 1,437 files. No capacity/contact/backend/native overlays were included. Database migration and activity release hooks were explicitly skipped for the candidate build.

Candidate `dpl_7U3JNNJ7ziA5SNSnVX9Bi9ryie2X` (`sideseat-8vuf7iab6-baichus-projects.vercel.app`) was created with `--prod --skip-domain` but Vercel immediately returned BLOCKED. The deployment's exact reason was “This deployment couldn’t be built because the project was paused.” A fresh project read confirmed `paused: true`. No build ran and this candidate was not promoted. The production login page still returned HTTP 200. Resuming the project was presented to the owner as a separate setting change; publication remains pending that decision and a successful subsequent build/verification.

On the subsequent page-copy task the project was freshly observed as unpaused, and the previously authorized web publication continued. The original blocked attempt above remains historical evidence; it was not promoted or reclassified as successful. The later combined release retained the time-only component overlay on the current production baseline. Its real production browser dialog saved 12:00–15:30, INVITING displayed the pending title, and organizer publication changed the heading only after CONFIRMED. The linked release records actual source preservation, two-account/guest checks and cleanup.
