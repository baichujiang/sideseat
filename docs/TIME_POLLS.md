# Native time polls

Owner decision: 2026-10-15. Supersedes the original-page embedding in Preview 98.

SwiftUI creation, 15-minute rectangular paint/erase, immediate preview, automatic
save, participant heatmap and best windows are implemented by Sideseat. No
When2meet source code or save service is used. The mature interaction mechanism
is retained; Sideseat account authentication replaces provider name/password login.

API: `GET/POST /api/v1/time-polls`, `GET/DELETE /api/v1/time-polls/{token}`,
`PUT /api/v1/time-polls/{token}/response`. Contract: `openapi/v1.json`.
Create uses an idempotency key. A random 192-bit invite token grants signed-in
holders access to the poll; the browser handoff exposes no responses. Each account
can update only its own response. Only the creator may delete collecting/cancelled polls; active invitations or
confirmed plans must be cancelled first.
PostgreSQL stores immutable candidate slots and unique `(pollId,userId)` responses.
Creator deletion/account deletion cascades through owned polls and responses.

Dates, time range and IANA zone determine immutable UTC intervals. Selection is
an array of slot IDs validated against those intervals. Repeated DST wall times
have separate row IDs and offset labels. Responses with zero selected slots still
count in the denominator. Legacy polls merge highest-attendance intervals only when the same people are
available throughout. New plans specify a duration and expected count; their
recommendations require the same attendees throughout that complete duration,
and a common result requires the expected response count. Ties remain separate recommendations, ordered
by date/time. With zero attendance, no recommendation is invented. Blocked creators
are unavailable; blocked participants are excluded from visible data/statistics.

The client binds each autosave queue to its original login generation, serializes
writes and coalesces newer pending gestures. Account switches drop old queued
changes, and unauthorized JSON requests cannot retry under a replacement session. It
keeps the draft on save failure and offers Retry. Server refresh cannot replace a
pending draft. Detail views refresh visible responses every ten seconds while
active; closing a view cancels refresh, while a pending save retains its store until
acknowledged. The shared URL routes through native deep links and existing login
handoff. Availability changes do not create commitment or read personal Calendar. The
approved unified planning flow can explicitly convert results to invitations;
Calendar projections require all selected people to accept. See
[Unified plans](./UNIFIED_PLANS.md).

Verification is recorded in the dated QA/release records. Historic When2meet
phone runners and receipts are evidence for Preview 98 only and must not be run
against the native replacement.
