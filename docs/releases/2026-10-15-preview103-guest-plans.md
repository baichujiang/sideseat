# Preview 103 — guest availability and web confirmation

Owner requested an external guest entry and editable voter nicknames, and chose
confirmation directly on the shared web page without download or registration.
Standing delivery authorization covers the required backend and phone Preview.
Active branch remains `codex/ios-uxui-20260922`; no archive or old product entry
was restored. No App Store/TestFlight upload.

## Delivered

- A shared plan link opens a guest page: enter a recognizable nickname, select
  date/From/Until ranges, save automatically, reopen and edit one's own answer.
  The name has an explicit pencil edit control. English/Chinese are available.
- Guests confirm/decline the exact invitation version on the web. Both collection
  and direct-time plans support this. All selected people must accept before
  confirmation; registered participants receive Sideseat Calendar rows containing
  the guests' names as companions. Guests return to the shared link for details.
- App participant/results/invitation lists show the same names with Guest badges.
  Native nickname editing changes only the current plan. The 101 single creation
  sheet and 102 tap/hold/scroll/undo behavior remain.
- Guests are poll-scoped rows, not global accounts. An HttpOnly cookie holds the
  random browser credential; the database holds its hash. A different browser is
  a separate identity. Invite-link holders can view the shared poll's names and
  availability; privacy text was updated. Personal Calendar data is not exposed.

## Git and backend

Backend/web/schema/OpenAPI source: `2285ad17c2d9a91a4f9a530816e170b2c26da271`.
Final native source: `827b570` (committed and pushed). The standalone phone test
runner was added in `9b8cbbd`; subsequent documentation and QA settings do not
change the installed app source.

Production: **Ready**, `dpl_6Un8qZtCE26v7edqKd2UBexBUHLx`,
[deployment](https://sideseat-devoivzdz-baichus-projects.vercel.app).
Both `api.sideseat.de` and `www.sideseat.de` were inspected and resolve there.
The candidate was tested before promoting this exact build; both public domains
then passed two-browser guest filling, renaming, confirmation and Calendar checks.
Candidate access used a temporary authenticated Vercel share link; no protection
setting was changed. Failed unauthenticated access was not counted as acceptance.

The controlled release context was rebuilt by checking all 1,323 actual previous
production source files. Twenty explicit overlays retain prior production-only
runtime differences. All 1,335 uploaded source SHA-1 values match the context;
no archive paths were uploaded. See the [manifest](../qa/evidence/2026-10-15-guest-plans103/source-manifest.json)
and [upload verification](../qa/evidence/2026-10-15-guest-plans103/upload-verification.json).

Before the single forward migration `20261015160000_time_poll_guests`, a consistent
read-only repeatable-read backup of **101 tables / 29,760 rows / 1,413,340 bytes**
was saved in existing private Blob storage and fully read back to verify SHA-256.
There were 150 prior applied migrations; existing migration history was preserved.
[Backup metadata](../qa/evidence/2026-10-15-guest-plans103/backup-summary.json).
One disposable account's credentials were emitted only as encrypted data and
recovered with an operator key stored privately. The account, test polls and
credentials were removed after verification; its token returned 401.

The nullable account identity is additive for old native payloads, but an old
server Prisma client cannot read guest rows. Any rollback must retain a guest-aware
service rather than blindly promoting the pre-103 server against guest data.

## Phone and actual verification scope

Signed **SideSeat Preview / app.sideseat.mobile.preview / 1.0.0 (103)** is installed
on **iPhone 14 Plus / iOS 26.6.1**, UDID `00008110-001A69110CC1401E`.
Identity, signing team, profile device inclusion and deep/strict signature checks
passed. Ordinary SideSeat **97** remains installed. Normal empty-argument launch
succeeded after acceptance attempts, with the separate QA runner removed.

Local verification passed: 5 real API/browser tests (including existing 5-account
and safety regressions), 5 domain tests, 4 native unit tests, TypeScript, focused
ESLint, 191-operation OpenAPI validation/generation, and the new native guest UI
flow on the simulator in **63.668 seconds**. See [QA](../qa/2026-10-15-guest-plans.md).

**Physical interaction acceptance is incomplete.** Three attempts (xctestrun with
both destination selections, then direct scheme execution) exited before entering
any test case. The runner reported IDE disconnection / exit 74 and a refused
XCTestDriverInterface channel. The phone was unlocked and connected through the
local network; installation and normal launch succeeded. No guest, creation or
gesture test on this physical build is claimed as passing. Simulator and live
web/API acceptance remain distinct evidence. The earlier 102 physical gesture
acceptance limitation is not retroactively marked resolved.

## Later physical acceptance — 2026-10-15

The connection limitation above was resolved in a later session after a fresh
wired device session and the owner's separate XCTest automation authorization.
On the same default iPhone 14 Plus, the real Safari → Preview → web confirmation
→ Calendar flow now passes (129.412 s), as do the single-sheet creation/cancel
regression (28.808 s) and both physical selection/scroll regressions (56.388 s /
23.338 s). [Physical QA and evidence](../qa/2026-10-15-iphone14plus-guest-flow.md).

Test/reproduction source `3eb3e3184657586cb986fc29320a0c97b95eb48d` is committed
and pushed. Installed native source remains `827b570`, Preview **103**; backend
remains `dpl_6Un8qZtCE26v7edqKd2UBexBUHLx` / `2285ad1`. No app feature source,
new build number or deployment was needed. The temporary account/polls were
deleted and its token returns 401; QA runner removed. Empty-argument Preview
launch and its running PID **694** were verified after cleanup, with ordinary
SideSeat 97 still installed. The earlier failed attempts remain historical facts.
