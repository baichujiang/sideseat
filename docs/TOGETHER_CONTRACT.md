# Together Engineering Contract

**Status:** Implemented first-encounter foundation

**Policy:** `MUTUAL_OPPORTUNITY_V1`

**Last updated:** 2026-09-09

**Governing flow:** [User Flow](./USER_FLOW.md)

**Scope:** Weekly Intent, matching session, Mutual Opportunity and mutual activation

**2026-09-09 publication amendment (local, rollout-gated):**
[Event-driven automatic matching](./INTENT_DRIVEN_MATCHING.md) supersedes the
session-only enrollment rules below for explicitly published intentions when
`v2AutomaticMatching` is enabled. ACTIVE lifecycle is the supply gate; no separate
Start or 48-hour session is required. Legacy rows default to their original
session consent, without automatic conversion. Pause/end and locked insertion
preserve the existing safety boundaries. Build 38 remains on the legacy flow.

**2026-09-09 timing amendment (local, rollout-gated):**
[Flexible intention timing](./FLEXIBLE_INTENT_TIMING.md) supersedes the exact-only
rules below when `v2FlexibleTiming` is enabled. New explicit preferences are EXACT,
FLEXIBLE (inclusive local dates plus ANY/MORNING/AFTERNOON/EVENING), or UNDECIDED.
Non-exact modes store no exact windows; compatible preferences may match with NULL
Opportunity timestamps. New intentions last 14 days; EXTEND is an explicit,
version-checked owner mutation. Legacy NULL preferences retain exact semantics and
original expiry. Calendar is still populated only by accepted timed Plans.
Build 38 / production have not received this amendment yet.

## 1. Weekly Intent

A Weekly Intent is private, owner-scoped and short-lived. Current fields support:

- one topic: Coffee, Study, Sports, Explore, Food or Events;
- normalized concrete activity text where needed;
- optional current course for Study only;
- optional Study goal and parallel-study consent;
- a concrete action for Coffee, Explore, Food and Events;
- one or more explicit social time windows;
- IANA time zone and short clarification;
- `ACTIVE`, `PAUSED`, `ENDED`, `EXPIRED` lifecycle.

Users may maintain multiple independent Intents. There is no user-facing product
quota. A high server abuse guard may bound non-terminal rows but must never be
presented as “you may only want to do N things.”

```text
ACTIVE ↔ PAUSED
  │         │
  └─────────┴──→ ENDED
  └────────────→ EXPIRED
```

- Only ACTIVE Intents owned by a user with an active matching session are supply.
- ENDED and EXPIRED are terminal.
- Expiry is the next Sunday boundary in the submitted IANA time zone and no more
  than eight days from creation.
- Editing does not silently extend expiry.

Time-window rules:

- user-declared availability only; never inferred from Calendar;
- future ISO timestamp ranges, 30 minutes to 12 hours;
- no overlap and no end after Intent expiry;
- at most seven windows per Intent;
- iOS uses 15-minute increments and defaults end to start + 30 minutes;
- server timestamps remain authoritative.

## 2. Matching session

```text
IDLE ── start with ACTIVE Intent ──→ MATCHING
MATCHING ── stop ──→ IDLE
MATCHING ── 48 hours ──→ EXPIRED
EXPIRED ── start ──→ MATCHING
```

- Start/restart is explicit and creates one fixed server-authoritative 48-hour
  window.
- The current release has no duration selector.
- The client renders remaining time from the server expiry and corrects after
  foreground/reload.
- Stop/expiry blocks new inserts but preserves delivered Opportunities and active
  coordination.
- Both owners' sessions are locked and revalidated before Opportunity insertion.

## 3. Eligibility and matching

V1 requires:

- onboarded and verified users in the same served school;
- both users currently MATCHING;
- ACTIVE Intents with at least 30 minutes of overlapping declared time;
- at least one shared language;
- same current course when either Intent is course-scoped;
- no pair Block, moderation suppression, cooldown or unresolved-limit violation.

Calendar content is never queried.

Compatibility rules:

- general non-Study/non-Sports topics prefer the same normalized concrete
  action; with `V2_ACTIVITY_FIT_ENABLED=1`, different concrete descriptions in
  the same topic may create `SHARED_CONTEXT` with no parallel-study context;
  nullable legacy rows never consume a new concrete Intent;
- Sports requires the same normalized concrete activity; broad `SPORTS` alone is
  insufficient;
- activity fit orders feasible candidates; no minimum-score delivery filter;
- Study exact normalized goal is preferred to parallel study at equal time fit;
- different Study goals may match as `PARALLEL_STUDY` only when both users allow
  shared-context parallel study;
