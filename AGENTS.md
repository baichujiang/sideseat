# AGENTS.md — Positive-First Development Protocol

## Active version and archive boundary — owner instruction 2026-10-15

- The active checkout is `/Users/baichu/Desktop/项目/app开发项目/Sideseat-ios-uxui`,
  branch `codex/ios-uxui-20260922`. Use this checkout explicitly. Do not switch to
  another Sideseat checkout, old chat working directory, release build directory
  or snapshot to infer the current product.
- Before editing, verify the repository root and working tree, fetch the remote,
  and preserve the current branch and unrelated work.
- Read `docs/DEPLOYED_STATE.md` before discussing or changing a deployed feature.
  Check installation, live deployment/flags, route reachability and visible labels;
  a source declaration or dated QA record alone does not prove a current entry.
- `archive/**` and `docs/archive/**` are frozen historical material. Do not edit,
  execute, build, deploy, restore or reuse their implementations/fixtures unless
  the owner explicitly requests recovery of that named archived feature. Do not
  fix archived code to satisfy current compilation, lint or tests.
- Retained compatibility surfaces listed in `docs/DEPLOYED_STATE.md` stay in place
  for existing clients/data and shared dependencies. Do not redesign, expose,
  reactivate, migrate or remove them as incidental cleanup. A direct owner request
  for that compatibility surface is required before changing it.
- Saved-card spacing in Preview 173 passed standard/maximum-text Simulator UI
  acceptance; physical-device installation and ordinary launch are verified.
- Preview 198 is the current installed development build. Shared plan headings
  keep title/share, status/location and adaptive date-zone/response-avatar tiers.
  Titles align at 20pt; remove duplicate top padding on confirmation/expiry;
  preserve tap targets, activity order, scroll anchors and invitation/Calendar rules.
  Reuse existing components. Source 806ec019 is pushed. Final long-content
  Chinese/German regular/largest checks passed 371.018s; eight-person regular/
  largest passed 25.053/28.667s. Uninterrupted phone journey passed 370.177s/eight
  API stages and six role/phase share checks, with exact unique Calendars.
  Failed 32.933/143.356/135.934s runs corrected test viewport, gesture placement
  and AssistiveTouch interception only; product stayed unchanged. Preserve scopes.
  Strict signature, 248 App/18 config-script/shared inputs, private Local and
  binary match, install and normal launch PID 7781 verified; ordinary 97 stays.
  Two accounts/three links, Runner/private files cleaned; no new App reports.
  No backend/web release or unit/domain/browser repeat; api/www Ready
  dpl_97Yg1PF8Pn2Fb3is5MJC4FNL3Cb7. Largest-text acceptance is heading/entry only;
  long text scrolls. Existing tall German dock, detail-grid blank and menu reset
  issues remain unresolved; expiry business was not rerun. See 198 QA/release.
- Preview 197 was the previous development build. Native plan sharing
  uses a compact summary, SSManagementRow App-friends destination and outlined
  web-share/copy utilities; regular side by side, accessibility stacked/scrollable.
  Keep contact permissions, URL payloads and invitation/Calendar rules unchanged.
  Forward dynamicTypeSize from the title share opener; first run failed 53.084s
  without it. Second run failed 99.662s because maximum German Copy needed scrolling;
  only test viewport handling changed, keeping strict whole-control boundaries.
  Final four language/size combinations passed 167.055s; uninterrupted phone
  journey passed 373.351s/eight API stages, six owner/participant phase share
  permission checks and exact unique Calendars. Source 0cc265c5 is pushed.
  Strict signature, 248 App/18 config-script/shared inputs, private Local match,
  install and normal launch PID 7721 verified; ordinary 97 stays. Two accounts/two
  links, Runner/private files cleaned; no new App reports. No backend/web release
  or unit/domain/browser repeat; api/www Ready dpl_97Yg1PF8Pn2Fb3is5MJC4FNL3Cb7.
  Largest-text acceptance is share-sheet only. Earlier menu-reset/manual-impact
  and German detail-grid blank issues remain unresolved and were not rerun.
  See 197 QA/release for actual scopes and inspected top/bottom images.
