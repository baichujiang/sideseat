# Shared native plan presentation

Owner decision: 2026-10-18. First converge visible status, next action and reusable
components, while preserving existing records and each plan's rules. Merge actual
shared backend capabilities separately, only after validating their contracts.

## Entry points

- Together retains intention → contextual greeting → written reply → conversation
  → explicit plan proposal. Showing interest or replying never creates attendance.
- A conversation can propose a bilateral plan with its existing participants and
  context. Sharing an existing manual-plan link opens that same manual plan.
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

The visual refinement keeps one adaptive card surface and a restrained hairline, instead
of giving waiting cards a disabled-looking solid gray fill. Task actions are compact text
and arrow affordances within the single card button. Titles follow headline/callout scales;
metadata is quieter, section counts are unboxed, and Upcoming merges location/peer into one
secondary line. The decorative date column aligns with the text at the top and remains
flexible at accessibility sizes. Horizontal peeking and View all remain visible; the swipe
hint is available to accessibility without adding a permanent helper row.
Standard Chinese, one-line-title fixture budgets are 164pt for task, 148pt for waiting and
124pt for upcoming. These are UI regression limits, not fixed production heights: long or
cross-day/foreign-zone content and accessibility sizes can grow naturally without cropping.

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

Manual plan detail is organized around the timetable. A flat `PlanDetailHeading`
contains the activity, current status, role and optional location. Collection
keeps the editable name, date range and response count close to the grid, with the
full names behind the response-count control. Invitation/confirmed detail shows
the activity once, then the read-only highlighted timetable, confirmation count
and Calendar explanation. Selected attendees and their individual replies open
from Who's joining. Neither participant sheet changes selections or attendance.
The bottom action area emphasizes the current share, choose-time, explicit
confirmation or Calendar action; copying is a secondary labeled icon control.
Rescheduling and nickname editing stay secondary, with destructive management
in the existing menu. No duplicate summary/attendee cards precede the timetable.

| Display status | Viewer's next step |
| --- | --- |
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
