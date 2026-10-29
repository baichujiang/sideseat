# SideSeat web production publication — 2026-10-29

Status: **live at [sideseat.de](https://sideseat.de)**. The owner explicitly
authorized this publication and integration with the existing mobile accounts
and data. Live web/mobile-API interoperability passed. Physical App UI verification
remains unperformed because the selected iPhone14Plus connection is unavailable.

## Deployment and source

- Project: `sideseat` / `prj_Mmv4C0ROdAmglCHaI41vrzTXiH2N`.
- Previous production: `dpl_78FQQyqiDPP7gxqNsbnn3moi9KW6`.
- New production: **`dpl_27E69W2D1v5CGphCzP8PqkPSi1LK`**, READY, target Production.
  Immutable URL: `https://sideseat-297ekx9nj-baichus-projects.vercel.app`.
- Actual root, www and api aliases all point to this deployment. See the timestamped
  [alias receipt](../qa/evidence/2026-10-29-web-production/production-aliases.json).
- Web source commit: `b00ef212429ac5065126cc04c679fac3ba26eff6`, current branch
  `codex/ios-uxui-20260922`. Initial implementation, local checks and feature scope
  are in the [web implementation record](2026-10-29-web-workspace.md).
- All1,399 prior production source files were freshly checked against immutable
  source hashes. The reviewed overlay preserves1,392 files, replaces7 entry/share/
  navigation files, adds24 web files and one provenance marker. All1,424 uploaded
  files match the [full source manifest](../qa/evidence/2026-10-29-web-production/source-manifest.json).
  API, business and Prisma schema sources stay byte-identical to the baseline.
- Vercel built a Production candidate with `--skip-domain`,
  `SKIP_DATABASE_MIGRATIONS=1` and `SIDESEAT_ACTIVITY_RELEASE=none`. Its build log
  explicitly confirms skipped migrations; compilation, lint/type checking and route
  generation completed. After authenticated checks it was promoted without rebuilding.
  No project environment or feature-flag changes, database migration, native build,
  phone installation, TestFlight or App Store action occurred.

The web root now redirects to `/web`; signed-out visitors reach `/web/login`.
Existing mobile users use their existing username/email and password. The browser
uses its HttpOnly session; the phone uses its existing native device session for
the same user and production database. There is no separate web account store or
background data-copy mechanism. The original public plan page remains available
and includes an optional authenticated web handoff.

## Live verification

Two newly created disposable accounts were hidden from discovery/course members;
their intentions used `exploreVisible:false`. Neither account contacted ordinary
users. Both the protected candidate and final public production domains passed:

- Current phone client configuration matches, excluding only `serverTime`.
- Browser sessions and native logins resolve to the same two user IDs.
- Profile, private intention, calendar event and peer text-message writes are read
  in both directions between web sessions and native tokens.
- A shared plan created from the web session is readable by the native session;
  native availability submission is read back by the web session.
- A web two-person invitation accepted by the peer's native session becomes
  ACCEPTED, with exactly one calendar entry for each participant.

The candidate web requests and existing `api.sideseat.de` requests used the same
production database before promotion, demonstrating compatibility with the earlier
live native backend. The final run repeated these checks through public www/api
domains. See [candidate](../qa/evidence/2026-10-29-web-production/candidate-sync.json)
and [production](../qa/evidence/2026-10-29-web-production/production-sync.json) receipts.

Actual browser UI on the final public domain additionally passed:

- Root redirect, normal form login and all five web pages.
- Profile save → native API readback; native profile update → browser reload.
- Calendar event creation → native API readback, with one exact event.
- Chat send → peer native API readback; native reply automatically appears in the
  open browser thread without a reload. The desktop composer remains in the viewport.
- Accepted plans appear in the web Confirmed tab. Desktop1440px screenshots and
  mobile390px chat/plan screenshots were inspected; both mobile page widths are390px.
- AASA, Privacy, Support and Login return200. Public plan JSON and the public page
  remain usable without signing in; the page contains the new web handoff.

See [UI/native readback](../qa/evidence/2026-10-29-web-production/browser-native-readback.json),
[desktop calendar](../qa/evidence/2026-10-29-web-production/production-calendar.jpg),
[desktop chat](../qa/evidence/2026-10-29-web-production/production-messages.jpg),
[profile](../qa/evidence/2026-10-29-web-production/production-profile.jpg) and
[mobile plans](../qa/evidence/2026-10-29-web-production/production-mobile-plans.jpg).

The first candidate attempt supplied `automaticMatching:false` in the QA request;
the existing contract correctly returned422 because it accepts only true. The
optional field was omitted in the successful rerun. An initial public-page check
expected an English label while the real page was Chinese; the check was corrected.
Neither observation required a product change. These boundaries are retained in
the [test record](../qa/evidence/2026-10-29-web-production/test-boundaries.json).

## Cleanup and remaining scope

Both own accounts were checked by exact ID/username before deletion. Their owned
records were removed through account deletion; old browser and native credentials
return401, and the final public plan returns404. Temporary credentials and raw
authenticated transport files are excluded from Git and removed after cleanup.
See the [cleanup receipt](../qa/evidence/2026-10-29-web-production/cleanup.json).
The browser was returned to the signed-out production entry.

The default physical device is still the iPhone14Plus with UDID
`00008110-001A69110CC1401E`. Fresh CoreDevice discovery repeatedly reports its
tunnel unavailable; an asynchronous reconnect/unlock request was presented to the
owner. No physical UI test, app launch, installation or device reset occurred in
this release. **The passing native checks use the real production mobile API and
device-family login credentials; they are not a claim of physical App UI acceptance.**
The earlier Preview260 four-root/Avatar supplement remains independently in progress.

Browser OCR/voice capture, OS push parity and StoreKit purchases remain outside this
first web release. Production email/media/AI provider execution was not exercised.
The existing local3344 server/database15434, native sources and unrelated user
`next-env.d.ts` / `tsconfig.json` edits were preserved.

Recovery: use the compatible previous Production deployment above if necessary;
there is no schema reversal to perform. Any rollback should verify all three aliases
and the shared native API. No rollback was needed during this publication.