- Preview 196 was the previous development build. Creation reuses the
  current intention editor's Form/Section, grouped canvas/surfaces, Text.title,
  SSFlowActionDock and ssFlowSheet. Keep activity/location and dates/hours/ideas
  in two native groups; remove gray title plate and content action outlines.
  Existing input/date/create/share/invitation/Calendar rules remain. Accessibility
  hour/zone gap is locally 12pt after a real first-run spacing failure (37.348s).
  Source a1e350b7 is pushed. Final same-product four creation combinations passed
  108.185s, visible hour validation 49.788s, date clear/rapid/retention 108.845s,
  uninterrupted phone journey 328.834s/eight API stages with exact unique Calendars.
  Mixed date run failed 88.746s on an offscreen Form input query; test now scrolls
  back before strict value checks. Do not count the mixed suite as all passed.
  Earlier scrolling-menu reset/manual impact and German detail maximum-text blank
  remain unresolved and were not rerun here. Native 196, strict signature and
  248 App/18 config-script/shared inputs, private Local match, install and normal
  launch PID 7665 verified; ordinary 97 stays. Two accounts/one link, runner/private
  files cleaned; no new App reports. No backend/web release or unit/domain/browser
  repeat; api/www rechecked Ready dpl_97Yg1PF8Pn2Fb3is5MJC4FNL3Cb7. See 196 QA/release.
- Preview 195 was the previous development build. Native creation separates
  activity/location, candidate date/hour settings and optional activity ideas;
  name wraps visually and Return normalizes newlines/dismisses input. Expand the
  calendar directly under dates; retain centered Clear and move zone under hours.
  Reuse existing components and preserve validation/create/share/invitation rules.
  Source 982bf4e6 is pushed. Final product phone journey passed 329.095 seconds /
  eight API stages; creation four language/text combinations 109.288 seconds and
  date clear/rapid regression 101.995 seconds passed. Visible, unscrolled hourly
  validation/retention passed 47.798 seconds. The mixed run's scrolling hour case
  failed 41.666 seconds: video proves the menu reset before touch, cause/manual
  impact unproven. Do NOT call that issue fixed or count unscrolled checks as
  scrolling acceptance. German detail maximum-text blank also remains unresolved.
  Strict signature, 248 App/18 config-script/shared input checks, install and normal
  launch PID 7614 verified; ordinary 97 stays. Two accounts/one link, runner and
  private files cleaned; no new App reports. No backend/web release or repeated
  unit/domain/browser test; api/www rechecked Ready dpl_97Yg1PF8Pn2Fb3is5MJC4FNL3Cb7.
  See 195 QA/release for actual results, images and remaining menu observation.
- Preview 194 was the previous development build. Creation omits the
  read-only timetable; keep activity/location, candidate dates, daily voting hours,
  time zone and optional activity ideas. The original create/share path opens an
  editable detail timetable. Remove creation table state, rebuild observers and
  dead preview options; retain validation/idempotency and invitation/Calendar rules.
  Final same-product phone flow passed in 328.239 seconds/eight API stages; four
  creation language/text-size combinations passed in 69.351 seconds. Hours/date
  preservation passed in 57.505 seconds after fixing two test-only menu mis-taps;
  no product change or hidden failed-run claim. Source d3a6c066 is pushed.
  Strict signature, 248 App/18 config-script inputs/shared resource, installation
  and normal launch PID 7556 verified; ordinary 97 stays. Two accounts/one link,
  runner/private files cleaned; no new App reports. api/www rechecked Ready
  dpl_97Yg1PF8Pn2Fb3is5MJC4FNL3Cb7; no backend/web/model/domain/browser release/run.
  Maximum-text acceptance here is creation only. The 193 German detail grid blank
  issue remains unresolved; do not describe it as fixed. See 194 QA/release.
