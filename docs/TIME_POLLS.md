# Native time polls

Owner decision: 2026-10-15. Supersedes the original-page embedding in Preview 98.

SwiftUI creation, 30-minute rectangular paint/erase, immediate preview, automatic
save, participant heatmap and best windows are implemented by Sideseat. No
When2meet source code or save service is used. Sideseat account authentication
replaces provider name/password login in the app. The owner also approved a
poll-scoped browser guest on 2026-10-15; see Guest participation below.


## Current native creation presentation — Preview 194

Creation has no timetable preview: retain activity/location, candidate dates,
daily hours, time zone and the optional friends' ideas checkbox. Create the same
COLLECT plan and open sharing; availability cells first appear in plan details,
where participants select and explicitly submit. Remove creation-only timetable
state/slot calculations and dead preview grid options. Preserve existing date,
hour, title and location validation, idempotency, invitation and Calendar rules.
No backend or browser change is required.

## Current native grid interaction — Preview 193

Both editable native grids omit the one-step Undo button and snapshot state.
Tap again to deselect; hold and drag to paint or erase, and tap a day header to
select or clear that day. Existing draft/submission and final-interval rules are
unchanged. Availability uses the normal Time corner label; final-time guidance
stays in its existing text row; scroll layout and viewport dimensions remain. Older native
Undo descriptions below are historical; browser interaction is unchanged here.

## Current creation — Preview 191

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

Ordinary vertical and horizontal swipes over the cells scroll without editing.
A tap changes one 30-minute cell. Hold for 0.4 seconds for light feedback, then
drag to preview a rectangular range; release applies it and starts autosave.
Starting on an available cell erases the range. A cancelled gesture discards the
preview. The most recent committed selection change can be undone once; Undo
also uses the normal autosave queue. Cells are 44 points high, with adaptive
separator borders. Accessibility activation still toggles an individual cell.

In My availability, tapping a weekday/date header selects every candidate slot
for that date within the plan's configured hours. A partially selected day becomes
fully selected; tapping a fully selected day clears it. Other dates are preserved.
The header shows empty, partial and full states, including accessible values and
select/clear hints. This change uses the same one-step Undo and autosave queue.
Selected cells/full-day headers use teal; partially selected day headers use
amber. A compact legend, checkmarks/minus symbols and accessible values accompany
the colors in Light and Dark. Group results keeps noninteractive date labels. This does not extend the poll's
immutable time range or change anybody else's response.

UIKit tap/long-press recognition arbitrates with the enclosing scroll views;
the zero-distance SwiftUI drag that previously intercepted scrolling is removed.
The persisted slot model retains 15-minute IDs for existing data and older clients.
The current web and native grids group two adjacent slots into one 30-minute cell,
halving the row count without shrinking the 44-point/pixel touch targets. Edits
apply to both IDs. Opening an old response never rounds or rewrites it: a cell with
only one quarter selected is amber/partial; tapping it fills both quarters, tapping
a fully selected cell clears both, and Undo restores the exact original IDs.
An old range ending on an odd quarter retains its shorter boundary cell. Groups
never cross dates or discontinuous intervals; repeated DST rows keep their IDs.
Heatmap counts require each person to be available throughout the whole displayed
cell. The group result is the full timetable, without recommendation cards.
New native collection-hour pickers use half-hour steps.

## Data and saving

The detail header separates collection status, plan title, date range, optional
location and the explicitly labelled time zone. Name editing stays compact and
separate from availability controls. While editing, a persistent bottom bar shows
the actual save state: choose times, saving, saved automatically, or failed with
Retry. The saved summary includes selected days and total hours. Success appears
only after the existing serialized queue is acknowledged; failures retain the draft.
Native organizers and participants (121), and the public share page, edit directly
in the group timetable, keeping total counts and own checkmarks visible without a
completion or personal/group switch. A participant's saved response keeps the table
visible with a next-step notice to wait for the organizer and explicitly confirm
the final invitation. Availability does not confirm participation or create a
Calendar entry.

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

Preview 113 binds each native refresh to its request and the current local edit
revision. A refresh started before a selection, nickname edit or plan mutation
cannot later overwrite the acknowledged change or display an obsolete error.
Refresh does not start during a queued save or mutation; serial/coalesced writes
and explicit retry remain unchanged. Expired plans are read-only and appear in
Ended, as defined in Unified plans.

Verification is recorded in the dated QA/release records. Historic When2meet
phone runners and receipts are evidence for Preview 98 only and must not be run
against the native replacement.

## Guest participation — owner decision 2026-10-15

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
