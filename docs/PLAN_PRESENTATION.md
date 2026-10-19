# Shared native plan presentation

Owner decision: 2026-10-18. First converge visible status, next action and reusable
components, while preserving existing records and each plan's rules. Merge actual
shared backend capabilities separately, only after validating their contracts.

## Entry points

- Together retains intention → contextual greeting → written reply → conversation
  → explicit plan proposal. Showing interest or replying never creates attendance.
- A conversation can propose a bilateral plan with its existing participants and
  context. Sharing an existing manual-plan link opens that same manual plan.
- Plans also offers a shared-theme start: suggestions/interests → explicit organizer
  activity choice → the same manual timetable and invitation flow. Existing records
  skip it; see [Activity choice](./PLAN_ACTIVITY_START.md).
- Plans creates manual availability collections or fixed-time invitations. Friends
  may participate through the existing public guest page without a conversation.

## Shared display

The native list, manual detail, conversation summary/list and chat plan card use
one read-only presentation vocabulary. `PlanPresentation` adapts the existing
`NativeTimePoll` / list DTO and `NativePlanRequest`; it never writes or converts
persisted records. `PlanStatusBadge`, `PlanNextStepSummary`, `PlanCardSchedule`
and the card heading/action components share the view implementation.

The Plans overview uses independent vertical task cards for the viewer's next steps and a
horizontal rail for plans waiting on others. Task cards lead with a viewer-specific status
(e.g. Your confirmation needed), activity and concise schedule, ending in one review/open
affordance. Opening never confirms participation or sends an invitation. Waiting cards use
quieter fills, a short viewer status and response/confirmation progress without repeating the
next-step paragraph. Upcoming cards use a date-first summary in both Next meet-up and the
full Upcoming section. Full lifecycle status stays in detail; no persisted phase is changed.
Local overview dates omit the current year and technical timezone identifier. Cross-day end
dates, other years and foreign-zone context remain explicit, including DST offset changes.
The detail timetable keeps the complete original date/time/zone information.

Preview 134 implements the owner-approved first-version home: a scoped warm ivory/forest/sage
palette, original photographic introduction and compact activity artwork. Default title-matched
covers require no extra creation step and do not change the activity. Undecided plans retain a
neutral suggestion theme. The introduction explains the purpose, provides one primary create
action, a link entry and an immediately visible optional read-only example sheet. Existing-plan
creation is one labeled toolbar action. The illustrative hero never represents actual attendees.

The compact layout uses three content groups. Task cards put the viewer-specific status above
the activity and schedule, with a small activity thumbnail beside them and a real-people/action
footer. Confirmation review is filled forest; availability uses pale sage. Waiting cards use a
sage surface with activity/schedule, real-people status/progress and a quiet open link. Bilateral
outgoing invitations say Waiting for [name] to confirm. Real organizer/inviter and existing
avatars come from the current record; no fictional friend roster is inserted. Manual-list
peoplePreview excludes the viewer/organizer and blocked accounts; invitation phases use selected
invitees, including fixed-time invitees without availability responses. Older DTOs remain valid.
Task/Waiting keep location and complete progress in detail to control height. Upcoming retains
its small date block, activity/status, weekday/time and condensed metadata. Full dates remain
available to VoiceOver. Accessibility sizes omit decorative thumbnails, stack the footer and
allow complete wrapping. Horizontal peeking, View all and accessibility swipe hints remain.
Final standard Chinese fixture measurements are 128.67pt for task, 150.67pt for a two-line task,
120.33pt for waiting and 85.67pt for Upcoming. These are measurements, not fixed production
heights: cross-day/foreign-zone content and accessibility sizes can grow without cropping.

The horizontal rail previews the next card,
snaps to card boundaries and provides View all / Show fewer plans. One item fills
the available width. Accessibility text sizes use a wrapping vertical group so
large text remains readable. These are layout choices over the same classification,
records and detail routes; browsing or expanding never sends a reply. The rail
owns horizontal gestures without switching the surrounding Plans section pager.

Existing-plan creation/link controls sit directly on the page, with the purpose
example still available. Empty accounts keep the full introduction. The next
meet-up and Upcoming use the same compact date summary; Past retains its existing
history, feedback and continuation actions.