- Preview 193 was the previous development build. Native availability
  and final-time grids omit one-step Undo and its snapshot state, retaining tap,
  deselect, hold-paint/erase, day selection, manual submit/drafts and existing
  invitation/Calendar rules. Preserve the original scroll layout and hint row.
  Final same-binary uninterrupted phone journey passed in 328.056 seconds with
  eight API stages and exact unique Calendars; ordinary-size images inspected.
  Chinese/German maximum-text functional checks passed in 58.775 seconds, but
  German time cells still appear blank in the whole-screen image: maximum-text
  visual acceptance is NOT passed. Cause remains unproven; all attempted display
  refactors were reverted. See 193 QA before describing that issue as fixed.
  Source 8e713058 is pushed. Strict signature, 248 App/18 config-script inputs and
  shared resource, install and normal launch PID 7499 verified; generated project
  comes from the active project.yml. Ordinary 97 stays. Four accounts/five links,
  runner and private files cleaned; no new App crash/resource report. No backend,
  web, model/domain or browser rerun/release. See 193 QA/release for scope and the
  interrupted animation-wait test before the successful final run.
- Preview 192 was the previous development build. The shared detail
  heading puts the activity title and outlined share icon together, with status
  and location below; long text stacks naturally. Reuse the existing share sheet,
  inline editing and invitation/Calendar rules; remove the duplicate toolbar share
  and redundant role text. Chinese/German normal/maximum-text phone checks passed
  in 70.832 seconds, including share-sheet open/close and editing/cancel. The same
  product's uninterrupted phone journey passed in 145.690 seconds with six API
  stages and exact unique Calendars. Source d34ace39 is pushed. Strict signature,
  248 App/18 configuration+project inputs/shared resource, installation and ordinary
  launch PID 7394 verified; ordinary 97 stays. Two accounts/two links, runner and
  private files cleaned. No new crash/resource report or backend/web release;
  api/www rechecked Ready dpl_97Yg1PF8Pn2Fb3is5MJC4FNL3Cb7. No repeat domain,
  unit, activity/cross-day or browser execution; maximum text retains natural
  scrolling and the existing fixed footer. See 192 QA/release for actual scopes.
- Preview 191 was the previous development build. Creation configures
  one candidate timetable and opens sharing; remove the final/collection switch,
  creation selections, automatic owner submission and duplicate collection action.
  Reuse COLLECT and the existing detail/share/invitation/Calendar rules, including
  zero-response final selection and activity suggestions. Daily hours are visible
  in the compact information group; read-only cells expose no activation action.
  Final normal/maximum Chinese/German layout, hours and date regressions passed in
  82.433 / 43.447 / 104.827 seconds. Same-product phone journeys passed in
  142.227 / 319.696 / 245.149 seconds with 6 + 8 + 7 API stages and exact unique
  Calendars. Native 29/domain 16 checks passed. Seven retained presentation checks
  passed; one separate disposable-account helper test skipped, not counted as run.
  Source a06f08f6 and obsolete-test cleanup 14f12835 are pushed. Strict signature,
  248 App/18 configuration+project inputs/shared resource, install and ordinary
  launch PID 7351 verified; ordinary 97 stays. Six accounts/three links, runner
  and private files cleaned. No new crash/resource report or backend/web release;
  api/www rechecked Ready dpl_97Yg1PF8Pn2Fb3is5MJC4FNL3Cb7. See 191 QA/release
  for intermediate visual/AX issues and exact acceptance scopes.
- Preview 190 was the previous development build. One compact outlined
  Clear dates action is centered below the expanded calendar; one tap clears all
  candidate days and related time selections through the existing rebuild,
  retaining name/location. Empty selection disables Clear/Next; reselect normally.
  Product logic adds five view lines, no new state or request. Final normal/maximum
  text visual and clear/reselect regression passed in 129.287 seconds. The full
  clear-defaults/reselect-one-day App-contact invitation-to-Calendar phone journey
  passed in 141.232 seconds with six API checks and unique exact Calendars. Source
  01073277 is pushed. Strict signature, 248 App/18 configuration+project inputs and
  shared resource, install and ordinary launch PID 7207 verified; ordinary 97 stays.
  Four accounts/one link, runner and private files cleaned. No new crash/resource
  report, backend/web release or repeat unit/domain execution. api/www rechecked
  Ready dpl_97Yg1PF8Pn2Fb3is5MJC4FNL3Cb7. See 190 QA/release for the first screenshot
  gap and final visible-button check; functional assertions alone were insufficient.
