# Optional activity choice before scheduling

Owner approval: 2026-10-19. Delivery status belongs to [Deployed state](./DEPLOYED_STATE.md).

Owner refinement — Preview 132: one default creation form, with optional shortcuts.
The form opens directly on activity name, optional location and a visible date/hour
summary. The next seven candidate days are preselected; expanding the time row edits
dates/hours in place. Create opens the timetable with no mode decision or Next step.

Not sure what to do? Ask friends for ideas is a secondary text action in that same
form. Time already set? Send an invitation switches to exact time/duration/target
count inline. Returning to the default preserves name, place and candidate dates.
The optional theme path still joins the same planning lifecycle below.

## Integrated planning surface — Preview 133

The same plan contains optional activity ideas and an always-editable timetable.
There is no activity/timetable mode switch in the App or share page. An inline,
collapsible ideas section keeps suggestions, interest and supporters beside the
existing timetable. Native suggestion input expands in place. Interest never
completes the separate availability task; participant cards still ask for free time
until a response is saved. The existing vertical-action/horizontal-waiting layout stays.

Theme → share the same plan → suggest/mark interest and fill free time in parallel
→ organizer selects final time in the timetable → review activity and invitees
→ send invitations → individual explicit confirmations → Calendar.

An organizer may explicitly choose an activity from the inline section, or select
it in the final invitation review. In review, activity/time/roster are local drafts;
returning to adjust time retains the activity and roster draft. Merely selecting,
opening or cancelling review writes nothing. Sending saves the selected activity
through the existing owner-only endpoint, then sends invitations through the
existing invitation endpoint. If the first request fails, no invitation is sent;
if invitation sending fails, the already-saved activity remains visible for retry.
The send action stays disabled for an undecided activity. A closed roster requires
another selected person; a shareable formal invitation instead specifies the total
participant count and allows people to confirm without prior availability. See
[Invite before availability responses](./UNIFIED_PLANS.md).

The same plan token, link, account/guest identity and availability are retained.
Suggestions and multiple interests never create an availability response,
invitation, acceptance or Calendar entry. The organizer need not wait for every
voter; interest counts never select a winner automatically.

## Product references and module boundaries

Owner request 2026-10-19: combine the useful capabilities of mature products in
SideSeat's existing modules, keeping one default flow.

| Reference | Adopted in SideSeat | Boundary |
| --- | --- | --- |
| [Howbout](https://howbout.app/blog/group-planning/how-to-find-a-date-that-works-for-everyone-/) | One plan reached from Plans, existing conversation links and Calendar | Existing campus discovery and bilateral consent remain separate |
| [Timeful](https://github.com/schej-it/timeful.app) | Direct availability input and simultaneous group overlap in the timetable | No automatic duration, roster, calendar disclosure or time winner |
| [Tricider](https://www.tricider.com/features), [PollUnit](https://pollunit.com/en/questions/13/how-can-participants-add-their-own-options-in-a-poll) | Everyone can add suggestions and mark multiple interests inline | Activity preference is separate from availability and attendance |
| [Rallly](https://github.com/lukevella/rallly) | Organizer reviews the final arrangement and recipients before sending | Every selected person explicitly confirms the same invitation version |

This integrates product interactions using SideSeat's own SwiftUI, React and API
implementation; it imports no third-party product code or new dependencies.
Optional personal-calendar overlays, subset filtering and copying plans are future
enhancements, not part of this delivered core integration or its acceptance claim.

## Data and authorization

The two additive tables TimePollActivityIdea and TimePollActivityInterest retain
suggestions/interests independently of TimePollResponse and TimePollInvitation.
Three nullable TimePoll columns retain the original theme and explicit selection.
Existing rows have null activity metadata and never enter this stage automatically.
COLLECTING/INVITING/CONFIRMED and legacy client DTO fields retain their meanings.

All writes lock the existing plan row, verify the actor/guest session, block
relationships and collection expiry. Only the organizer can select an activity.
Choosing copies the selected activity title/place, without replacing slot IDs,
responses, invitation version or participants. Before invitations, the organizer
may select another existing suggestion; after invitations the choice is closed.
Known confirmed-plan cancellation/recreation rules remain in effect.

A plan has up to twenty suggestions; duplicate names are rejected with guidance
to use the existing option. Interest is an idempotent per-person boolean per idea.
Related ideas/interests are removed through existing plan/account/guest deletion
foreign keys. Account IDs/guest credentials are not exposed in the public ideas DTO.

Native endpoints under /api/v1/time-polls/[token]/activities: POST suggestion,
PUT interest, POST choose. Public endpoints expose only suggestion and interest,
using the existing guest cookie and participant ID binding. Existing APIs reject
sending an invitation while the activity remains undecided.

## Verification and release

Verify both starts, multi-person native/web contributions, same-name guest resume,
multiple interests, owner-only choice, availability retained across selection,
closed mutations after invitations, explicit consent and unique Calendar rows.
Release through a verified production-source overlay with an additive migration
and verified private backup before promoting the tested candidate. Native Preview
must be installed only after the required backend release.
