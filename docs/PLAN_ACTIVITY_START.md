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

Theme → everyone suggests activities and marks interest → organizer explicitly
chooses an activity → existing timetable → review roster → send invitations →
individual explicit confirmations → Calendar.

The same plan token, link, account/guest identity and availability are retained.
People can fill free time before the activity is selected. Suggestions and
multiple interests never create an availability response, invitation, acceptance
or Calendar entry. The organizer can choose without waiting for every voter;
interest counts do not select a winner automatically.

## Presentation

Activity ideas lead while choosing; the timetable remains directly reachable.
After choice, the timetable leads again and prior suggestions remain available.
The organizer first selects a candidate locally, then commits Set activity and
continue. App participants and web guests can suggest, mark/unmark interest and
see supporters. Web visitors enter/resume their existing poll-scoped name.

Plans cards distinguish Your activity ideas needed, Ready to choose an activity
and Waiting for the activity choice, while keeping the vertical-task/horizontal-
waiting layout. Interested participants receive one local activity-chosen notice
on the next authenticated refresh; this is separate from the final invitation.

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