- Preview 189 was the previous development build. Candidate date defaults
  and MultiDatePicker edits share one calendar/day identity; duplicate day keys
  cannot generate duplicate slot starts. Date editing unmounts the grid, and full
  day slots/cell clock formatting are reused. Final/availability drafts still map
  by actual instants; existing invitation and Calendar rules remain. The real
  188 crash was read and reproduced with two taps; the earlier expand/collapse
  check had missed date editing. Final 189 date-limit/normal+maximum-text rapid
  regression passed in 102.807 / 116.438 seconds. Direct/collection full phone
  journeys passed in 181.942 / 324.016 seconds with 6 + 8 API checks and exact
  unique Calendars. Native 29/domain 16 checks passed. Source c439e254 is pushed.
  Strict signature, 248 App/18 configuration+project inputs/shared resource,
  installation and ordinary launch PID 7149 verified; ordinary 97 stays. Four
  accounts/two links, runner and private files cleaned; date diagnostic cleared.
  No new fatal crash log; automated timetable AX reads emitted a non-terminating
  CPU resource diagnostic, recorded separately in QA. No backend/web release;
  api/www still resolve to Ready dpl_97Yg1PF8Pn2Fb3is5MJC4FNL3Cb7. See 189 QA/release.
- Preview 188 was the previous development build. Plan creation groups
  activity name, location, candidate dates and the optional idea checkbox into
  aligned outlined rows; compact dates keep years when needed. Its timetable
  heading combines legend and undo; focused inputs hide the creation dock.
  Fixed-size icons and information text through accessibility1 keep maximum-text
  rows intact. Existing defaults, drafts, invitation and Calendar rules remain.
  Final same-binary direct/collection/activity phone journeys passed in
  179.715 / 336.617 / 267.545 seconds with 6 + 8 + 7 API checks and exact unique
  Calendars. Ordinary/maximum Chinese/German layout passed in 185.321 seconds;
  date expansion and input/selection retention passed in 36.029 seconds.
  Native 27/domain 16 checks passed. Source 8e3929ac is pushed. Strict signature,
  248 App/18 configuration+project inputs and shared Calendar JSON, install and
  ordinary launch PID 7027 verified; ordinary 97 stays. Six accounts/three links,
  runner and private launch files cleaned. No backend/web release; api/www
  still resolve to Ready dpl_97Yg1PF8Pn2Fb3is5MJC4FNL3Cb7. See the 188 QA/release;
  the earlier skipped activity dispatch is recorded and not counted as execution.
- Preview 187 was the previous development build. Creation opens the
  shared timetable directly; remove the standalone fixed-time date/duration/count
  branch. Amber final time leads to roster review and explicit invitation; the
  secondary green availability path retains both drafts and existing rules.
  Preserve unsubmitted creation availability in the existing per-account store.
  Activity composition hides its timetable dock and share toolbar until Confirm
  or Cancel, and maximum-text bounded/final day headers use 72pt.
  Direct/collection/final-activity real phone journeys passed in 176.251 / 323.090 /
  267.994 seconds with 6 + 8 + 7 API stages and exact unique Calendars. The first
  two precede only the corresponding display corrections; final activity reran
  on the installed binary. Native 27/domain 16 checks and Chinese/German maximum
  text 98.919 / 23.454 seconds passed; see QA for actual artifact scopes.
  Sources b6d88e07 and 84935662 are pushed. Strict signature, 248 App/18 config
  inputs and shared Calendar JSON, install and ordinary launch PID 6899 verified;
  ordinary 97 stays. 18 accounts/11 links, runner and private launch files
  cleaned. No backend/web release; production dpl_97Yg1PF8Pn2Fb3is5MJC4FNL3Cb7
  and api/www aliases were rechecked Ready. See the 187 release and QA.