Manual collection always shows the timetable, including plans with undecided
activities. A compact ideas section expands inline for suggestions, interest and
optional explicit activity selection; native suggestion input stays in that page.
One vertical detail scroll owns the header, expanded ideas and full-height grid at
all text sizes; date columns still scroll horizontally. The bottom action area
remains reachable. An organizer can select time and review activity/roster together.
Creation keeps the Preview 132 single form and contextual shortcuts.
Manual scheduling detail is organized around the timetable. A flat `PlanDetailHeading`
contains the activity, current status, role and optional location. Collection
keeps the editable name, date range and response count close to the grid, with the
full names behind the response-count control. Invitation/confirmed detail shows
the activity once, then the read-only highlighted timetable, confirmation count
and Calendar explanation. Selected attendees and their individual replies open
from Who's joining. Neither participant sheet changes selections or attendance.
The bottom action area distinguishes a local choice from a committed response or navigation.
`PlanActionButton` / `PlanActionLabel` share these roles in manual and chat plan controls:

| Purpose | Appearance and label |
| --- | --- |
| Create, send invitations, confirm participation | Filled ink/chalk button with plus, paper plane or checkmark; only the existing explicit handler commits the action |
| Choose/adjust time, review invitation list | Outline with timetable/pencil/people icon; choosing and reviewing remain local drafts |
| Share and copy | Outlined share-sheet action, separate plain Copy link with visible text and copied feedback; both wrap vertically at accessibility sizes |
| Open a link, view Calendar, return | Light navigation row with destination icon and trailing arrow |
| Decline | Red text with an x-circle and explicit I can't attend wording; destructive management remains in its menu |

Compact overview task actions use the confirmation/availability treatments described above,
with an action-specific symbol and chevron; waiting cards use a lighter text link.
The entire card still opens the original detail,
without nested buttons or implicit confirmation. Icon, wording and structure communicate
the role together; purpose is not encoded solely by color. Existing accessibility IDs,
loading/disabled state, 44pt-or-larger actual button targets and dynamic wrapping remain.
At accessibility sizes the final-time footer uses the shorter Review invitees label
and leaves the complete selection instructions beside the scrollable timetable,
avoiding duplicate large paragraphs in the pinned controls. Text is not scaled down.
Rescheduling and nickname editing stay secondary, with destructive management
in the existing menu. No duplicate summary/attendee cards precede the timetable.

| Display status | Viewer's next step |
| --- | --- |
| Choosing activity and time | Ideas are optional inline input. Participants without a saved availability response still need to fill it; those who responded wait for the organizer. The organizer can share or choose final time, then review activity and invitees together |
| Finding a time | Organizer can view/share immediately and edit own availability directly in the timetable, then choose a time after friends respond; other participants fill availability and wait for the organizer |
| Awaiting confirmations | Invited viewer explicitly confirms; an accepting participant waits; manual organizer reviews replies/shares; bilateral sender waits for the recipient |
| Awaiting confirmations, viewer declined | Own reply is saved; no claim that this viewer is waiting to attend |
| Awaiting confirmations, viewer not selected | Explain exclusion and retain saved availability; no confirmation action for a closed roster |
| Confirmed / In progress | Included account holder can view Calendar; unselected viewers have no Calendar membership |
| Ended | View history; bilateral feedback remains available only under its existing eligibility rule |
| Cancelled / Expired / Superseded / Unavailable | View the existing result/history; no new acceptance prompt |

Overview cards name the review/open action (for example Review invitation or View arrangement);
the Calendar action remains inside the existing confirmed detail. Pending invitations use the same explicit Confirm participation wording in
chat and manual details. The existing stable accessibility IDs remain in place.
Dark mode and accessibility text sizes use the same wrapping components.

## Preserved contracts

- No API, Prisma schema, migration, existing identifier, participant list, consent
  record, acceptance transaction, notification/read-history rule or Calendar
  projection is merged by this stage.
- Bilateral proposals retain accept / counter / decline / withdraw / cancel.
  A proposed reschedule keeps the accepted time until the new time is accepted.
- Manual collection invitations retain the selected roster and invitation version;
  fixed invitations retain their target count and open-seat rules.
- Filling availability is not accepting. A guest keeps the browser identity and
  confirmation flow; no guest account or personal Calendar is created.
- Bilateral Outcome / Meet Again / Repeat eligibility stays with its existing
  contract. Manual plans do not gain these privileges from shared presentation.
- No public discovery, Pod, group chat, old Action acquisition entry or archived
  feature is enabled.

The owner requested a saved flow baseline before the card refresh:
[baseline version 1](./PLAN_FLOW_BASELINE_2026-10-18.md). Current validation and
installation are recorded in the dated QA/release documents and
[deployment state](./DEPLOYED_STATE.md), rather than inferred from this contract.
