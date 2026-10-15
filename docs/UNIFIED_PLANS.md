# Unified manual planning

Owner approval: 2026-10-15. Delivery status: [Deployed state](./DEPLOYED_STATE.md).
Product authority: [Product](./PRODUCT.md), [User Flow](./USER_FLOW.md).

## One shared lifecycle

`TimePoll` is the persisted root of manual plans. `COLLECT` starts in COLLECTING;
`FIXED` starts in INVITING with its creator accepted. Manual plans support 2–20
expected people, with five as the native default. Existing conversation-bound
PlanCommitment/PlanRequest records remain intact and appear alongside these
records in Plans. Their origin consent, bilateral Outcomes and Repeat rules are
not imported into manual plans. Discovery Pod and archived code remain disabled.

- COLLECTING: immutable candidate slots, one autosaved response/account or browser guest. Duration
  recommendations intersect the same attendees across every consecutive slot of
  the complete window. Expected but missing respondents prevent `common=true`.
- INVITING: a chosen future start/end and explicit roster. Creator send is explicit
  acceptance; each other selected person accepts or declines. For FIXED,
  link holders can join until the target count is filled. Declining that open link
  does not consume a seat. No Calendar entry exists before completion.
- CONFIRMED: every selected participant accepted the same invitationVersion.
  All projections and companion rows are written atomically in that transaction.
  Repeated acceptance never duplicates projections. A four-account roster creates
  exactly four projections; guests confirm on the web and have no personal Calendar row; excluded respondents retain history, not membership.
- CANCELLED: creator cancellation, Block or affected account deletion removes all
  Calendar projections. Unblock does not restore them. Collecting/cancelled roots
  may be deleted by their creator. Confirmed plans do not support in-place
  rescheduling in this release; create a fresh plan after cancellation.

Before confirmation, COLLECT creators may resend another time/roster. Version
increments, other participants reset to INVITED, and stale responses return 409.
Availability is frozen after the first invitation. A recommendation can be sent to
an explicitly reviewed roster; heatmap availability alone is never acceptance.

## API and data ownership

Existing `GET/POST /api/v1/time-polls`, `GET/DELETE /{token}` and
`PUT /{token}/response` remain. Additive routes under `/api/v1/time-polls/{token}`:

| Method/path | Behavior |
| --- | --- |
| POST `/invitations` | Owner selects future complete window, response IDs, current version |
| PUT `/invitation-response` | Authenticated viewer accepts/declines current version |
| POST `/cancel` | Owner cancels current version and removes projections |

All use the authenticated v1 envelope and OpenAPI contract. The 192-bit token
serves as an invite capability for link holders. The guest web page shows the
shared poll and supports filling, nickname editing and confirmation without
downloading or registering; see [Guest participation](./TIME_POLLS.md#guest-participation--owner-decision-2026-10-15). No third-party code/page/save service is involved.

TimePollInvitation has unique `(pollId,userId)` membership. CalendarEntry has an
optional cascading TimePoll relation, unique `(userId,timePollId)`, and a relation
index. Two additive forward migrations extend existing tables and create the
invitation table; old migrations/data are preserved. Generic calendar mutation
APIs exclude these entries. Schedule/search DTOs include timePollToken only for
manual-plan projections, preserving existing payload shapes otherwise.

Shared plan writes acquire existing ordered user safety locks before a poll row
lock. Block/account removal use the same safety boundary and remove projections.
The native autosave queue remains bound to its login generation; mutation actions
wait for the current save. Detail refresh reads the same persisted root. Plans
and Calendar reload after changes and foreground activation.

“Calendar sync” here means each participant's Sideseat Calendar. Existing calendar
subscription/export can expose those entries under the user's configured access;
this release does not silently write to an external Apple/Google calendar.

## Verification

Local API tests: `e2e/api-v1-unified-plans.spec.ts`, plus existing native time-poll
regression. Domain: `tests/time-polls/domain.test.ts`. Native live UI runner:
`ios-native/SideSeatUITests/UnifiedPlanLiveUITests.swift` with
`ios-native/phone-qa/unified-plans100/project.yml`. It uses explicit isolated test
accounts and ephemeral app credentials, never the device owner's session.
Dated QA and release receipts distinguish simulator, backend and physical device.
