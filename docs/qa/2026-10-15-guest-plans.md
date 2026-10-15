# Guest plans QA — 2026-10-15

Source: backend `2285ad1`, native `827b570`; Preview 103. Production deployment
`dpl_6Un8qZtCE26v7edqKd2UBexBUHLx`. Synthetic QA only; no messages were sent.

## Passed

- Isolated PostgreSQL database `sideseat_guest103`: forward migration, Prisma
  validation and generation. Existing account rows retain their identity.
- Existing native poll API regression, five-account confirmation/Calendar flow,
  four-person roster excluding the fifth, Block/account-deletion cleanup: 4 tests.
- New two-browser UI integration: guest join without global accounts, range entry,
  autosave, own nickname editing/reload, cookie attributes, rejection of another
  participant identity and cross-origin write, and native authentication isolation.
  Shared names/availability reach the native API; each guest confirms on the web.
  Calendar stays empty until all selected people accept, then only the account
  holder gets one row with two named guest companions. Closed nickname edits are
  rejected. Direct-time guest decline and acceptance are covered too.
- 5 domain tests, including complete windows and repeated DST hours. TypeScript
  and focused ESLint: no errors. OpenAPI matches 191 v1 operations and generation
  reports no diagnostics. React review covered hooks, refresh/autosave ownership,
  labelled forms, keyboard buttons and 44/48-point touch controls.
- Four native TimePoll unit tests pass. Simulator guest UI test passes in 63.668 s:
  explicit native name edit, guest result/roster badges, sending invitations,
  registered nickname edit during invitation, guest web-API rename and acceptance,
  native confirmed reopen, no premature Calendar, final Calendar entry.
- Candidate deployment, public API domain and actual www share domain each pass
  the complete two-browser collect/rename/confirm flow. `/privacy`, `/support`,
  AASA and client config return 200; frozen `/discover` still redirects to `/ios`.
- All 1,335 uploaded files match the controlled source. Prior production runtime
  differences and archive exclusions remain. Backup readback and migration pass.
- Default phone identity/profile/signature, installed Preview 103 and retained
  ordinary 97 verified; normal launch succeeds. Temporary account and all test
  polls deleted; deleted-account token returns 401. QA runner removed.

## Physical automation limitation

No physical UI test entered a test case. Three attempts ended during bootstrap
with IDE disconnection / runner exit 74 and refused XCTestDriverInterface channel.
Changing the destination architecture and using the generated scheme did not
resolve it. The connected iPhone 14 Plus was unlocked and used a local-network
CoreDevice transport. These failures are test-infrastructure failures, not a
passing functional verdict. The physical gestures/new-plan regressions and guest
UI acceptance remain unverified for 103. Existing 101 physical evidence and 102
simulator evidence retain their original dates and limitations.

Screenshots below are synthetic browser/simulator QA, not physical acceptance:

- [Web availability](./evidence/2026-10-15-guest-plans103/guest-availability.png)
- [Web confirmed](./evidence/2026-10-15-guest-plans103/guest-confirmed.png)
- [Chinese direct-time confirmation](./evidence/2026-10-15-guest-plans103/guest-direct-confirmed.png)
- [Native guest results](./evidence/2026-10-15-guest-plans103/simulator-guest-results.png)
- [Native confirmed](./evidence/2026-10-15-guest-plans103/simulator-guest-confirmed.png)

The first local browser attempt exposed an origin mismatch between Next's internal
URL and the actual browser host. The origin check now uses forwarded host/protocol;
the complete browser flow passed after that fix. Initial Vercel candidate 401 was
deployment protection; temporary authenticated access was used for acceptance.

## Later physical follow-up — same day

After the owner completed the separate XCTest automation authorization on the
wired iPhone 14 Plus, the complete Preview/Safari guest UI flow passed in
129.412 s. Plans creation/cancel (28.808 s) and both physical gesture regressions
(56.388 s / 23.338 s) also passed. API assertions verified no premature Calendar,
final edited names, the same guest response and exactly one final Calendar row.
The original bootstrap failures above remain the initial-delivery verdict.
See [the new physical record](./2026-10-15-iphone14plus-guest-flow.md) for source,
passing screenshots, cleanup and normal-launch evidence.
