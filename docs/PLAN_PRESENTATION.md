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
persisted records. `PlanStatusBadge`, `PlanNextStepSummary` and
`PlanOpenActionLabel` share the view implementation.

| Display status | Viewer's next step |
| --- | --- |
| Finding a time | Organizer can view/share immediately and edit own availability directly in the timetable, then choose a time after friends respond; other participants fill availability and wait for the organizer |
| Awaiting confirmations | Invited viewer explicitly confirms; an accepting participant waits; manual organizer reviews replies/shares; bilateral sender waits for the recipient |
| Awaiting confirmations, viewer declined | Own reply is saved; no claim that this viewer is waiting to attend |
| Awaiting confirmations, viewer not selected | Explain exclusion and retain saved availability; no confirmation action for a closed roster |
| Confirmed / In progress | Included account holder can view Calendar; unselected viewers have no Calendar membership |
| Ended | View history; bilateral feedback remains available only under its existing eligibility rule |
| Cancelled / Expired / Superseded / Unavailable | View the existing result/history; no new acceptance prompt |

Cards that navigate to detail say View plan before a Calendar action is available
inside. Pending invitations use the same explicit Confirm participation wording in
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

The larger flow proposals discussed before this stage (collection capacity,
explicit initial time/roster selection and expanded rescheduling) are separate
follow-up work. This stage does not claim they have shipped.

Validation and actual installation are recorded in the dated Preview 117 QA and
release documents, rather than inferred from this design contract.
