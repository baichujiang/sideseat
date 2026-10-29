# Web calendar/plan wheel scrolling — 2026-10-29

Status: reproduced on the live web release and fixed/verified locally; production
rollout is in progress under the owner's existing web publication authorization.
Reviewed baseline: `dpl_5BKA8W4f9ga7ZcQaQNP37zL2AxcD`.

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
account, each with an owned timetable, are reserved for exact cleanup after final
verification. Ordinary accounts are outside this run.