- each currently unoccupied Intent may produce one current Opportunity;
- there is no global maximum-three rule across unrelated Intents;
- list reads and generation batches remain technically bounded.

The [activity-fit policy](./MATCHING_ACTIVITY_FIT.md) defines weights, frozen
snapshot fields and rollout. Related opportunities preserve both descriptions,
use a neutral topic-level Plan title, and require coordination before commitment.

## 4. Opportunity and decision state

```text
PENDING ── both current YES ──→ MUTUAL
   │
   ├── time/intent/eligibility loss ──→ EXPIRED
   └── safety/terminal connection ────→ UNAVAILABLE
```

Viewer decision:

```text
UNDECIDED → YES → WITHDRAWN
UNDECIDED → NO
```

Raw counterpart decision, decision order and timestamp are never serialized. A
unilateral YES creates no Conversation, waiting state, push or visible counterpart
state. NO does not expose an actor; neutral expiry closes the unresolved object.

## 5. Atomic mutual activation

The second valid YES executes under user-safety, canonical-pair and Opportunity
locks:

1. re-read users, Intents, the Opportunity window, Block, moderation and policy;
2. persist the decision idempotently;
3. create or reuse exactly one canonical ACTIVE Connection;
4. freeze one privacy-filtered source snapshot;
5. create exactly one server-owned source card;
6. transition the Opportunity to MUTUAL;
7. return the exact Messages route.

A terminal Connection, expired Opportunity, invalid Intent or concurrent Block
prevents activation. Stopping matching only leaves the supply queue: an already
delivered Opportunity remains actionable until its own expiry or another listed
invariant invalidates it. Same idempotency key returns the same result.

The source card may prefill a Plan Draft but never creates or accepts a Plan. Plan
services re-read trusted origin data and do not accept a client-forged snapshot.

## 6. API

```text
GET    /api/v1/me/weekly-intents
POST   /api/v1/me/weekly-intents
PATCH  /api/v1/me/weekly-intents/{intentId}
DELETE /api/v1/me/weekly-intents/{intentId}

GET    /api/v1/me/together-matching-session
POST   /api/v1/me/together-matching-session
DELETE /api/v1/me/together-matching-session

GET    /api/v1/me/mutual-opportunities
POST   /api/v1/me/mutual-opportunities/{opportunityId}/decision
DELETE /api/v1/me/mutual-opportunities/{opportunityId}/decision
```

- Mutations require authentication, onboarding and `Idempotency-Key`.
- Intent PATCH/DELETE also require an expected version.
- POST decision accepts exactly YES or NO; DELETE withdraws only the viewer's
  unresolved YES.
- GET returns only owner/viewer-safe projections and may lazily expire stale rows.
- The plural Intent response may temporarily include a singular legacy projection
  for rolling TestFlight clients.
- Enrollment uses global `v2WeeklyIntent` and `v2MutualOpportunity` flags. There is
  no per-account Together allowlist.
- Kill switches disable new enrollment/activation but keep read, pause, end,
  withdraw and expiry safe-drain paths available.

## 7. Privacy, retention and compatibility

- No Intent note, raw decision, exact private location, person ranking or Calendar
  content enters another user's projection.
- The approved activity-fit score and both relevant concrete activity texts may
  enter that opportunity's projection; score is symmetric and independent of consent.
- Account deletion cascades private Intents, decisions and Opportunities.
- Historical source snapshots are minimized and privacy-filtered.
- Unblock never resurrects an expired/unavailable Opportunity.
- Legacy Action, Interest, Conversation, Plan and Calendar rows keep their original
  versioned semantics.
- Old clients cannot create or decide Mutual Opportunities.

## 8. Required verification

- validators reject malformed zones, past/overlapping windows and unknown fields;
- create/edit/decision/session commands are idempotent;
- another user cannot read or mutate an Intent or raw decision;
- course membership and verification are rechecked server-side;
- DST expiry is deterministic;
- exact Sports and fuzzy parallel-Study behavior are covered;
- lower-fit general activities reach bilateral consent, Plan and both Calendars;
- fit scores/reasons are symmetric and do not reveal unilateral decisions;
- both matching-session locks prevent stale-pair insertion;
- one-sided YES remains invisible;
- mutual activation creates one canonical Connection/source card;
- Block versus decision cannot leave a live hidden commitment;
- account deletion and global kill-switch safe drain work;
- OpenAPI and generated Swift types remain synchronized.
