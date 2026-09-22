# Legacy Action Compatibility

**Status:** Compatibility only

**Last updated:** 2026-09-02

**Governing product:** [Product](./PRODUCT.md)

**Governing safety:** [Safety](./SAFETY.md)

**Scope:** Existing public Course/Buddy Actions, Activities, B-light coordination and frozen web fallback

This document preserves only rules needed by existing records, old TestFlight
clients, migrations and rollback. It must not reintroduce Discover, a publisher,
city filters, saved posts, response pools or public people discovery into Together.

## 1. Versioned policies

Legacy peer Actions retain the immutable policy captured when created:

- `DIRECT_CONVERSATION_V1`: Interest may use the historical direct-conversation
  path.
- `CREATOR_GATED_V2`: Interest is not a message; the creator explicitly starts
  bounded coordination before a Conversation is activated.

Flags, rollout changes and new app builds never reinterpret an in-flight Action.
Mutual Opportunity uses a separate policy and cannot reuse creator/candidate
semantics.

## 2. B-light compatibility flow

For `CREATOR_GATED_V2` existing records:

```text
legacy Action
→ reversible bodyless Interest
→ creator's Action-grouped response list
→ creator opens a coordination composer
→ provisional slot reserved
→ first message or Plan activates Conversation
→ immutable source Context
→ at most one actionable Action-derived Plan
→ confirmed Plan fulfills source Action
```

Current-stage policy may allow a small number of active coordination Contexts,
but only one actionable source-derived Plan. Ordinary messages in an existing
Conversation remain allowed when another Context is negotiating a Plan.

Creator list cleanup is private hide/archive, not social rejection. Closing
discovery stops new responses but preserves existing coordination. Expired source
time must be replaced with a future Plan time. Unselected Interest becomes a
neutral ended state when the source ends; no “someone else won” notification is
sent.

## 3. Compatibility data rules

- Interest is distinct from Save, message, signup and Plan acceptance.
- Source Context survives closure as a privacy-filtered snapshot or tombstone.
- One canonical Connection is reused for a user pair.
- Plan owns commitment; Calendar projections cannot independently edit shared
  facts.
- Confirmed Plan cancellation/reschedule follows the shared Plan lifecycle.
- A fulfilled Action is never automatically republished after Plan cancellation.
- Block follows [Safety](./SAFETY.md) across every legacy and current Context.

For migration compatibility, a `DIRECT_CONVERSATION_V1` compatibility Context has no activation attempt in some historical rows. Preserve that nullable relation and **do not fabricate MESSAGE** merely to satisfy a newer shape.

## 4. Transaction foundation

Legacy Action coordination uses the same outer safety and canonical-pair lock order
defined in `SAFETY.md`. Mutations claim an idempotency receipt and commit domain
writes, event/outbox records, response status and response body in one transaction.
The transaction must not perform push, email, WebSocket or other outbound side
effects directly.

Worker expiry/recovery transitions use conditional state changes and deterministic
business keys. A losing worker reports not-applicable instead of inventing a new
transition.

## 5. Organized legacy Activities

Activities preserve organizer-to-attendee semantics rather than peer matching.
Existing signup/leave/cancellation must keep Attendance and Calendar projections
consistent. Activity records do not become Mutual Opportunities, Familiar Faces or
several bilateral Plans.

## 6. Frozen web fallback

The native iPhone app is the product client. Production keeps only:

- `/api/**`;
- `/.well-known/apple-app-site-association`;
- approved public event/schedule share and app-handoff routes;
- `/ios`, `/privacy` and `/support`.

Other legacy page routes redirect to the iPhone handoff. Local development and
regression tests may enable the legacy UI. `SIDESEAT_ENABLE_LEGACY_WEB=true` is an
emergency rollback switch, not the normal production configuration.
