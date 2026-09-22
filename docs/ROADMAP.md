# SideSeat Roadmap

**Status:** Active dependency roadmap

**Last updated:** 2026-09-09

**Governing product:** [Product](./PRODUCT.md)

**Current release:** [Discovery-first Together](./DISCOVERY_FIRST_MATCHING.md)
replaces activity/time/language/school/course exclusions with relevance ranking
and explicit card differences. Missing historical feedback no longer blocks
ordinary discovery; privacy, safety and explicit refusals remain protected.
The local 0/100 two-account flow reaches chat, an accepted Plan and both Calendars.
Backend regressions and native acceptance pass: 26 combined PostgreSQL/pure
checks, 46 native tests and both three-language/empty-state UI checks.
Source/Build 40 preparation `f7d5939` is pushed. Discovery is now ON after
[owner-authorized activation](./releases/2026-09-09-discovery-matching-production.md);
automatic/flexible timing remain ON, with no migration or user fixture writes.
[Build 40](./releases/2026-09-09-testflight-40.md) is processed and available in
`SideSeat Internal`. The owner confirmed both phones updated to **1.0.0 (40)**;
candidate and production two-account configuration/login/read smoke passed.
Next: reopen both apps to refresh configuration → explicit intention publication
→ signed two-account acceptance. The original App Store testing notes still
describe the flags-OFF release; use the activation record above for current steps.
Build 39 does not contain this follow-up.

**Included publication flow:** [Event-driven automatic matching](./INTENT_DRIVEN_MATCHING.md)
replaces the new client's separate Start/48-hour session with explicit publication
and per-intent pause/resume/end. Implementation and 15 real local PostgreSQL checks
pass; all 4 native model tests and 3 UI tests pass, including the final German
largest-text follow-up. Evidence is recorded in the feature document above.
Feature `46b0e7a` and Build 39 preparation `503e827` are pushed; both migrations
and the production backend are deployed. Automatic/flexible flags are now ON
after owner-authorized [activation](./releases/2026-09-09-automatic-matching-production.md).
[Build 39](./releases/2026-09-09-testflight-39.md) is processed and available in
`SideSeat Internal`, with testing notes saved.
Next: both phones update to Build 40 and reopen the app → explicitly publish
intentions → signed two-account acceptance.

**Current flexible timing:** [Flexible intention timing](./FLEXIBLE_INTENT_TIMING.md)
adds tomorrow/weekend/next-week/date-range/undecided timing, a 14-day intention
lifecycle, separate activity fit and timing, and explicit time confirmation in the
Plan composer. Initially verified on a dedicated localhost database; real
two-account service flow through both Calendars passes. Native verification is
complete: 6 model tests and 3 UI tests pass, including Chinese/English and German
largest text. The final simulator result is `/tmp/sideseat-flexible-timing-ui-7.xcresult`.
The focused German wrapping/translation follow-up also passes in
`/tmp/sideseat-flexible-timing-ui-8.xcresult`.
Source `71e5241` is pushed and now deployed with rollout ON; included in the
available internal Build 39 and the Build 40 package, not Build 38. Next: both phones update to Build 40;
reopen to refresh configuration and verify the signed two-account flow.
Outcome/Shared Encounter unchanged.

**Current internal matching demo:** [test_001 QA demo](./TOGETHER_QA_DEMO.md)
has six live, course-scoped QA matching cards covering all Together topics.
Existing intentions/history and matching rules are preserved. Next: refresh
Together on the internal app and inspect them before **2026-09-09 15:45 UTC**;
other Sports options are prepared as separate batches. This is synthetic QA,
not an organic pilot sample or a new app release.

