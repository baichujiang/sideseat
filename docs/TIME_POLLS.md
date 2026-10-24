# Native time polls

Owner decision: 2026-10-15. Supersedes the original-page embedding in Preview 98.

SideSeat implements native creation, 30-minute paint/erase cells, local drafts,
explicit availability submission and participant heatmaps. No When2meet source
code or save service is used. SideSeat account authentication applies in the App;
share-page guests use poll-scoped private participation credentials.


## Current manual plan flow — 2026-10-24

Create a COLLECT plan from activity/location, candidate dates and daily hours,
with optional activity ideas; creation has no timetable preview. App contacts
and browser guests fill the same detail timetable and explicitly submit local
availability drafts. The organizer can choose a continuous final interval even
with zero responses, review the roster and send invitations. Invitees accept,
decline or leave pending; the organizer may publish at any time. Only accepted
account participants receive notifications and SideSeat Calendar entries; guests
view the final arrangement on the shared page. Activity ideas must be decided
before formal invitations are sent.

The canonical selection, guest/record compatibility and consent contract is in
[Unified plans](./UNIFIED_PLANS.md#current-manual-plan-flow--2026-10-24).
Actual releases and verification scopes are in [Deployed state](./DEPLOYED_STATE.md).
Preview-numbered sections below are dated evolution, superseded by newer
amendments; they are not additional current entry paths or fresh acceptance.

## Shared native editor presentation — Preview 196

Creation now uses the current intention editor's native Form/Section, bgGrouped,
surface rows, Text.title and SSFlowActionDock/ssFlowSheet. Activity/location form
one group; candidate dates, inline calendar, hours/zone and ideas form the other.
Remove the custom gray title surface, separate idea card and content outlines.
Real date/hour/Clear actions keep their existing outline. Input, validation,
creation payload and the existing sharing/invitation/Calendar flow remain intact.

## Creation form layout — Preview 195

Activity/location use a quiet identity surface; date/hour settings share one
outlined region, with time zone under the hours. The existing optional activity
ideas checkbox is separate. Calendar expansion follows its trigger directly,
with the original centered Clear dates action. Activity names wrap visually;
Return normalizes embedded newlines to spaces and dismisses input. Preserve the
same request, dates, hour validation and all invitation/Calendar behavior.

## Native creation presentation — Preview 194

Creation has no timetable preview: retain activity/location, candidate dates,
daily hours, time zone and the optional friends' ideas checkbox. Create the same
COLLECT plan and open sharing; availability cells first appear in plan details,
where participants select and explicitly submit. Remove creation-only timetable
state/slot calculations and dead preview grid options. Preserve existing date,
hour, title and location validation, idempotency, invitation and Calendar rules.
No backend or browser change is required.

## Native grid interaction — Preview 193

Both editable native grids omit the one-step Undo button and snapshot state.
Tap again to deselect; hold and drag to paint or erase, and tap a day header to
select or clear that day. Existing draft/submission and final-interval rules are
unchanged. Availability uses the normal Time corner label; final-time guidance
stays in its existing text row; scroll layout and viewport dimensions remain. Older native
Undo descriptions below are historical; browser interaction is unchanged here.

## Creation — Preview 191 (preview superseded by 194)

New native plans enter one collection-first flow: activity/location, candidate
dates and daily voting hours, a read-only timetable preview, then Share for
availability. Creation neither submits availability nor chooses a final interval.
The existing share panel opens immediately. The organizer and friends explicitly
submit availability in details; final selection and invitation review happen on
that same timetable and remain available with zero responses. Remove the former
creation mode switch and the redundant final-selection footer return action;
retain the navigation back arrow. Optional activity proposals, guest participation,
existing records and RSVP/publication/Calendar rules remain. Older descriptions
below are superseded by the current [unified contract](./UNIFIED_PLANS.md).

## Invitation timetable — Preview 123

App and public-share invitation details now show a read-only timetable focused on
the exact invited day/time, with one context cell before and after where possible.
A distinct outline, fill, calendar icon and text mark the final interval; quarter-hour
edges use proportional highlights, and cross-midnight dates and repeated DST times
retain actual instants. Fixed-time invitations use the same display even outside
collection hours. The invited time is separate from personal availability.
Opening or tapping the timetable never edits a response or accepts an invitation.
The viewer still explicitly confirms or declines the current invitation version;
Calendar projections still wait for every selected person. The highlight remains
on confirmed details; only pending replies show the instruction to confirm.


## Mobile selection

Ordinary swipes scroll without editing. A tap toggles one 30-minute displayed
cell; holding and dragging previews paint or erase, and release commits the
local draft. Starting on selected cells erases; cancelling discards the preview.
Native grids omit Undo. Cells retain 44pt targets and accessibility activation.

Availability date headers select or clear all candidate slots inside that day's
configured voting hours, preserving other dates. Teal/checkmarks and partial
states communicate personal availability; amber/square checks distinguish final
time selection. Final selection uses the same tap/toggle/drag mechanics across
candidate dates. Review requires one continuous actual interval; disconnected
selections remain a local draft for correction. Other people's responses do not
change when selecting or clearing your own cells.

Persisted slots retain 15-minute IDs for existing records. Two adjacent slots
form each displayed 30-minute cell. An old partially selected quarter stays
partial on opening; tapping fills both quarters, and tapping a full cell clears
both. Legacy boundary instants and repeated DST IDs remain exact. Heatmap counts
require availability throughout the displayed cell; the full timetable supplies
the group result, without recommendation cards.

## Data and saving

The detail header places activity title and share together, status/location below,
then date/time zone and response count/avatars. Nickname editing is absent from
the native detail. Participants edit directly in the same timetable. A draft is
saved locally while selection changes; the explicit submit/update action sends
it. Pending changes, submitting, acknowledged success and failure/Retry reflect
actual request state. Failure preserves the draft; refresh does not replace it.
A submitted response keeps the timetable visible while the next step is to wait
for a final invitation and explicitly respond. Availability never confirms
attendance, creates Calendar entries or reads the personal Calendar.

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
count in the denominator. Collection does not require an activity duration. The
full heatmap and response count let friends decide when and how long to
spend together. Common-time and maximum-attendance cards are removed from both
current clients. Existing API summary/window fields remain for older clients;
their original complete-duration and attendance intersection semantics are retained.
In Preview 122 the creator starts Choose final time on the same timetable, taps
start/end or holds and drags a continuous range within one candidate date, then
reviews the roster before sending. The date header selects the whole configured
day, preserving half/full-day support and exact legacy boundary instants. An unsent
draft is separate from availability; cancelling or adjusting it does not modify
responses or invitations. New invitation drafts start empty; rescheduling prefills
the existing range. The review keeps roster selections when returning to the table
and no longer contains separate date/from/until pickers.
Explicit invitation end is persisted through confirmation and Calendar projection;
omitting it keeps the older duration/60-minute fallback. Blocked creators
are unavailable; blocked participants are excluded from visible data/statistics.

Explicit submissions are scoped to the original login generation and serialized
against conflicting writes. Account switches cancel old-session work; unauthorized
requests cannot retry under a replacement session. Failure retains the local draft
and offers an explicit retry. Refresh cannot replace pending local changes.
Active details refresh visible responses every ten seconds; closing cancels
refresh, while an in-flight submission retains its store until acknowledged. The shared URL opens a guest web page, with an optional native deep link. Availability changes do not create commitment or read personal Calendar. The
approved unified planning flow can explicitly convert results to invitations;
The organizer explicitly publishes without waiting for every response; only
accepted account invitees receive notifications and unique Calendar projections. See
[Unified plans](./UNIFIED_PLANS.md).

Preview 113 binds each native refresh to its request and the current local edit
revision. A refresh started before a selection, nickname edit or plan mutation
cannot later overwrite the acknowledged change or display an obsolete error.
Refresh does not start during a queued save or mutation; serial/coalesced writes
and explicit retry remain unchanged. Expired plans are read-only and appear in
Ended, as defined in Unified plans.

Verification is recorded in the dated QA/release records. Historic When2meet
phone runners and receipts are evidence for Preview 98 only and must not be run
against the native replacement.

## Guest participation — current identity and RSVP contract

Share-page guests enter a display name, fill the same timetable and explicitly
submit availability, then return to view the highlighted final invitation and
accept or decline its current version. They need no App, registration or account.
Filling availability and opening the link never accept attendance.

Since the approved2026-10-21 identity update, a first join creates an independent
guest ID and random private credential. Names are display values; a matching
name cannot claim another record. A scoped HttpOnly/Secure/SameSite cookie
remembers the credential, and every write checks the expected participant ID.
The personal recovery link restores the same server record without creating a
duplicate response or resetting RSVP. Its private fragment is cleared before
POST verification. Local unsubmitted drafts stay in the original browser.
Credential-less legacy records remain preserved and follow the existing verified
owner-assisted recovery rules, not automatic name-based takeover. The complete
current contract is [Guest identity](./GUEST_IDENTITY.md).

The organizer may publish without waiting for pending or declined invitees.
Accepted account participants receive their unique SideSeat Calendar projections;
guests view final details on the same shared page and do not receive User Calendar
rows. Existing compatibility APIs and persisted records stay intact. Native
participant rename APIs remain compatibility surfaces; this document does not
reintroduce the removed native nickname-editing entry.

The following original rollout notes are retained as historical implementation
context. Their same-name recovery, no-private-link, automatic-save and all-accept
statements were superseded by the current contracts above and must not be used
as today's behavior or fresh acceptance evidence.

### Superseded guest rollout notes — 2026-10-15/16

The public share page lets people enter a recognizable nickname, select the same
30-minute grid as the native app, edit their nickname and confirm the current
invitation without an account or download. Both clients follow the Mobile
selection rules above: normal swipes scroll, taps toggle one cell, a 400 ms hold
previews a rectangular paint/erase range, release commits, cancellation discards,
and the last change can be undone. Date headers select/clear their configured day
without changing other dates. Teal/amber states use the native color values;
the public page follows the browser's Light/Dark appearance. The same editable
timetable shows per-slot attendance counts together with the viewer's checkmarks,
with no recommendation cards. Counts replace the viewer's saved response with
the current draft once; other people's replies remain intact. Saving/reopening
keeps this timetable visible. The bottom bar explains that the guest should return
to explicitly confirm the final invitation after the organizer chooses a time.

At desktop viewport widths of 1024 CSS pixels and above, the shared page expands
to a maximum of 1440 pixels and gives the timetable the remaining width beside a
224-pixel participant column. A seven-day poll fits without horizontal scrolling
at the verified 1024/1280/1440/1920 widths, for both personal selection and group
results. Below 1024 pixels the existing layout and cell sizes remain unchanged;
mobile retains horizontal scrolling and the same tap/hold gestures. Longer polls
can still scroll horizontally.

Guests first enter a name; subsequent selection and confirmation use the same
persisted plan, slot IDs and lifecycle as the app. Chinese is the default, with
an independent remembered English/Chinese choice. Browser writes remain
serialized/coalesced; unsaved work is retained for explicit Retry. Refresh pauses
during an active range preview and cannot overwrite a pending save. Grid cells
retain a stable touch target while their checkmark changes.

`TimePollGuest` belongs to one poll. Owner decision 2026-10-16: shared links are
for trusted friends/groups, and entering an existing guest name resumes that
guest's original response, including from another browser or after clearing
cookies. Names are trimmed and matched case-insensitively within that poll;
different people should use distinguishable names. A new name creates a guest.
Joining by name never clears slots, creates another response or resets an invite.
Concurrent joins serialize on the plan row. Existing duplicate historical guest
names resolve to the earliest guest; their records are not automatically merged
or deleted. Account participants cannot be claimed through the guest name entry.

An HttpOnly, SameSite=Lax cookie scoped to `/api/public/time-polls/{token}` remembers
the selected guest ID. This is a remembered selection for the trusted link's
name-based access, not proof of a private identity. Each write also checks the
expected participant ID so an old tab cannot accidentally edit a newly selected
person. Old random browser credentials remain supported without rotation; an
additional browser can resume the guest without invalidating the earlier one.
Guest rows are not User accounts and cannot access the owner's Calendar or native
account API. Names are not verified real names. No private edit link, registration
or new database migration is required.

Public endpoints under `/api/public/time-polls/{token}`: GET detail; POST
`/participant` joins; PATCH `/participant` renames self; PUT `/response` saves
slots; PUT `/invitation-response` confirms/declines the exact version. Origin and
rate checks apply. Responses use no-store and the page is noindex. Native PATCH
`/api/v1/time-polls/{token}/display-name` renames the authenticated participant.
Nickname edits are allowed while COLLECTING/INVITING, without changing global
profile names. Renaming a guest to another guest's existing name prompts the
person to use Switch participant or a distinct name; it does not overwrite or
merge either response. Availability saves use the current guest name, preventing
an older browser from undoing a rename. The webpage offers Start or continue,
a resumed-record notice and Switch participant; cookies still restore the last
selection automatically. Guests appear by name with a Guest badge in web/native rosters.

All selected people, including guests, must accept before confirmation. Only
registered participants receive Sideseat Calendar rows; their companion names
include guests with no account ID. Guests return to the same web link for details.
The new migration is additive and preserves account-based responses and older
clients. Poll deletion cascades through guest credentials and responses.
