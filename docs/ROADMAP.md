# SideSeat Roadmap

**Status:** Active dependency roadmap

**Last updated:** 2026-09-07

**Governing product:** [Product](./PRODUCT.md)

**Current release evidence:**
[Layer 2 production acceptance](./releases/2026-09-07-layer2-production-acceptance.md)

## Goal

Prove that private action-first matching can produce safe, real and eventually
repeated campus encounters without becoming a content feed or people marketplace.

The sequence is dependency-driven. A later layer cannot ship merely because its
UI is ready.

## Layer 1 — close the first-encounter loop

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
at least seven days apart. Continue the Layer 2 pilot; do not begin Layer 3.
The first production non-QA baseline on 2026-09-07 contains 0 eligible Plans;
all 3 candidate Plans were excluded as QA/internal.
See the [pilot Gate contract](./LAYER2_PILOT.md) and
[non-QA tester guide](./LAYER2_PILOT_TESTER_GUIDE.md) for the active pilot, and
[acceptance record](./releases/2026-09-07-layer2-production-acceptance.md).

## Layer 3 — Meet Again and Repeat Opportunity

- privately ask “Would you do something together again?” after the user's own
  occurred response;
- never show one-sided consent or a Familiar Faces directory;
- use bilateral active permission only as eligibility for a later compatible
  Intent;
- create a new Repeat Opportunity, Context and Plan;
- measure a second qualifying occurred encounter.

Gate: repeat improves real encounters without materially increasing Block/report
rates or starving newcomers of first opportunities.

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
- person search, swipe deck, follower graph and compatibility score;
- course roster, mega-chat and course community;
- RSVP, collaborative calendar and complex attendee lifecycle;
- People Match as an independent product object;
- production Pod before the one-to-one repeat gate;
- engagement features that do not improve real plans or repeated encounters.
