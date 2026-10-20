# Unified manual planning

Owner approval: 2026-10-15. Delivery status: [Deployed state](./DEPLOYED_STATE.md).
Product authority: [Product](./PRODUCT.md), [User Flow](./USER_FLOW.md).

## Invite before availability responses — owner correction 2026-10-19

The organizer can choose the final time immediately, including zero responses or
only their own availability. A response is not a prerequisite for being invited.
Review defaults to a shareable formal invitation when no other respondents exist:
confirm the total participant count (including the organizer, default two), create
the invitation, then share the same plan link. Friends see the highlighted final
time and explicitly confirm, without filling availability first.

Existing respondents can still be selected as a closed roster. A secondary Invite
more friends by link action adds room for people who have not responded. The new
optional linkParticipantCount on the existing invitation request explicitly opts
into the existing FIXED link-joining/capacity/confirmation rules on this same plan;
token, candidate slots, saved responses and activity records are preserved. There
is no duplicate plan or automatic confirmation for a friend. The organizer accepts
on sending, and Calendar still waits for the displayed total and every selected
person's explicit acceptance. Cancelled drafts change nothing; old requests retain
closed-roster behavior. Existing FIXED cancellation and version rules apply.


## Default single-form creation — Preview 132

The default is activity/place/time → Create timetable. The time summary opens
inline date/hour editing and defaults to the next seven days. No mode selection
or Next page is required. Optional text shortcuts enable activity ideas or an
exact-time invitation in the same form, retaining inputs. Existing API, records,
expected-count defaults, timetable editing and explicit attendance contracts stay
unchanged. Earlier dated creation-screen descriptions below are superseded.

## Optional activity choice — Preview 131

A new manual plan may start with a theme, then collect suggestions and multiple
interests from App accounts and public guests. Only the organizer explicitly sets
the activity. This continues the same TimePoll into scheduling, retaining its link,
identities, slots and any free time filled beforehand. It adds no attendance or
Calendar consent. Known activities and existing records skip the optional stage.
The one-form theme start defaults to the next seven days; date/hour review is
optional, and no estimated response cap is set. See
[Activity-choice contract](./PLAN_ACTIVITY_START.md).

## Activity and time on one page — Preview 133

Activity suggestions and free-time input run in parallel in one collection page.
The organizer can choose final time directly, then select the activity and invitees
in the same review. Activity/roster drafts survive adjusting time, and are committed
only by sending (activity first through the existing endpoint, then invitation).
A suggestion or interest does not satisfy the availability task. The existing
records, consent versions, cancellation, expiry and Calendar rules are unchanged.
This supersedes separate activity-board/timetable presentation below.

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


## One shared lifecycle

`TimePoll` is the persisted root of manual plans. `COLLECT` starts in COLLECTING;
`FIXED` starts in INVITING with its creator accepted. Known-activity creation
supports 2–20 expected people, with five as the native default. The optional
theme start leaves the response estimate unset; the existing invitation roster
limit remains twenty. Existing conversation-bound
PlanCommitment/PlanRequest records remain intact and appear alongside these
records in Plans. Their origin consent, bilateral Outcomes and Repeat rules are
not imported into manual plans. Discovery Pod and archived code remain disabled.

The native first-level Plans page owns creation, shared-link entry, confirmation
progress and availability collections. An existing card, successful creation,
message link or external deep link opens one canonical detail above that root.
Back returns directly to Plans, including after Done selecting. Creation alone
uses a dismissible form sheet; the secondary TimePollSheet list is not part of
current Plans or Messages navigation. Root cards refresh after saved responses.

## Final-time selection in the timetable — Preview 122

The organizer explicitly starts **Choose final time**, then picks a continuous
candidate-backed range in the same timetable by tapping start/end or holding and
dragging. A date selects all configured hours for that date. An unsent label,
calendar icon and separate outline distinguish this draft from personal availability;
counts stay visible and no response is changed. New invitations start without a
preselected range. The next action opens a roster-only review with exact time and
availability labels. Adjusting time retains both the range and checked roster.
Only Send invitations mutates the existing invitation API/version. Cancelling a
draft changes nothing; rescheduling uses the same selection with the old range
prefilled. Existing identity, consent and Calendar rules remain unchanged.

## Explicit submission and local recovery — Preview 137–141

