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
