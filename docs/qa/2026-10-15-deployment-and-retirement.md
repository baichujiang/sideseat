# Deployment and retirement audit — 2026-10-15

**Status:** Dated maintenance evidence. No new app/backend release.

Owner request: inspect deployed features, clearly archive obsolete code/features,
and stop modifying retired parts. Current maintenance entry point is
[Deployed state](../DEPLOYED_STATE.md); [archive policy and manifest](../../archive/2026-10-15-retired/README.md)
define the frozen material.

## Observed running state

- Active checkout `Sideseat-ios-uxui`, branch `codex/ios-uxui-20260922`.
  Baseline `e168acf` was clean and fetched; ahead/behind 0/0.
- Device inventory returns Preview `app.sideseat.mobile.preview / 1.0.0 (99)`
  and ordinary SideSeat `app.sideseat.mobile / 1.0.0 (97)` as separate apps.
- Vercel inspect resolves `api.sideseat.de` to production/Ready deployment
  `dpl_7osq5AhK8d7Bsxh3hs2tQUHE4vRi`,
  `https://sideseat-g0yhl8r7e-baichus-projects.vercel.app`.
- Public `/api/v1/client-config` was read without changing any flags or account.
  [Captured configuration](./evidence/2026-10-15-deployment-audit/client-config.json)
  distinguishes enabled matching/Meet Again from disabled legacy Action,
  recommendations, small-group and StoreKit support.
- [HTTP checks](./evidence/2026-10-15-deployment-audit/http-routes.json): `/ios`,
  `/privacy`, `/support`, AASA return 200; old product routes `/discover`,
  `/profile`, `/courses`, `/calendar`, `/chats` return 307 to `/ios`;
  unauthenticated time-poll listing returns 401.

## Installed Preview 99 entry verification

The installed application was activated and attached to through a temporary UI
runner; no app target was rebuilt/reinstalled and no authentication arguments or
credentials were replaced. Test `PlanEntryAudit.testInstalledPreviewEntryPoints`
passed in 23.708 seconds at 10:57:05 Europe/Berlin:

1. Plans tab contains neither `plan-smart-time` nor `inbox-time-poll`.
2. Messages `inbox-time-poll` opens the native poll sheet with its create control.
3. An existing chat's Plan editor contains `plan-smart-time`, label **智能约时间**.

The first attempt could not activate the poll toolbar because an existing video
picture-in-picture window intercepted its tap. The rerun collapsed that window
and passed all assertions on the same installed application process. The temporary
runner was uninstalled. No message, invitation, time-poll answer or Calendar
mutation was submitted. Private owner-screen captures and raw results remain at
`/tmp/sideseat-plan-entry-audit-20261015/result-clear-pip.xcresult`, not in Git.

This establishes the distinction between **智能约时间** (own-calendar suggestion)
and **一起定时间** (multi-person poll). It does not establish a poll → Plan
conversion; no such integration currently exists. Group-chat poll menu source is
present, but `MVPRoutePolicy` currently rejects group routes, so it is not listed
as an open Preview 99 entry.

## Production source comparison

Vercel's uploaded source tree was fetched read-only. All 1,322 `src/` file IDs
were compared to SHA-1 of the local baseline: 1,313 match, 9 differ or are absent.
The [complete path/hash comparison](./evidence/2026-10-15-deployment-audit/source-comparison.json)
refers to baseline `e168acf`, before this archival change.

Five relevant differing source/release files were retrieved from that deployment
and verified against its file SHA-1 before storing non-executable `.txt` evidence:

| Deployed path | Difference / snapshot |
| --- | --- |
| `lib/analytics/layer2-outcome-pilot.ts` | One extra internal QA username excluded in production; [source](./evidence/2026-10-15-deployment-audit/production-source/lib/analytics/layer2-outcome-pilot.ts.txt) |
| `lib/calendar/smart-input-policy.ts` | Comment wording; [source](./evidence/2026-10-15-deployment-audit/production-source/lib/calendar/smart-input-policy.ts.txt) |
| `lib/media/private-blob.ts` | Trailing blank line; [source](./evidence/2026-10-15-deployment-audit/production-source/lib/media/private-blob.ts.txt) |
| `scripts/test-calendar-parser-timezones.mjs` | Deployed check script; [source](./evidence/2026-10-15-deployment-audit/production-source/scripts/test-calendar-parser-timezones.mjs.txt) |
| `share-expiry-release-source.json` | Only present in the production source; [receipt](./evidence/2026-10-15-deployment-audit/production-source/share-expiry-release-source.json.txt) |

The other four differences are `.vercelignore`, `AGENTS.md`, `README.md`, and
`eslint.config.mjs`. No deployed file or rollout flag was overwritten to reconcile
this snapshot. Future releases must compare against the then-current deployment.
The verbatim source snapshots preserve original EOF whitespace; `.gitattributes`
exempts only this evidence subtree from whitespace check warnings.

## Retirement and validation

The archive manifest contains **68 files**: 63 tracked files moved, four removed
When2meet source/test files recovered read-only from `ba8a92b`, and one complete
historical roadmap copy. Original source and evidence bytes are preserved;
Markdown received a retirement banner and relative-link rebasing. This includes
the expired Together demo's unit and E2E tests, so current tests do not import
its archived catalog. No source for the current native app, API, shared runtime
libraries, Prisma or OpenAPI was changed.

The active package no longer exposes Capacitor or Discover-showcase commands.
Default source search, TypeScript, ESLint and Vercel exclude the archive. The
native target still reads only its original current source paths. Root/archive
AGENTS instructions forbid routine edits, execution or reactivation. Legacy
interfaces that still serve clients/data remain frozen at their original paths.

Verification:

- SHA-256 checks for every one of the 68 manifested archive files pass.
- No archived path appears in TypeScript compiler inputs or current native target.
- TypeScript no-emit passes.
- ESLint passes with zero errors and one existing unused-variable warning in
  untouched `tests/v2/explore-examples-postgres.test.ts`.
- Native-web handoff/AASA and time-poll domain checks: **9 passed, 0 failed**.
  The active AASA regression had expected only the old Preview callback path;
  its expectation now includes the already-deployed `/time-polls/*` path.
- OpenAPI matches **187 operations**; contract tests **13 passed, 0 failed**.
- Markdown links: no new missing local links. Existing missing historical
  screenshot references are recorded separately; no screenshots or old verdicts
  were invented to repair them. The active index's missing September web-release
  link was removed.
- Diff whitespace checks pass. Commit/push on the existing branch follow this
  verification; they do not imply a new backend deployment or phone install.

[Machine-readable audit](./evidence/2026-10-15-deployment-audit/audit.json)
contains exact versions, source snapshots and verification boundaries.

## Limits

This audit used live configuration, read-only HTTP/source comparison, installed
entry checks and focused local contracts. It did not repeat every feature's
authenticated end-to-end flow, APNs delivery, Sentry symbolication or Apple
distribution status. Preview 99's five-account create/paint/erase/reopen evidence
remains in its [own QA record](./2026-10-15-native-time-polls.md), with that build's
exact scope. Production data, migrations, feature flags, ordinary SideSeat 97 and
the installed Preview 99 were preserved.
