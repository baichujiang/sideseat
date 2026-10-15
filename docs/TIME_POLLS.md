# Native time polls

Owner decision: 2026-10-15. Supersedes the original-page embedding in Preview 98.

SwiftUI creation, 15-minute rectangular paint/erase, immediate preview, automatic
save, participant heatmap and best windows are implemented by Sideseat. No
When2meet source code or save service is used. Sideseat account authentication
replaces provider name/password login in the app. The owner also approved a
poll-scoped browser guest on 2026-10-15; see Guest participation below.

## Mobile selection

Ordinary vertical and horizontal swipes over the cells scroll without editing.
A tap changes one 15-minute cell. Hold for 0.4 seconds for light feedback, then
drag to preview a rectangular range; release applies it and starts autosave.
Starting on an available cell erases the range. A cancelled gesture discards the
preview. The most recent committed selection change can be undone once; Undo
also uses the normal autosave queue. Cells are 44 points high, with adaptive
separator borders. Accessibility activation still toggles an individual cell.

UIKit tap/long-press recognition arbitrates with the enclosing scroll views;
the zero-distance SwiftUI drag that previously intercepted scrolling is removed.
The slot model, 15-minute precision and response ownership are unchanged.

## Data and saving

API: `GET/POST /api/v1/time-polls`, `GET/DELETE /api/v1/time-polls/{token}`,
`PUT /api/v1/time-polls/{token}/response`. Contract: `openapi/v1.json`.
Create uses an idempotency key. A random 192-bit invite token grants link holders
access to this shared poll, including names, availability and results. Each account
or browser guest can update only its own response. Only the creator may delete collecting/cancelled polls; active invitations or
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
acknowledged. The shared URL opens a guest web page, with an optional native deep link. Availability changes do not create commitment or read personal Calendar. The
approved unified planning flow can explicitly convert results to invitations;
Calendar projections require all selected people to accept. See
[Unified plans](./UNIFIED_PLANS.md).

Verification is recorded in the dated QA/release records. Historic When2meet
phone runners and receipts are evidence for Preview 98 only and must not be run
against the native replacement.

## Guest participation — owner decision 2026-10-15

The public share page lets people enter a recognizable nickname, add date/time
ranges, edit their own nickname and confirm the current invitation without an
account or download. Ordinary scrolling never edits availability. Browser writes
are serialized/coalesced; unsaved work is retained for explicit Retry.

`TimePollGuest` belongs to one poll. A random browser credential is stored only
in an HttpOnly, SameSite=Lax cookie; PostgreSQL stores its SHA-256 hash. The cookie
plus the expected participant ID authorizes only that guest's writes. Guest rows
are not User accounts and cannot access the owner's Calendar or native account
API. A new browser is a separate participant; returning in the same browser keeps
one's identity. The UI explains this limitation. Nicknames identify the submitted
response and are not verified real names.

Public endpoints under `/api/public/time-polls/{token}`: GET detail; POST
`/participant` joins; PATCH `/participant` renames self; PUT `/response` saves
slots; PUT `/invitation-response` confirms/declines the exact version. Origin and
rate checks apply. Responses use no-store and the page is noindex. Native PATCH
`/api/v1/time-polls/{token}/display-name` renames the authenticated participant.
Nickname edits are allowed while COLLECTING/INVITING, without changing global
profile names. Guests appear by name with a Guest badge in web/native rosters.

All selected people, including guests, must accept before confirmation. Only
registered participants receive Sideseat Calendar rows; their companion names
include guests with no account ID. Guests return to the same web link for details.
The new migration is additive and preserves account-based responses and older
clients. Poll deletion cascades through guest credentials and responses.