- Preview 186 was the previous development build. Tap the activity name
  or location directly in the heading; inputs and explicit Save/Cancel stay in
  place. The redundant Edit button and information sheet were removed. Editing
  hides the availability dock and sharing menu so they cannot cover input actions.
  Availability drafts and existing metadata permissions/invitation rules remain.
  The real App-contact flow passed in 321.127 seconds with eight API stages and
  exact metadata/time in both unique Calendar entries. The last contrast/short
  Save label correction separately passed Chinese/German maximum text in 23.948
  seconds; do not claim the earlier full flow used that final binary. Source
  50b47ca5 is pushed. Strict signature, 248 App/18 configuration inputs and shared
  Calendar JSON, install and ordinary launch PID 6754 verified; ordinary 97 stays.
  Two accounts, two links, runner and private launch data cleaned. No backend/web
  release; production dpl_97Yg1PF8Pn2Fb3is5MJC4FNL3Cb7 was rechecked Ready.
  See the 186 QA/release for visual acceptance and actual verification scopes.
- Preview 185 was the previous development build. Final time reuses
  timetable tap/toggle/hold-drag/erase/undo with amber square checks, leaving
  personal availability green. Whole candidate dates support cross-midnight
  intervals; unknown availability is a dash and never counted as free. Keep one
  continuous interval; disconnected drafts stay editable with review disabled.
  Old movable/resizable block and separate clock/date controls were removed.
  Native 24 tests, backend 11 tests and candidate/production Chromium/WebKit flows
  passed. One uninterrupted real App-contact journey passed in 292.305 seconds
  with eight API phases and both exact two-hour Calendar entries. The final
  legend-only correction separately passed Chinese/German largest-text UI in
  18.442 seconds; do not claim the earlier full flow used that final binary.
  Source 50d8fb51 and backend cc12cc34 are pushed. Production is
  dpl_97Yg1PF8Pn2Fb3is5MJC4FNL3Cb7: only two backend files and a source marker
  over 1392 verified production inputs, no migrations. Strict signature, 248 App
  inputs plus 18 configuration/script inputs and shared Calendar JSON, install
  and ordinary launch PID 6692 verified; ordinary 97 remains. Six disposable
  accounts, ten links, runner, private launch data and candidate cookie cleaned.
  See the 185 QA/release for the exact verification scopes and inspected images.
- Preview 184 was the previous development build. Response counts are
  plain information outside the avatar action; keep 0/2/8-person separation and
  the full people list. Section pickers use one boundary and a filled selection;
  compact actions are soft capsules, icon actions circular, primary actions solid.
  Section labels stop at xxxLarge to keep the picker compact. Four phone UI checks
  passed (92.570 / 3.998 / 29.926 / 25.556 seconds). The same real plan completed all
  eight API stages in segments: the main run hit login throttling after acceptance;
  publication and the final real participant Calendar check (24.792 seconds) were
  continued. Do not claim a single uninterrupted full run. Strict signature,
  248 App inputs plus 18 configuration/script inputs, install and ordinary launch
  PID 6256 verified; ordinary 97 remains. No web/backend release in this stage.
  Two disposable accounts, four links, runner and private launch data were cleaned.
  See the 184 QA/release for failed harness attempts and actual screenshots.
