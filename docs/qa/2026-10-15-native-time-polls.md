# Native time poll verification

2026-10-15, Europe/Berlin. User explicitly chose native Sideseat UI and own data.

Verified story: Messages → native create/date/range form → authenticated v1 API →
PostgreSQL poll/response → native selection, autosave, attendance results → reopen.

- Domain: 4 tests passed, including five-person common/best times, empty response,
  same count with different people, and the repeated DST hour.
- Local PostgreSQL + HTTP: 1 five-account flow passed. Creation replay retains the
  same poll; all five own answers save; common hour is 5/5; erasing the fifth's
  common hour yields 4/5; all five reopens retain their own selections. List access,
  authentication, own-response uniqueness, invalid slot and creator-only deletion
  were checked against the real API/database.
- Native final simulator run: 3 Swift tests and 1 five-account UI test passed.
  The UI case took 201.465 seconds. It creates from the native form, paints and
  erases with actual gestures, checks automatic save acknowledgement and server
  state, then terminates/relaunches for all five recent-poll reopens. It also checks
  native Copy link / Share poll controls. Result:
  `/tmp/sideseat-native-poll-simulator-4.xcresult`.
- QA shell/tutorial/inbox use existing DEBUG fixtures with ephemeral credentials;
  time polls themselves use actual account bearer tokens and real HTTP/storage.
  Production login behavior and owner Keychain data are not replaced.
- Early test preparation failures: the write DTO initially lacked test decoding;
  Swift 6 actor isolation was corrected in the UI runner; injecting real users into
  the fixed-ID shell fixture prevented readiness from matching. The final harness
  retains the shell fixture identity and injects only real poll API tokens. These
  earlier attempts are not counted as successful UI verification.
- Swift 6 simulator build, TypeScript, focused ESLint, 187-operation OpenAPI check
  and all 13 contract tests passed. After visual inspection, the grid width was
  adapted to date count and heatmap intensity reduced for dark-mode contrast;
  the delivered device run validates the final version.

Backend release and physical-device completion are recorded in
[Preview 99 release](../releases/2026-10-15-preview99-native-time-polls.md).

## Initial physical Preview 99 validation

- Installed and normally launched Preview 99 on iPhone 16 Pro Max / iOS 26.0.1.
- Five-account native UI flow passed in 191.232 seconds, 0 failures: native create,
  name entry, rectangular paint, single cell, erase, actual autosave acknowledgements,
  5/5 common hour, 4/5 best hour, then full app termination and each account's own
  recent-poll reopen. All selected cells, names and group results matched the API.
  Copy link / Share poll controls were visible in the native menu.
- A separate physical case passed in 31.201 seconds: five candidate dates,
  rectangular selection spanning two dates, horizontal scrolling with time labels
  kept visible, vertical scrolling without altering selection, Chinese/dark results.
- Final result bundles: `/tmp/sideseat-native-poll-phone99-3.xcresult` and the
  multiple-date case in `/tmp/sideseat-native-poll-phone99-2.xcresult`.
- Physical preparation failures remain recorded: runner-only project initially
  instantiated XCUIApplication without an explicit target, so no business test ran.
  The next five-person run completed all data assertions but its last menu tap was
  intercepted by a system notification banner. It is not counted as a passed case.
  The final test dismisses an existing banner and waits for the menu; its rerun
  passed. No app source or installed app was replaced for these harness repairs.
- Candidate and promoted production each passed the five-account HTTP/storage
  smoke, native browser handoff and config/AASA/privacy/support checks. The final
  candidate was promoted as-is; no deployment protection was disabled.
- Both physical screenshots and the delivery receipt were reviewed. All five
  temporary accounts were deleted; their polls were already deleted by teardown.
  The app was relaunched with no QA arguments; Build 99 and PID 30057 were read
  back from the device. Owner Keychain credentials use the normal path again.

QA harness source: `de0f312ac1638e88fb3852864f6f6bd19d331770`, pushed to the current branch. The installed
app source is `5cbba4df77b2683bd4cd3a528125f158a9278310`.

Evidence: [delivery receipt](./evidence/2026-10-15-native-time-polls/delivery.json),
[5/5](./evidence/2026-10-15-native-time-polls/phone/five-common.png),
[4/5](./evidence/2026-10-15-native-time-polls/phone/four-best.png),
[Chinese dark multi-date view](./evidence/2026-10-15-native-time-polls/phone/chinese-dark-multiple-dates.png).

## Final account-scope repair

A queued autosave could outlive its original session. The final client captures
both login generation and account ID, drops queued work on an account change,
and prevents unauthorized JSON requests from refreshing/retrying under a new
account. The regression suspends the old request, switches accounts, then releases
both a successful response and a 401; only the original write occurs and no new
account refresh is attempted. All 16 time-poll/authentication tests passed,
including ordinary authorized-write refresh and shared concurrent refresh.
Result: `/tmp/sideseat-native-poll-account-scope-complete.xcresult`.
Source: `02300a46027c8f0a1952561098f0169d98cbe9be`, committed and pushed. The final
physical retest and receipt below supersede the initial client-source receipt.

Final account-scoped client physical rerun: **2 passed, 0 failures**. The five-person
case took 194.015 seconds and the multi-date Chinese/dark case 31.213 seconds.
Both are in `/tmp/sideseat-native-poll-phone99-final.xcresult`; screenshots and
`delivery.json` have been replaced with this final source's evidence. Normal launch
has no test arguments, Build 99 and PID 30126 confirmed. Both temporary
five-account sets have been removed. Task-only local server/database were stopped
and the isolated test database removed. No owner credentials or real poll data
were deleted.
