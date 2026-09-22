# SideSeat Safety

**Status:** Approved v1.0

**Last updated:** 2026-09-02

**Governing product:** [Product](./PRODUCT.md)

**Scope:** Pair-wide Block, Plan invalidation, Calendar synchronization, privacy-safe history and race behavior

## 1. Block decision

Block is a pair-wide safety hard stop, not mute, hide or ordinary Conversation
end. One successful Block must atomically:

1. stop direct communication and new coordination;
2. terminate every NEGOTIATING/PENDING bilateral Plan with internal reason
   `SAFETY_UNAVAILABLE`;
3. cancel every not-yet-completed CONFIRMED bilateral Plan;
4. synchronize both Calendar projections;
5. end/tombstone open Contexts and release initiation reservations;
6. preserve completed history using privacy-safe presentation;
7. leave an already fulfilled source Action fulfilled;
8. require no manual Plan cleanup before the user can Block.

Unblock never restores an old Plan, projection, Context, Opportunity or source
state. Renewed interaction requires a new explicit action.

## 2. State matrix

| State at Block commit | Result |
| --- | --- |
| Upcoming CONFIRMED | CANCELED with internal `SAFETY_UNAVAILABLE` |
| In-progress CONFIRMED | CANCELED; do not infer Outcome |
| Completed | Keep completed time/history; switch to privacy-safe tombstone |
| Initial proposal PENDING | INVALIDATED; negotiation closed |
| Reschedule PENDING | INVALIDATED, then confirmed commitment canceled |
| Completed plus anomalous pending revision | Resolve as completed, not fabricated safety cancellation |
| Corrupt legacy row without reliable end | Conservatively cancel and include in repair evidence |

Safety cancellation is distinct from decline, proposer withdrawal, ordinary user
cancellation, Action expiry and reported did-not-occur.

## 3. Pair-wide scope

The scope is the canonical unordered user pair, not only the current Connection or
screen. Block must cover all open Contexts, reservations, actionable revisions,
not-yet-ended two-person commitments and projections between the pair while leaving
unrelated users, private events and organized attendance untouched.

## 4. Privacy and notification

The Block actor and internal reason are never serialized to either participant.
Only when at least one CONFIRMED commitment was actually canceled, send one
aggregated neutral logistical notification:

```text
One shared plan has ended. Check your calendar.
```

It must not include the initiator, Block/report wording, Plan title, location,
notes, message content, profile route or chat route. Invalidating only pending
proposals or preserving completed history sends no safety-ended push.

Participant history may retain stable commitment identity, neutral ended/completed
state, original scheduled time and the viewer's permitted private metadata. It
must omit the counterpart identity, shared title/location/notes and contact route.
Static exports or independently copied events cannot be revoked and must never be
described as continuously synchronized.

## 5. Calendar and Outcome

- Safety-canceled projections leave active Calendar views and reminder scheduling.
- The stable commitment relation remains for audit/reconciliation.
- Completed history and existing private Outcome answers are not rewritten.
- A Block never implies occurred or did-not-occur.
- No new proactive Outcome reminder is sent across a blocked pair.

## 6. Transaction order and races

All pair-scoped communication or commitment operations use the same outer lock:

```text
USER_CONNECTION_SAFETY
→ canonical PAIR_SAFETY
→ source Action / Opportunity
→ Interest / Decision / Context
→ Connection
→ Plan Commitment
→ Plan Revision
→ Calendar Projection
```

Narrower rows are locked by stable immutable ID. A command that discovers an
additional pair rolls back and retries; it never appends a lower-sorted pair lock.

Linearizable outcomes:

- Block first: later message, decision, activation and Plan mutations fail with a
  neutral unavailable response.
- Accept first: Block observes the new commitment and cancels it before returning.
- Repeated/concurrent Block: one durable result and no duplicate event, projection
  transition or notification.
- An undelivered Plan-confirmed outbox item rechecks commitment state and is
  suppressed after safety cancellation.

## 7. Required verification

Tests must cover upcoming, in-progress and completed Plans; initial and reschedule
proposals; multiple pair commitments; Block/accept and Block/reschedule commit
orders; duplicate Block; Interest/Opportunity activation races; Calendar cleanup;
neutral payload privacy; Unblock non-restoration; safe history; and zero notification
when only pending/completed state is affected.