- Preview 183 was the previous development build. Actions fit their
  content with separate regular/compact/icon/toolbar metrics and real inset;
  standard Cancel/Done/Save toolbar actions use localized accessible icon labels
  and no duplicate iOS 26 background. Calendar controls and custom-sized surfaces
  no longer stack button chrome. Two phone journeys passed (204.847 / 203.428
  seconds, 7 + 8 API stages) on the shared sizing implementation. Final navigation
  UI passed three phone checks (91.408 / 37.831 / 4.064 seconds); the last compact
  final-time control correction separately passed normal/maximum-text checks
  (26.880 / 44.636 seconds). Keep those artifact scopes distinct.
  Strict signature, 248 inputs, install and ordinary launch PID 6158 verified;
  ordinary 97 remains. Production `dpl_3QAxBxySh4RLrQYf849ozaqdmZEz` changes
  only one share CSS over verified production. Six browser journeys passed;
  four final runs assert text/SVG insets and intact narrow/large short labels.
  Sixteen disposable accounts, twenty-seven links, runner and private files were
  cleaned. Passing functional tests alone is not visual acceptance: inspect the
  actual text, border, padding and toolbar screenshots before calling it complete.
- Preview 182 outlined actions remain included. Standalone actions use
  shared visible outlines, including compact text/icon actions; primary fill,
  destructive semantics and existing interaction rules remain. Five-tab/forms/auth
  phone smoke passed in Chinese/light, English/dark and German/dark maximum text.
  Two real phone journeys passed (206.924 / 206.314 seconds, 7 + 8 API stages).
  A final icon-only review-return correction passed a separate 39.355-second
  three-language phone check; do not describe earlier journeys as its rerun.
  Strict signature, 248 native inputs, install and ordinary launch PID 6071 are
  verified; ordinary 97 remains. Production is
  `dpl_F6DMSv9jgcpZEmPoSNsQZk98rMJd` (two share-UI files over verified production).
  Five real browser journeys passed, including final production light/dark.
  Sixteen disposable accounts, twenty-three links, runner, private launch files
  and candidate cookie were cleaned. See the 182 QA/release for exact scope.
- Preview 181 activity completion remains included. Activity input supports
  local suggestion chips and hardware Tab completion; explicit Confirm still
  submits. Final real-phone full flow (208.527 seconds / seven API stages), the
  focused largest-text fix (27.042 seconds), and four final browser journeys passed.
  Strict signature, install and ordinary launch PID 5991 are verified; ordinary
  97 stays installed. Production is `dpl_9WUXBm5orPvRbgpnvbJh8kczs5sR` (one UI
  file over verified production). Fourteen disposable accounts, nineteen links,
  runner, private launch files and candidate cookie were cleaned.
- Preview 180 activity board behavior remains included. Activity suggestions
  use a compact two-column board, with Suggest/Confirm on the header right and
  the composer above the board. Accessibility sizes use one column and concise
  header labels. The final 194.030-second real-phone journey and seven API stages
  passed; candidate/production Chromium and WebKit each passed the full journey.
  Strict signature, installation and ordinary launch PID 5895 are verified.
  Share UI is deployed as `dpl_Gsjh8qTdCVimd1FYZnCpKCkht48D`; twelve disposable
  accounts and eighteen links, runner and private launch files were cleaned.
- Preview 178 was the former final-time design, superseded by 185. It used one
  movable/resizable block with direct date/start/end controls. Twenty-four unit
  checks, the App-contact and App/Safari full journeys (8 + 7 API stages), and
  final Chinese/German largest-text checks passed. Ordinary launch PID 5015 is
  verified. Invitation and Calendar rules remain unchanged; see the 178 QA record.
- Preview 177 guest identity remains included. Guests use independent
  private credentials and personal recovery links without registration; names and
  unsigned participant-ID cookies cannot claim records. Existing verified random
  credentials upgrade in place; organizers can reissue only unclaimed old records.
  Candidate and production each passed four Chromium/WebKit browser/data flows.
  Old-record recovery generation/copy passed Chinese and German largest-text tests
  on the default iPhone 14 Plus. The 177 ordinary launch PID 4343 was observed.
  Preview 176 invitation header legends and Preview 173 saved-card changes are
  retained. Prior invitation-layout tests and the App plan journey retain their
  separately recorded scope; see `docs/DEPLOYED_STATE.md`. Ordinary
  SideSeat/TestFlight 97 remains installed and API compatible; do not uninstall it.