**Previous UI release:** [Build 38](./releases/2026-09-09-testflight-38.md)
is committed/pushed, processed and available in `SideSeat Internal`, with Chinese
testing notes saved. It includes the
[Little Companions avatars](./SYSTEM_AVATARS.md), clearer Opportunity cards,
[six activity illustrations and adaptive product buttons](./DESIGN_SYSTEM.md#comfort-and-character-refresh--2026-09-09),
and the [strong-feedback interest bar](./DESIGN_SYSTEM.md#interest-bar-motion-and-feedback--2026-09-09).
Left is `忽略`, right is `有兴趣`; mutual interest opens chat, not a confirmed Plan.
Local verification passed: 26 contrast/asset checks and six distinct comfort UI
checks; final motion verification passed four distinct UI checks and two gesture
unit tests, including Reduce Motion, vertical scrolling and failed-save recovery.
Full earlier card/gesture evidence remains in the design document. The simulator
motion recording stays local at `docs/visual-qa/opportunity-swipe-motion.mp4`.
These are local QA results, not signed Build 38 acceptance. Internal Build 39
includes these changes, as does Build 40; update both phones to **1.0.0 (40)** and verify the physical swipe/haptics and
private-interest → chat → confirmed Plan flow. No matching-rule or database change.

**Current release evidence:**
[TestFlight Build 40 discovery-first preparation](./releases/2026-09-09-testflight-40.md)
(source pushed; backend deployed with discovery OFF and existing automatic/flexible
ON; signed IPA validated, processed and available in `SideSeat Internal`; both
phone updates and signed acceptance pending). Prior
[TestFlight Build 39 intention-driven matching preparation](./releases/2026-09-09-testflight-39.md)
(backend and 134 migrations deployed; both new flags now ON; signed IPA validated,
processed and available in `SideSeat Internal`; phone updates/acceptance pending). Prior
[TestFlight Build 38 avatar/card/motion release](./releases/2026-09-09-testflight-38.md)
(uploaded, processed and available in `SideSeat Internal`; 68 release checks and
independent signed payload verification passed; phone updates and physical acceptance
pending). Prior
[TestFlight Build 37 title/disclosure fix](./releases/2026-09-08-testflight-37.md)
(uploaded, processed and available in `SideSeat Internal`; phone updates and
signed acceptance pending; production matching unchanged). Prior
[TestFlight Build 36 activity-fit client](./releases/2026-09-08-testflight-36.md)
(uploaded, processed and available in `SideSeat Internal`; both phone updates are
owner-confirmed and the [activity-fit backend rollout](./releases/2026-09-08-activity-fit-production.md)
is live with broader matching enabled; signed two-account matching → Plan →
both Calendars acceptance passed on the installed Build 36). Prior
[TestFlight Build 35 matching hotfix](./releases/2026-09-08-testflight-35.md)
(uploaded, processed and available in the existing internal group; physical-phone
update and matching acceptance pending). Prior
[TestFlight Build 34 internal release](./releases/2026-09-08-testflight-34.md)
(signed two-account repeat Outcome/Shared Encounter closure passed using an
owner-authorized time-compressed QA fixture); prior
[Layer 2 production acceptance](./releases/2026-09-07-layer2-production-acceptance.md).

**Matching hotfix verified locally:** The reported `Swift.CancellationError`
handling defect is fixed. Native regressions (9 cases), backend matching (8 tests)
and the real local two-account intent → matching → Plan → both Calendars UI test
pass. The fix is committed and pushed as `a734117`; replacement internal
TestFlight Build 35 is uploaded, processed and assigned to `SideSeat Internal`.
Both test phones are now owner-confirmed on Build 36, which includes this fix. See the
[Build 35 release record](./releases/2026-09-08-testflight-35.md) and
[matching regression record](./releases/2026-09-08-matching-cancellation-regression.md).

## Goal

Prove that private action-first matching can produce safe, real and eventually
repeated campus encounters without becoming a content feed or people marketplace.

The sequence is dependency-driven. A later layer cannot ship merely because its
UI is ready.

## Layer 1 — close the first-encounter loop

**Approved matching improvement (2026-09-08):** Broaden eligible general-category
activities beyond exact wording and show an explainable activity-fit score.
Implementation and local verification passed: 32 compatibility/PostgreSQL checks,
native decoding/regressions, three-language cards and a real local two-account
60/100 opportunity → Plan → both Calendars UI flow. Feature `2ec160d` and
Build 36 preparation `661866a` are pushed; the internal client is uploaded.
Both phone updates are owner-confirmed; the production backend is deployed and
`V2_ACTIVITY_FIT_ENABLED=1` is active. Both QA accounts passed production-domain
API smoke. See [Activity-fit policy](./MATCHING_ACTIVITY_FIT.md) and the rollout
record above. Installed Build 36 acceptance passed with a real related 60/100
opportunity, bilateral YES, accepted Plan and both Calendars. The
[native title/disclosure fix](./releases/2026-09-08-native-title-disclosure-fix.md)
is committed/pushed and available in internal Build 37. Next: update both phones
and confirm the localized new Plan title and complete expanded explanation,
then collect actual matching-to-Plan conversion evidence with internal testers.
Production matching remains enabled and unchanged; Build 37 signed acceptance
is not inferred from Build 36 or local QA.

Current implementation foundation:

- multiple private Weekly Intents;
- explicit 48-hour matching session and countdown;
- concrete Sports input and Study goal/parallel context;
- private finite Mutual Opportunity;
- bilateral decision before Messages;
- contextual source card and prefilled Plan;
- Plan acceptance and two Calendar projections;
- all eligible TestFlight accounts, with global kill switches rather than an
  account allowlist.

Before moving on, complete a live two-account acceptance run:

```text
Intent A + Intent B
→ both start matching
→ one eligible Opportunity each
→ one-sided YES remains private
→ second YES opens contextual Messages
→ prefilled Plan
→ accept
→ both Calendars
→ cancel/reschedule/Block remain consistent
```

Also verify Light/Dark, Chinese/English/German, Dynamic Type, VoiceOver, real
countdown recovery after relaunch, and neutral failure states.

## Layer 2 — Outcome and Shared Encounter

Make the post-Plan question reliably reachable from Together, Messages and
Calendar history without duplicating state.

- occurred / did not occur / skip;
- participant-private answers;
- no automatic positive inference from time passing;
- derive Shared Encounter only after both report OCCURRED;
- preserve Block-safe history and suppress inappropriate reminders.

Gate: sufficient bilateral response coverage to measure occurred plans without
treating silence as failure.

Current gate status (2026-09-07): **open**. The production contract and the
two-account physical-device acceptance path pass. The numeric Gate now requires
at least 20 eligible non-QA Plans, 10 distinct pairs, 8 bilateral answers, 60%
participant response coverage and 40% bilateral Plan coverage in two snapshots
at least seven days apart. The owner clarified on 2026-09-08 that only internal
QA is running and the real-user small-group pilot has not launched; preserve
these measurement rules for a later separately authorized pilot.
Owner decision on 2026-09-08: this real-user Gate no longer blocks Layer 3
development and internal acceptance. It is not marked passed; public release
still requires the release quality gate and separate authorization.
The first production non-QA baseline on 2026-09-07 contains 0 eligible Plans;
all 3 candidate Plans were excluded as QA/internal.
Build 32 improves pilot completion by surfacing pending Plan decisions and
Outcome answers in the Messages and app-icon attention badges, then refreshing
that state immediately after an Outcome is saved.
The 2026-09-08 native UX iteration unifies Together and Plan cards, adds a
two-step Intent editor and pinned Plan submission, and makes saved private
Outcome answers compact and editable. These changes are included in
[TestFlight build 33](./releases/2026-09-08-testflight-33.md), uploaded on
2026-09-08 (Europe/Berlin), processed by Apple and assigned to the existing
`SideSeat Internal` group. Its focused core-flow physical smoke passed on
2026-09-08 on an iPhone 16 Pro Max (iOS 26.0.1), switching between two existing
QA accounts: Intent save, Plan send/accept, both Calendar entries and historical
private Outcome saved/edit controls. This run wrote no Outcome answers and did
not re-test a new Shared Encounter transition. Largest-text Intent interaction
passed. System banners interrupted the physical appearance navigation test,
so the remaining UI regression moved to a SideSeat-only simulator at the
owner's request. After resolving that simulator's initial system migration
stall, the exact release source `6a1c2f7` passed both selected Light/Dark tests
at `2026-09-08T00:27:34Z`: 2 tests, 0 failures, 14 screenshots visually
inspected. Coverage includes Together draft/back navigation, Plan rescheduling
and private Outcome save/edit in local DEBUG fixtures. The owner's phone was
not used. These fixture answers are not production or non-QA pilot evidence.
The earlier feature-revision simulator check passed (6 state tests and 7 UI
tests); see the
[design verification](./DESIGN_SYSTEM.md#together--plan-verification--2026-09-08).
Release/acceptance commits through `cd3ebda` are now pushed. Beta metadata,
owner-provided contact details and the verified repository QA reviewer login
are saved in App Store Connect. With owner authorization, Build 33 was added
to the existing external `SideSeat 用户测试` group and submitted for Beta App
Review. By `2026-09-08T00:49:26Z`, Apple showed Waiting for Review and the group
contained one build and zero testers. Automatic tester notification was
deselected; no invitations were sent and external installation is not yet verified.
Next: obtain Apple approval, manually start external testing/notify testers,
then confirm Build 33 installation for a consenting external tester before
wider recruitment. Continue real Plan use plus truthful bilateral Outcome
answers, checking saved state/badge refresh on a genuinely ended Plan.
The next formal Gate snapshot is no earlier than `2026-09-14T10:37:35Z`;
QA acceptance does not count toward that product-data Gate. The non-blocking
English `Chat actions` VoiceOver label is tracked in the build-33 release record.
See the [pilot Gate contract](./LAYER2_PILOT.md) and
[non-QA tester guide](./LAYER2_PILOT_TESTER_GUIDE.md) for a later authorized pilot, and
[acceptance record](./releases/2026-09-07-layer2-production-acceptance.md).

## Layer 3 — Meet Again and Repeat Opportunity

**Development status:** Implemented; local backend/HTTP and simulator acceptance
passed on 2026-09-08 (67 backend/contract checks and 4 native tests). The owner
subsequently authorized the migration, backend deployment and internal release:
these are complete, `V2_MEET_AGAIN_ENABLED=1`, and Build 34 is processed and
assigned to the existing one-tester internal group. Production two-account HTTP
read smoke passed with the flag off and on without Outcome/permission mutations.
The subsequent owner-authorized signed Build 34 session on Baichu's iPhone
passed private answers/withdrawal, fresh matching and consent, a new accepted
Plan and both Calendar views, using only excluded QA accounts. One harness
title assertion required continuation from the actual saved Plan; it did not
require a product fix or duplicate Plan. The owner subsequently authorized a
time-compressed window for only that QA Plan and its two Calendars. Its signed
Outcome closure passed by `2026-09-08T04:04:23.539Z`: both accounts' three private
answers, all three history entrances, bilateral-only Shared Encounter creation,
correction/removal, restoration and stable two-account relaunch readbacks.
All answers came through TestFlight; no Outcome or encounter was injected into
the database. Original source facts were preserved and new Meet Again consent
remained unanswered. This is synthetic functional QA, not a real second meeting
or qualifying pilot evidence. No Build 34
external/public release was submitted. Build 33 does not contain this work. See
[Layer 3 internal acceptance](./LAYER3_INTERNAL.md) and the
[Build 34 release record](./releases/2026-09-08-testflight-34.md).

- privately ask “Would you do something together again?” after the user's own
  occurred response;
- never show one-sided consent or a Familiar Faces directory;
- use bilateral active permission only as eligibility for a later compatible
  Intent;
- create a new Repeat Opportunity, Context and Plan;
- measure a second qualifying occurred encounter.

Gate: repeat improves real encounters without materially increasing Block/report
rates or starving newcomers of first opportunities.

Next: both test phones are confirmed on `1.0.0 (36)` and signed two-account
matching → private YES → accepted Plan → both Calendars acceptance passed.
Use the enabled version with existing internal testers and collect conversion evidence.
Keep the unrelated plist edit and old archives out of the release. The signed repeat Outcome closure is
complete and its scoped acceptance documentation was pushed through `cfb7f2a`.
Separately decide when to start the real-user small-group pilot and obtain
approval for external TestFlight assignment/Beta review.
Do not automatically publish to the App Store. The weekly Layer 2
automation keeps its original schedule but no longer re-blocks Layer 3
development; the organic product-data Gate is still open. Full public-release
readiness, including outstanding monitoring/restore evidence, is not certified
by an internal TestFlight upload.

## Layer 4 — controlled Pod

Only after the one-to-one repeat gate:

- temporary 3–5-person action-scoped composition;
- independent consent and minimum disclosure;
- one Group Commitment, not several bilateral Plans;
- membership lock, cancellation, Calendar projection and safety semantics;
- no group chat before quorum and no permanent community afterward.

Pod requires a separate Group Commitment and Group Safety contract before schema
or production rollout.

## Conditional platform work

Read-only EventKit Busy/Available may be considered after the social loop proves
value. It must be permissioned and expose only busy/available information. Private
calendar titles, locations, notes and categories never enter matching.

Calendar reliability, search and import/export maintenance may continue, but
advanced Calendar customization cannot displace the core social loop.

## Decision metrics

- eligible Intent → Opportunity coverage;
- time to first qualified Opportunity;
- mutual consent per delivered Opportunity;
- confirmed Plans per 100 qualified Opportunities;
- bilaterally reported occurred Plans per 100 WAU;
- Outcome response coverage;
- 30-day Repeat Encounter rate for fully observed pairs;
- Block/report rate and severe safety events;
- newcomer access versus familiar-person exposure.

Insufficient sample extends the pilot; it does not prove product-market fit or
justify adding more matching surfaces.

## Frozen outside scope

- public feed, generic publisher and save shelf;
- person search, swipe deck, follower graph and person compatibility scoring;
- course roster, mega-chat and course community;
- RSVP, collaborative calendar and complex attendee lifecycle;
- People Match as an independent product object;
- production Pod before the one-to-one repeat gate;
- engagement features that do not improve real plans or repeated encounters.