Selection gestures only update local drafts. Submit my availability / Save changes
sends one complete snapshot; failures retain it for an explicit retry. Later edits
are neither published by that request nor cleared by its acknowledgement. Empty
responses are valid. Submitted counts, heatmaps and rosters stay on the server
baseline; draft checkmarks and selected-day/hour summaries remain separate.

Peer responses and plan phases refresh during editing without replacing local
selections or nickname drafts. Older reads cannot roll back submitted or mutated
state. Final invitations display their actual highlighted time and can be accepted
without publishing a draft. Dirty availability does not block final-time selection,
roster review, invitation sending or other plan actions. Only requests actually in
flight block conflicting/duplicate mutations. The existing invitation/capacity,
version, expiry and explicit Calendar confirmation rules remain unchanged.

Native drafts are device-local and scoped by account ID + plan token. Browser
drafts use versioned localStorage keyed by plan token + viewer identity, preserving
separate drafts when switching guests. Recovery is explicitly unsubmitted. Leaving
or backgrounding sends no availability request; an acknowledgement clears only its
matching draft, retaining newer edits, including reverting during a slow request.
If browser storage fails, the page reports it and keeps the unsaved-leave warning.
There is no cross-device draft sync or automatic availability retry.

The existing API and quarter-hour records are unchanged. Public response returns
the already computed authenticated result; identical submitted snapshots still
skip redundant response/guest/updatedAt writes inside existing validation/locks.
This supersedes Preview 136's 700 ms timer, background flush and draft-blocked
mutation rules, and earlier autosave descriptions below. Dated release evidence
remains historical.

## Native participant timetable — Preview 121

Native participants now use the same editable group timetable from their first
visit through saving and reopening. Own selection checkmarks and total counts
remain visible together, with tap/hold, date selection, undo, and the existing
serialized autosave queue. No personal/group switch, completion button or saved-only
handoff remains. Save feedback and a compact next-step notice stay at the bottom:
wait for the organizer's final invitation, then explicitly confirm here.
The save bar fills the screen width. Accessibility text uses one vertically
scrollable page and wider time/date columns so complete time labels and editable
cells can be brought above the fixed save bar.
This supersedes the participant waiting-screen descriptions in earlier dated
sections. Invitation review and terminal phases retain their read-only/consent rules;
no data, API, identity, invitation-version or Calendar contract is merged or changed.

## Shared web timetable — 2026-10-18

After entering or resuming a guest name, the public share page keeps one editable
group timetable on screen. The guest can tap/drag their own availability while
seeing everyone's counts; own checkmarks and partial states remain distinct.
Autosave, date selection, undo and name/participant switching retain the existing
identities and slot IDs. Saving and reloading do not require a separate completion
or view switch. A persistent notice explains to wait for the organizer's exact
invitation, then explicitly confirm here. Availability never accepts an invitation.
This supersedes the dated Preview 116 web saved-only handoff below; fixed-time,
versioned confirmation and Calendar rules remain unchanged.

## Direct timetable editing — Preview 119

The organizer now edits their free time directly in the shared timetable during
collection. Each cell retains the total availability count and adds a checkmark
for their own selection; tap again to clear, or use hold/drag, date selection and
undo. Changes autosave with persistent saving/saved/error feedback. Reopening
retains the same editable table, with no mode switch or completion button.
Current draft counts replace only the organizer's response, once. Invitation
review/rescheduling remains read-only; participant waiting and confirmation flows
retain their existing rules. This supersedes 118's separate own-availability action.

## Organizer timetable on creation — Preview 118

The organizer opens directly on the complete timetable, including zero responses.
Sharing/copying and an optional own-availability action are available immediately.
Saving own availability and reopening retain the timetable; the organizer no
longer goes to the saved-only sharing handoff. With friend responses, the invitation
action appears alongside sharing. Participant waiting screens and all API/data,
consent and Calendar rules remain unchanged. This amendment supersedes the
organizer handoff described in the dated Preview 116 section below.

## Shared native presentation — Preview 117

Plans, manual detail and conversation-based Plan summaries/cards share display status and
viewer-specific next-step components. Existing TimePoll and bilateral records and lifecycle
contracts remain separate. See [Shared native plan presentation](./PLAN_PRESENTATION.md)
and [Preview 117 acceptance](./qa/2026-10-18-plans117.md).

## Guided native planning — Preview 116

