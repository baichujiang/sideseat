# Unified planning verification — 2026-10-15

Authority: owner requested implementation, required backend release, phone Preview
update, full five-person QA and current-branch GitHub push. Archives stay frozen.
Source base: `a5904fc`; active branch `codex/ios-uxui-20260922`.

## Verified locally

- 4 real API tests pass: existing native polls; five-person common/maximum,
  conversion/decline/reinvite/stale version/individual confirmation; explicit
  four-person roster excluding the fifth; Block and participant deletion cleanup.
- All 394 native unit tests across 64 suites pass, including login-generation
  autosave isolation. Their fixture now supplies a loaded collecting poll, matching
  the actual UI requirement; invite links now correctly target Plans.
- Eight domain and prior Calendar projection tests pass. TypeScript, focused
  ESLint, OpenAPI 190-operation validation and Swift generation pass.
- Complete native UI test passes on SideSeat UX QA simulator: real login as five
  accounts, Plans creation, five grid fills/autosave, 5/5 common → 4/5 maximum →
  restored common, explicit invitations, four individual acceptances after creator,
  no premature Calendar entry, five persisted Calendar entries with four companions
  each, five-account Upcoming reopen, Calendar search/read-only detail/Manage Plan.
- Direct-time creation/confirmation and Chinese dark/accessibility launch pass.
  Visual review found a truncated English timing segment; labels were shortened
  to Collect availability / Set a time and rechecked before delivery.
- All 68 archived file hashes match; no archive content is changed or executed.

The first UI attempt found an accessibility identifier inherited by the nested
invite button; the result card now contains its children correctly. A later check
needed to scroll the medium Calendar sheet to reach Manage Plan. Neither failed
attempt is represented as a passing acceptance. Repeated local logins reached the
existing 429 limit; only the isolated local QA database's login counters were reset,
with production limits unchanged.

## Delivery verification

Backend candidate and production five-account smoke both pass. Exact deployment:
`dpl_4vBvPch35jxdarqmgnxmvSsGSt6u`; both production domains resolve there.
All 1,323 uploaded source hashes match the controlled context; archives and seven
retired original source paths are excluded.

Physical Preview 100 acceptance: five-account full flow **321.509 s**, direct-time
and Chinese dark/accessibility **60.562 s**, zero failures. Result bundle:
`/tmp/sideseat-unified-phone100-flow.xcresult`. These tests used source `7657176`.
The later native-only caption correction `6d5e6b5` passed 394 Swift Testing cases
and the live simulator Calendar route/caption test (**27.108 s**); final signed
Preview 100 was reinstalled and launched with empty arguments, PID **32089**.
Full five-person phone flow was not repeated for that single text correction.

Five temporary accounts and all QA polls were removed, and all five deleted-account
tokens returned 401. Ordinary SideSeat 97 remains; the temporary QA runner was
removed. See the [release](../releases/2026-10-15-preview100-unified-plans.md),
[receipt](./evidence/2026-10-15-unified-plans/delivery.json) and
[phone screenshots](./evidence/2026-10-15-unified-plans/phone/five-confirmed.png).
All screenshots/fixtures are synthetic QA and not product engagement evidence.
Calendar sync in this acceptance is Sideseat Calendar; external Apple/Google
write-back is not enabled by this feature.
