# Simplified collaborative activity editor — local preview, 2026-10-30

## Scope and delivery boundary

The owner requested the approved simpler design in the actual webpage for review.
This stage is implemented and verified locally. It is **not deployed to Vercel**.
Existing production aliases, remote schema and native Preview260 are unchanged.
The separate unlimited-invitation work remains unshipped; this editor preserves
the current production capacity ceiling of 20, with the optional smaller cap
inside More settings.

Active checkout: `Sideseat-ios-uxui`, branch `codex/ios-uxui-20260922`.
The verified dev server listens on `http://127.0.0.1:3344`, with its cwd in that
checkout. It was restarted only to load the regenerated Prisma client, preserving
its existing environment. Database mutations were restricted to the existing
loopback database on port15434. No other checkout or native device was started.

## Product behavior

- One-page activity creation: title, independent Activity/Place/Time toggles,
  compact summaries and on-demand candidate inputs. Turning a topic off exposes
  its fixed value. Account-scoped versioned drafts survive reloads.
- A friend opens directly into one page with inline name, separate multi-select
  activity/place preferences, optional suggestions and availability. Selections
  before naming survive reload; one submission saves the choices together.
- A deliberate empty preference submission remains submitted, including after
  clearing earlier choices. It does not create an empty availability response.
- The organizer confirms the title, activity type, location and complete time in
  an inline editor. Preference counts are advisory. The confirmed arrangement
  and invitation version are persisted together; changes require a new RSVP.
- Reopening an invitation preserves selected participants by identity even when
  response IDs and invitation IDs differ. Declined replies display correctly.
- Publishing remains an explicit organizer action. Accepted account holders get
  Calendar entries; anonymous guests do not acquire an account Calendar.
- New collaboration plans use this UI. Existing plans retain their legacy UI and
  API contracts; LOCATION options are excluded from legacy activity endpoints.

## Implementation and local schema

Additive migration `20261030220000_time_poll_collaboration` adds
`TimePoll.collaboration` JSONB and `TimePollActivityIdea.kind`, default ACTIVITY.
Both columns were checked/applied only to the validated local database, migration
state resolved, and Prisma client regenerated. Production requires a separately
reviewed migration and source comparison before any later release.

New authenticated and guest `/options`, `/options/interest` and `/preferences`
routes retain existing identity/session checks. Guest IDs alone grant no access.
`preferenceSubmitted` describes only the current viewer. Selected invitation
metadata remains owner-only; hidden SHARED invitations are not publicly listed.

## Verification

- 34 focused time-poll tests pass, including legacy notification compatibility,
  separate option kinds, closed fields, current-viewer submission privacy,
  preference-only participants and owner invitation identity mapping.
- Focused TypeScript, ESLint for all changed frontend/backend modules and
  `git diff --check` pass. The user's preexisting `next-env.d.ts` and
  `tsconfig.json` edits are excluded from this stage.
- 13 additional real local API checks pass: preference-only invitation without
  a fabricated response; clearing all preferences; LOCATION isolation; rejected
  closed-field suggestions/preferences/availability; fixed time with open place
  remains COLLECTING; all-fixed skips to INVITING; legacy collection, activities
  and fixed invitation behavior. Five successful fixtures and one earlier test
  fixture are deleted and independently return404. The earlier script used POST
  for an existing PUT endpoint and was corrected; no API change was made for it.
- Actual in-app browser: create a plan with two activity and two location choices;
  reload the draft; set12:00–15:30; create and copy its link; select before naming;
  reload anonymous choices; propose another location; submit all choices once;
  choose final content; send invitation; accept; change the final location and
  verify RSVP reset; decline and observe the organizer's “已婉拒”; accept again;
  publish. A second account also accepts through the existing authenticated API.
- Final data readback: phase CONFIRMED, three accepted people including organizer
  and guest; the two account holders each have exactly one Calendar entry.
- Actual responsive editor checks at390px and320px: no page horizontal overflow,
  fixed/open toggles expose the correct fields, and the compact layout remains
  usable. Temporary viewport override was reset. Share-page dark color tokens
  were corrected and the final dark page visually inspected. This is a Mac
  in-app-browser width check, not a physical-phone or cross-browser claim.

## Retained local review state

The visible browser deliverable is `/web/plans?create=1` with an editable demo
draft. Two isolated local QA accounts and one published demo plan remain so the
review page and end-to-end result can be inspected. No ordinary account was used.
Private credentials and plan identifiers are retained only in task-owned `/tmp`
files and are excluded from Git. The temporary server-environment export was
removed after restart.

Sanitized result files: `/tmp/sideseat-collab-real-20261030/arrangement-check.json`,
`publication-check.json`, and
`/tmp/sideseat-collab-backend-real-20261030/results.json`.
Final preview captures: `/tmp/sideseat-collab-real-20261030/preview-desktop.png`
and `preview-mobile.png`. Browser test/preview artifacts are local evidence.