- The deployed backend contains preserved production differences from this Git
  snapshot. Use the recorded comparison before a future release; never replace
  production with the entire local checkout on the assumption that they match.
- Keep dated release and QA verdicts as evidence. Add new verification records;
  do not promote old screenshots, disabled flags or proposed designs to deployed
  functionality. The owner approved manual unified planning (time collection →
  invitation → individual response → organizer send → Calendar) on 2026-10-15; see
  `docs/UNIFIED_PLANS.md`. Discovery Pod and archived group routes stay frozen.

## Owner delivery rule — 2026-10-03

The owner requires every completed modification stage to be traceable in Git and
available in the phone Preview, rather than accumulating local-only changes.

- After relevant verification, make a focused commit for each completed stage and
  push the current branch to GitHub. Include related tests and documentation.
- Update the native phone Preview for user-visible app changes. Release required
  backend dependencies through the documented release procedure before installing
  a client that depends on them. This standing instruction does not authorize
  App Store submission or TestFlight distribution.
- Record the commit SHA, Preview build number, relevant backend deployment ID,
  and actual install/launch verification in `docs/releases/`. Distinguish committed,
  pushed, backend deployed, and device installed; never use “done” for all four
  when only local implementation has finished.
- Keep unrelated unfinished work and credentials out of a stage's commit. Preserve
  the current branch and other local edits. Historical catch-up commits must say
  they capture an existing release/snapshot, without inventing past commit dates.

## Core Philosophy

This repository follows a **Positive-First, Execution-First** development philosophy.

Prioritize:

1. Correct working end-to-end behavior.
2. Real execution and integration.
3. Simple, direct implementation.
4. Fixing concrete observed problems.
5. Evidence-driven robustness.

The default question is:

> “How do we make the intended behavior work?”

not:

> “How many ways could this theoretically fail?”

---

## 1. Build the Primary Path First

Implement the simplest complete version of the requested behavior.

Prefer:

```text
intent
→ implementation
→ integration
→ run
→ observe
→ fix concrete problems
```

Do not begin with:

* exhaustive edge-case analysis
* speculative validation
* large failure-handling matrices
* generalized error frameworks
* compatibility layers
* premature abstractions
* extensive negative tests
* future-proofing

Get the intended flow working first.

---

## 2. Prefer Execution Over Speculation

If a question can be answered cheaply by running the code, run it.

Prefer:

```text
run
→ observe
→ understand
→ fix
```

over:

```text
imagine
→ speculate
→ defend
→ add complexity
→ eventually run
```

Runtime evidence outranks hypothetical reasoning.

Do not recursively invent failure cases for hypothetical failure cases.

---

## 3. Complexity Must Earn Its Place

The burden of proof is on adding complexity, not omitting it.

Do not add guards, retries, fallbacks, wrappers, abstractions, compatibility code, generalized validation, or configuration merely because they might someday be useful.

Add them when justified by concrete evidence such as:

* explicit requirements
* actual external contracts
* observed failures
* known regressions
* realistic operating conditions
* security boundaries
* meaningful data-loss risks

If there is no concrete reason, prefer the simpler implementation.

---

## 4. Validate at Real Boundaries

Validation is most useful at trust boundaries such as:

* user input
* HTTP/API input
* filesystem input
* network responses
* databases
* third-party services
* authentication/authorization
* deserialization
* irreversible operations

Prefer:

```text
validate once
→ establish invariant
→ trust invariant internally
```

Do not repeatedly validate the same invariant throughout trusted internal code.

Internal functions do not need to defend against every imaginable misuse.

---

## 5. Avoid Speculative Defensive Programming

Do not automatically:

* wrap every operation in `try/catch`
* add retries to every network operation
* create fallback behavior without a requirement
* silently swallow errors
* fabricate default or fake-success data
* support callers that do not exist
* build abstractions for hypothetical future requirements
* add configuration for behavior that currently has one requirement
* refactor unrelated working code
* create infrastructure “while we are here”

Prefer clear failures over speculative recovery when correct continuation is impossible.