Plans leads with **Find a time your friends can all make**, a **Find a time with
friends** action and the entry for an existing invitation. An expanded, explicitly
labelled study-session example shows three friends' availability, their shared
Saturday 15:00, and the organizer-choice → confirmation → Calendar result.
Accessibility text sizes use an equivalent sentence instead of a cramped grid.
Empty accounts omit empty section filters. Existing **Your next
steps**, **Waiting for others**, Upcoming and Past classification stays intact.

Creation has two parts: activity name/optional place/timing method, followed by
candidate dates or the actual meeting time. Example activity buttons let a user
start without inventing a title. The first Next action requires a title; Edit
activity preserves entered values. COLLECT puts range/estimate details behind an
optional disclosure, while FIXED keeps the required group size. Validation and
actual instants follow the chosen method. The final action names the next task.

`GET /api/v1/time-polls` adds optional `isOwner`, `didRespond` and `planningMode`
fields. They identify whether to fill in, share, choose a time, confirm, or wait;
the internal response rows are not returned. FIXED progress uses expectedCount;
COLLECT invitation progress uses its actual roster. These are additive read-model
fields, with no Schema or migration change.

Availability editing focuses on selecting free time, with green selection and
a saved-only **Save and continue** action. A saved organizer with no other responses
sees a dedicated share handoff; a participant sees that they are finished for now
and must confirm a later invitation. Share/copy and edit availability are explicit.
Once others respond, the organizer sees the complete timetable and a persistent
**Set time and send invitations** action. Unsaved work never shows the saved handoff.
Confirmation retains the exact time, roster, count, and Calendar rule; only complete
acceptance enables the Calendar action. Large text, dark mode and direct return to
Plans remain supported. Shared APIs and lifecycle semantics remain unchanged.

The public link follows separate tasks. Before joining, the visitor sees the
activity, candidate dates, the purpose of collecting availability, and a name
form. **Next: choose my free time** opens the editable timetable.
The name-to-editor transition scrolls the active task into view, so mobile Safari's
app banner and the persistent save bar do not hide the first time cells. This runs
on entering/resuming the participant, not on each autosave or refresh.
Green selection,
30-minute cells, automatic save feedback and the saved-only **Save and continue**
action explain how to finish. Explicitly choosing no available times also counts
as a saved response. Range/day gestures remain available in a short disclosure.
After continuing, a dedicated waiting page explains that the organizer must pick
the final time, and the visitor returns to this same link to confirm participation.
Editing and group results remain available. The final invitation shows the actual
time/place and a persistent **Confirm participation** action. FIXED links skip
availability and still require explicit confirmation after entering a name.

- COLLECTING: immutable candidate slots, one autosaved response/account or browser guest.
  The complete heatmap and response count are primary. No duration is required,
  and no common-time/maximum-attendance cards are shown. The older summary/window
  fields remain compatible for existing clients.
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
- EXPIRED: an unconfirmed invitation reaches its chosen start, or every candidate
  collection window has ended. GET detail/list derive this state and optional
  `expiresAt` from existing dates and the plan's IANA time zone; no migration or
  rewriting of confirmed facts is required. Native Plans moves it to Ended;
  native/web details explain that no Calendar entries were added and close
  response, nickname and new-participant actions. The creator may delete it.
  Already-confirmed plans retain their existing Calendar and elapsed-time rules.

Before confirmation, COLLECT creators may resend another time/roster. Version
increments, other participants reset to INVITED, and stale responses return 409.
Availability is frozen after the first invitation. The creator manually selects
start/end and reviews the roster; half-day and full-day ranges are supported.
Heatmap availability alone is never acceptance.

Native notifications consume the API's `INVITED` status. Preview 113 recovers
missed Preview 112 invitation fingerprints once while retaining existing read
history. Invitation/change notices carry their deadline and expire locally,
including while the app remains open. Elapsed pending conversation invitations
also report EXPIRED and no longer contribute to the inbox action count.

## API and data ownership

Existing `GET/POST /api/v1/time-polls`, `GET/DELETE /{token}` and
`PUT /{token}/response` remain. Additive routes under `/api/v1/time-polls/{token}`:

| Method/path | Behavior |
| --- | --- |
| POST `/invitations` | Owner selects future start and explicit end, response IDs, current version; omitted end retains the legacy duration/60-minute fallback |
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
