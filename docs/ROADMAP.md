# SideSeat Roadmap

**Status:** Current dependency roadmap; deployed facts live in [Deployed state](./DEPLOYED_STATE.md).

**Last updated:** 2026-10-15

**Governing product:** [Product](./PRODUCT.md) and [User Flow](./USER_FLOW.md).

The dated Build 34–40 rollout diary, expired demo instructions and previous
roadmap are preserved in the [frozen historical copy](../archive/2026-10-15-retired/docs/ROADMAP-2026-09-09.md).
Do not use its old “current release”, phone-update tasks or QA windows as today's
work queue. Current development delivery is Preview 102; ordinary SideSeat 97 is
a separate supported older client. This roadmap records dependency gates, not
fresh acceptance of every implemented feature.

## Goal

Prove that private action-first matching can produce safe, real and eventually
repeated campus encounters without becoming a content feed or people marketplace.
A later layer cannot ship merely because its UI exists.

## Layer 1 — first-encounter loop

Current approved flow:

```text
publish a private intention
→ automatic recommendations / actively explore intentions
→ optional private bookmark or contextual greeting
→ written reply opens ongoing conversation
→ propose and explicitly accept a Plan
→ both Calendar projections
```

Automatic matching, activity fit, flexible timing and discovery/explore flags are
currently ON. New clients use publication rather than the old explicit 48-hour
Start/countdown flow. Legacy client contracts remain frozen compatibility.
Keep reliability and real completion of this loop ahead of new social surfaces.

## Layer 2 — Outcome and Shared Encounter

Preserve each participant's private happened / did-not-happen / skip answer.
A Shared Encounter requires both participants to independently report OCCURRED.
Feedback coverage and qualifying samples are measured using [Layer 2 pilot](./LAYER2_PILOT.md)
policy; synthetic QA is not organic pilot evidence. No new sample sufficiency or
pilot success is asserted by this documentation audit.

## Layer 3 — Meet Again and repeat

`v2MeetAgain` is currently ON. Preserve private permission, encounter eligibility,
explicit decisions and the existing Plan consent lifecycle. Historical
implementation/test details are in [Layer 3](./LAYER3_INTERNAL.md); date/build
statements there describe that delivery. A live feature flag is not a fresh
signed acceptance or proof of repeat-encounter quality.

## Layer 4 — controlled Pod

`v2SmallGroupPilot` is currently OFF. Pod remains behind the one-to-one repeat
gate and requires a separate Group Commitment and Group Safety contract before
schema or rollout. Existing compatibility group-chat code does not authorize a
discovery Pod formation. Separately approved manual link-based planning follows
[Unified plans](./UNIFIED_PLANS.md).

## Supporting coordination and Calendar work

The owner approved manual unified planning on 2026-10-15: collect availability or
choose a time → explicit selected invitations → every selected person accepts →
Calendar projections. Native implementation and verification are tracked in
[Unified plans](./UNIFIED_PLANS.md); actual backend/Preview delivery belongs in
[Deployed state](./DEPLOYED_STATE.md). This manual link-based coordination is not
the gated discovery Pod or old group-chat product and creates no repeat/Outcome
credit. The mature native grid/autosave mechanism and archived boundary remain.

Calendar reliability, smart input, search and import/export maintenance may
continue within current authority. Read-only EventKit Busy/Available remains
conditional on separate product authority and minimum disclosure. Private
calendar contents never become matching inputs.

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
- public RSVP, collaborative calendar and attendee lifecycle beyond the approved
  manual plan invitation/confirmation contract;
- People Match as an independent product object;
- production Pod before the one-to-one repeat gate;
- engagement features that do not improve real plans or repeated encounters.