Observability is encouraged.

Hidden failure is not.

---

## 6. Keep Implementations Direct

Prefer narrow, understandable code over generalized architecture.

Temporary duplication is acceptable when abstraction would slow down or obscure the primary implementation.

Prefer:

```text
real repetition
→ obvious common concept
→ abstraction
```

over:

```text
possible future repetition
→ speculative abstraction
```

Do not build a framework when a function is sufficient.

Do not modify code for hypothetical future callers.

Future requirements can justify future changes.

---

## 7. Testing Priorities

Testing priority is:

1. Main success path.
2. Important alternate success paths.
3. Real integration behavior.
4. Known regressions.
5. Realistic boundaries.
6. Explicitly required failures.
7. Additional negative cases only when justified.

Do not generate negative tests simply because more invalid inputs can be imagined.

Do not optimize for test count or coverage percentage.

Tests should protect meaningful behavior.

Prefer real execution paths over excessive mocking.

Do not complicate production architecture solely to make speculative tests easier to write.

---

## 8. Evidence-Driven Hardening

Hardening should follow evidence.

Prefer:

```text
observed problem
→ understand cause
→ targeted protection
```

over:

```text
imagined problem
→ broad defensive framework
```

Useful evidence includes:

* runtime failures
* failing tests
* logs
* production incidents
* user reports
* API documentation
* reproduced bugs
* security requirements
* actual integration behavior

Add robustness progressively as reality demonstrates the need.

---

## 9. Deferral Is Allowed

Not every foreseeable issue must be solved during initial implementation.

Non-blocking robustness concerns may be deferred to later:

* testing
* review
* QA
* hardening
* follow-up work

Recognizing a possible problem does not create an obligation to solve it immediately.

Prefer deferral when solving the concern now would add complexity without helping the intended behavior succeed.

Deferral means:

> not now

not:

> never

Concrete problems discovered later should be fixed normally.

---

## 10. Keep Scope Focused

When asked to implement feature X, implement feature X.

Do not automatically expand the task into:

* architecture redesign
* security audits
* dependency replacement
* generalized infrastructure
* repository-wide refactoring
* speculative scalability work
* unrelated cleanup
* future-proofing

Adjacent changes are appropriate only when necessary for the requested behavior.

---

## 11. Security and Data Safety

Positive-first development does not override concrete security or data-safety requirements.

Address obvious high-impact risks involving:

* authentication
* authorization
* secret exposure
* injection
* destructive operations
* irreversible data loss
* unsafe migrations
* corrupted persistent state
* untrusted code execution

Security work should remain proportional to the actual threat model.

Do not use “security” as justification for unlimited speculative complexity.

---

## 12. Completion and Stop Rule

A task is normally complete when:

* the requested behavior is implemented
* the primary flow works
* relevant integration works
* relevant existing tests pass
* meaningful positive verification succeeds
* no known blocking defect remains
* required contracts are respected

Completion does not require exhaustive hardening or handling every imaginable invalid state.

Once these conditions are satisfied:

> **STOP.**

Do not invent additional work.

Do not automatically add more:

* validation
* edge-case handling
* abstractions
* refactoring
* compatibility code
* tests
* configuration
* infrastructure
* future-proofing

A completed task is allowed to remain complete.

---

## Default Decision Bias

When uncertain:

```text
simple implementation
>
speculative defensive implementation
```

```text
run the code
>
reason about hypothetical failures
```

```text
finish the requested feature
>
improve surrounding infrastructure
```

```text
defer optional hardening
>
add complexity just in case
```

```text
working real behavior
>
theoretical completeness
```

---

## Final Directive

**Build forward.**

Implement the intended behavior first.

Run real code early.

Prefer execution over speculation.

Trust established invariants.

Validate at real boundaries.

Keep implementations direct.

Do not solve imaginary problems.

Let evidence drive hardening.

Defer non-essential robustness.

Require complexity to justify itself.

When the requested behavior works and relevant verification succeeds:

**STOP.**
