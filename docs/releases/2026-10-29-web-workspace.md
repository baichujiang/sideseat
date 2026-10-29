# New SideSeat web workspace — 2026-10-29

Status: implemented and locally verified; production publication awaits the current
owner's approval under `docs/RELEASE.md`. The existing production deployment is
`dpl_78FQQyqiDPP7gxqNsbnn3moi9KW6`. No production alias, environment, database,
schema, feature flag, native source or phone installation was changed by this work.

Source commit: `b00ef212429ac5065126cc04c679fac3ba26eff6`, branch
`codex/ios-uxui-20260922`. All31 runtime overlays in the build receipt match
this committed source exactly. Native phone Preview remains260; no device
build/install/launch was requested or performed for this web-only source change.

## Product

New `/web` workspace with desktop sidebar and responsive mobile navigation:

- Together: current intentions, creation/edit/pause/resume/end, recommendations,
  Explore, private bookmarks, contextual greetings and replies/ignore.
- Plans: current/confirmed/history lists, existing two-person plans, creation of
  shared timetables, explicit availability submission and per-account local drafts,
  activity ideas, contact sharing, final invitations, RSVP, explicit publication,
  metadata editing and cancellation. Two-person invitations use the existing
  accept/decline/cancel contracts.
- Calendar: month/week/agenda, search within the displayed range, category filters,
  event create/edit/delete with explicit recurring-event scope, companions,
  reviewed natural-language drafts, category/subscription creation and ICS
  import/export. Confirmed plan projections open their source plan.
- Messages: shared direct conversations, text/images, older history, read state,
  pinning, remarks, blocking and two-person plan invitations. Visible threads
  refresh every five seconds; other resources refresh on focus and periodically.
- Me: profile/avatar, languages, current/search/saved/archived course lists and
  enrollment/manual addition, existing student verification, shared privacy and
  blocks, password change, membership redemption and feedback submission.

Browser login uses the existing HttpOnly cookie session. Native device-family
sessions remain separate credentials for the same user and database. Browser
requests never use an expired in-memory native JWT. There is no second user
database, synchronization job or production mock-data source.

The public plan page adds an optional signed-in web entry. Login returns to the
original plan. Guest participation and recovery are retained. Original frozen
`/home`, `/discover`, `/inbox`, `/profile` routes stay frozen; `/web` is additive.
The proposed root entry opens the new workspace, and `/ios` offers both clients.

## Verification

- Routing/share-message regression tests: 3 passed; legacy freeze, public sharing and admin
  routes retained; no automatic guest account for `/web`.
- Focused ESLint and TypeScript check cover the new workspace and modified files.
  The type check uses current generated route types rather than combining the
  active checkout's unrelated historical `.next` declarations.
- Local real-API smoke: 11 positive checks with two newly created, isolated
  accounts. Browser cookie and native-device login resolve to the same identity;
  intention/calendar/chat changes are read in both directions. A browser-created
  two-person invitation accepted with the peer's native credentials produces
  exactly one calendar entry per participant.
- Actual browser UI: login, five-page navigation, event creation, plan creation,
  availability selection and explicit Submit/share, chat send and profile save.
  Subsequent native-authenticated reads confirm the UI-created calendar event,
  plan/submitted availability and chat message. See
  [native readback](../qa/evidence/2026-10-29-web-workspace/native-readback.json).
- Actual desktop and 390px screenshots reviewed. The 390px profile and calendar
  DOM widths equal the viewport width. Long-chat verification found an overflowing
  grid item; `min-height:0` and a non-shrinking composer now keep the input inside
  the chat panel (verified bounds). Image-load failure falls back to an avatar
  initial. See [desktop calendar](../qa/evidence/2026-10-29-web-workspace/desktop-calendar.jpg),
  [mobile profile](../qa/evidence/2026-10-29-web-workspace/mobile-profile.jpg) and
  [mobile calendar](../qa/evidence/2026-10-29-web-workspace/mobile-calendar.jpg).
- Production source baseline: all 1,399 source paths/hashes freshly compared with
  the retained exact production candidate; local build context overlays only the
  new web files and the stated entry/navigation/share files. API/business/schema
  sources are preserved. Build uses `SKIP_DATABASE_MIGRATIONS=1` and a non-routable
  database placeholder; it does not read production data or migrate a database.

This is a first web release of the core account workflows. Browser OCR/voice
capture, OS push parity, native photo-library UX and StoreKit purchase flows are
not implemented. Native device-local unread reminders/notification history do
not become synchronized server data. Real provider email/media/AI execution and
a physical-phone UI suite were not performed in this web change. The earlier
Preview260 physical supplement keeps its original independent status.

The pre-existing local server at port3344 and database at15434 belong to the
ongoing phone QA environment; their identities were checked and they were reused
without restart or configuration changes. Only this web run's two accounts and
their owned test records are eligible for cleanup. User `tsconfig.json` and
`next-env.d.ts` changes stay outside the web commit.

Final production build passed (131 generated static pages, complete route build,
build lint and TypeScript). All31 overlaid source files match the active checkout;
1,392 baseline files remain byte-identical, with7 existing entry/share/navigation
overlays and24 new web files. See [build binding](../qa/evidence/2026-10-29-web-workspace/build-verification.json).

## Publication

Formal `sideseat.de` publication is a separate approval gate. No TestFlight or App
Store action is part of this web work. A subsequent authorized production release
must preserve the current baseline, use the reviewed web overlay, retain existing
production secrets/flags, skip database migrations and verify both the web entry
and the unchanged native API before assigning domains.

Both owned local QA accounts were deleted and their old cookies returned401.
The run’s private credential/context files were removed. The shared QA server and
database were not restarted, stopped or reconfigured.
