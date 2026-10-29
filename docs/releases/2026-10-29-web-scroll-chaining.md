# Web calendar/plan wheel scrolling — 2026-10-29

Status: **live at [sideseat.de](https://sideseat.de)**, production
`dpl_HLHJLHHJgPhP27oQ1RfcsaabZRDr` READY on root/www/api. Same tested Production
candidate promoted without rebuilding; web source commit
`5ba690e5580f4cc555385ba26794700be9600c56` on `codex/ios-uxui-20260922`.
Previous baseline: `dpl_5BKA8W4f9ga7ZcQaQNP37zL2AxcD`.

The owner reports intermittent Mac trackpad/mouse scrolling in Calendar and plan
timetables. The inherited `body { overflow-x:hidden }` computes vertical overflow
as `auto`. Combined with `overscroll-behavior-y:none` on that body-sized container,
wheel chaining stops before reaching the document. The grid itself can scroll,
but subsequent wheel gestures at its edge cannot move the page.

The `/web` stylesheet now scopes `overflow-x:clip`, `overflow-y:visible` and
`overscroll-behavior-y:auto` to `body:has(.sideseat-web)`. Horizontal clipping is
retained without creating the extra body scroll container. Public share/retained
routes, native code, grid selection handlers and business/API sources are unchanged.

Observed with real browser wheel input:

- Before: on the live1440x900 week view, inner scroll reaches567.5px but the
  document stays0 despite another downward gesture; document max is157px.
- After locally: inner scroll reaches567.5px, the next gesture moves the page to
 157.5px; scrolling up reaches inner0 and then page0.
- Plan timetable: inner scroll0→926, then page0→364; reverse gestures return
  inner0 and page0. A time-cell selection still changes its pressed state.
- After opening and dismissing the event dialog, there are0 open dialogs and
  page wheel scrolling still moves0→249px.
- The local390px login also reproduces the old wheel failure while keyboard End
  works; the correction restores wheel-up0 and wheel-down98.5px.

The existing active-checkout server PID8263/port3344 was reused. Its fresh socket
inspection confirms connections to127.0.0.1:15434. No server/database restart or
configuration change was made. One isolated local and one isolated production QA
account were each checked by ID/username and deleted with their owned timetable.
Old cookies return401; both owned public timetable APIs return404. Ordinary
accounts are outside this run.


## Release and final verification

All1,427 prior production source files were freshly checked against the retained
candidate cache. Only `app/web/web.css` is overlaid; one source marker is added.
All1,428 remote files match the expected manifest and1,426 baseline files remain
byte-identical. Database/schema, account APIs, native sources, branding and flags
are preserved. Compilation, lint/types and routes completed; the migration skip
is confirmed and `SIDESEAT_ACTIVITY_RELEASE=none` is retained.

Candidate checks confirm the compiled served CSS contains the scoped fix, the
existing production QA account is accepted and client configuration is unchanged.
After actual alias promotion, the same authenticated browser was reloaded and both
week-calendar and plan-grid wheel journeys were repeated on the public domain:

- Calendar inner384→567.5, then page0→157.5; reverse gestures return both to0.
- Plan inner0→926, then page0→364; reverse gestures return both to0.
- Closing the event dialog leaves0 open dialogs and wheel input moves page0→249.

All final measurements use Mac in-app browser at1440x900 and actual wheel inputs,
without script-setting scroll positions or injected DOM/CSS. The saved viewport
screenshots are1248x900 capture clips; they show the relevant main scroll areas,
not a complete pixel-width acceptance of the entire1440px page. The scope is Mac
browser wheel behavior, not physical trackpad hardware, Safari or phone UI.

The initial bounded CLI build-log output omitted its final completion line;
READY metadata and the latest MCP events independently show Deployment completed.
One initial post-refresh Week selector wait still saw Month; selecting Week from
the fresh state preceded the passing wheel run. These harness boundaries do not
change the production CSS correction or the measured scroll assertions.

Both own QA accounts and their owned polls are cleaned; no availability was
submitted or invitation sent. Production UI logout completed and the browser was
returned to sign-in. Temporary credentials are excluded from Git and removed after
the evidence scan. User `next-env.d.ts`/`tsconfig.json`, local3344/15434 services,
Preview260 and the separate pending phone supplement remain unchanged.

See [before live reproduction](../qa/evidence/2026-10-29-web-scroll/before-calendar-scroll.json),
[production calendar](../qa/evidence/2026-10-29-web-scroll/production-calendar-scroll.json),
[production plan](../qa/evidence/2026-10-29-web-scroll/production-plan-scroll.json),
[functional assertions](../qa/evidence/2026-10-29-web-scroll/verification.json),
[source proof](../qa/evidence/2026-10-29-web-scroll/remote-source-proof.json) and
[production cleanup](../qa/evidence/2026-10-29-web-scroll/production-cleanup.json).
