# Unified manual planning

Owner approval: 2026-10-15. Delivery status: [Deployed state](./DEPLOYED_STATE.md).
Product authority: [Product](./PRODUCT.md), [User Flow](./USER_FLOW.md).

## Current manual plan flow — 2026-10-24

Enter activity and optional location → choose candidate dates and daily voting
hours (optional friends' activity suggestions) → create one COLLECT plan and
open its editable timetable without a share modal → organizer fills their own
availability → Submit and share explicitly saves it, then opens sharing to App
contacts or browser guests → friends fill the timetable and explicitly submit →
organizer selects a continuous final interval
on the same timetable, reviews invitees and sends formal invitations → each
invitee accepts, declines or leaves pending → organizer may publish at any time;
only accepted account participants are notified and receive their unique
SideSeat Calendar projection. Guests view the published arrangement on the share
page and retain the same RSVP version rules, without a personal Calendar row.
Later acceptance before the start follows the existing publication rules. Zero availability responses never block final selection or invitation.

When activity ideas are enabled, the organizer must choose the activity before
sending formal invitations. Creation has no timetable preview or separate fixed-time branch. The timetable
appears immediately after creation. Native selection supports tap/toggle and
hold-paint/erase, including cross-day final drafts; discontinuous final drafts
remain editable and disable review. Availability is a local draft until explicit
submission; filling availability is separate from accepting an invitation, and
sending invitations is separate from publishing to Calendar. Native grids have
no one-step Undo. Existing records, guest identity, invitation versions and
conversation-bound one-to-one consent rules remain unchanged.

Creation's primary action is Next: fill my availability. The first owner
submission opens sharing only after the current draft is acknowledged and clean;
failure, an in-flight newer edit or a participant submission never opens it.
Later owner edits retain Save changes. The title's share action stays available
before any submission, so filling is the recommended order, not a new gate.
Old persisted share handoffs are decoded and consumed without opening a modal;
final-time selections and review handoffs retain their existing compatibility.

Actual installed builds, source hashes and verification scopes are recorded in
[Deployed state](./DEPLOYED_STATE.md) and the
[sequential reliability acceptance](./qa/2026-10-24-sequential-reliability-fixes.md).
The Preview-numbered sections below describe dated changes; newer amendments
supersede older descriptions. They are not additional current entry paths or
fresh acceptance claims.

## Share page collection metadata — 2026-10-24

The shared browser page uses title, independent location, candidate date range,
then a small grey dot and regular grey Collecting availability caption with the
actual time zone. Activity ideas keep Choosing an activity instead. These are
passive metadata, without capsule fill, outline or an action. Existing name,
recovery, next-step text, response count and timetable remain in place.

Only COLLECTING without a fixed interval uses this layout. FIXED and invitation,
confirmed or closed information retain their original date/location/time-zone
branch. No workflow, submission, identity, invitation-version or Calendar rule
changes. Browser acceptance and source preservation are recorded in the
[web QA](./qa/2026-10-24-share-status-metadata.md).

## Card actions and content — Preview 217

Native plan overview cards omit synthesized right-side photos, category art and
fallback symbols. The existing title-derived card tint and actual people remain.
The title/status/location can use the complete information column. Task footers
keep progress at the leading edge and the action at the trailing bottom edge;
only the count/action retain intrinsic width, leaving the existing spacer free
to expand. The existing vertical fallback handles insufficient width and large
text without adding a row when the horizontal footer fits.

The entire card remains its original single button, with the same route and full
AX description. Dates, phases, counts, activity suggestions, invitation and
Calendar contracts stay unchanged. Unused cover rendering and its render-only
flag were removed; no new state, request, data field, component or dependency.
See [217 QA](./qa/2026-10-25-card-actions.md).

## Candidate date hierarchy — Preview 216

Candidate-only overview cards now use a small localized month (and year when
needed), a prominent day range such as 25–31, and subordinate actual selectable
date count plus Time to be decided. Sparse dates keep their actual count; the
range shows the first and last selected dates, not a continuous final interval.
Cross-month/year ranges retain complete endpoints and needed years, with a
whole-date fallback when the concise range does not fit; if a whole endpoint
cannot fit, year and complete month/day form explicit groups. Single/missing dates
keep their existing semantics. The 112pt regular column and xxLarge stacking,
known-time schedule branch, full AX dates and all existing rules stay unchanged.

This corrects a display discrepancy: the owner's 14 Plus already had Preview215,
but its candidate-only cards differed from demos with chosen times. Acceptance
uses seven-date candidate plans as its primary example. See the
[216 QA](./qa/2026-10-25-candidate-hierarchy.md).

## Readable schedule endpoints — Preview 215

Native overview dates use a prominent month/day, with weekday and any required
start year beneath. Same-day intervals keep both clocks together when they fit;
otherwise each complete clock gets a row. Cross-day intervals explicitly group
the start date/time and the arrow-linked end date/time, retaining the end year.
The regular leading column is 112pt; xxLarge and larger text stack schedule above
activity information. Full accessibility descriptions and existing time-zone,
submission, invitation and Calendar rules stay unchanged. Candidate dates remain
undecided, with count and complete first/last dates on separate rows. See the [215 QA](./qa/2026-10-25-plan-schedule.md).

## Unified native card schedule — Preview 214

Actionable, waiting and confirmed overview cards share the same leading date/time
column and trailing name, state, available location, people/progress and next step.
Small existing activity artwork moves to the trailing edge. At accessibility sizes
the schedule and information stack without fixed column width or body-text caps.

Existing concrete intervals, including pending conversation invitations, keep
their real clock values. Cards with only candidate dates show their original date
count/range and Time to be decided. Cross-day end dates, years and time zones keep
the existing formatter; candidate windows never become a chosen final interval.
Only the existing private card layout changes; grouping, navigation, submission,
invitations and Calendar rules remain in place. See the [214 QA](./qa/2026-10-24-plan-date-column.md).

## Native Plans home — Preview 213

Planning and Confirmed remain the two root sections, with the fixed title and
existing history entry. Start a plan moves to a trailing capsule above the native
tab bar; the root safe-area inset reserves its own space outside the lists.
The same creation sheet and create-to-timetable handoff remain in place.

Actionable plans stay vertical, while waiting plans keep their horizontal rail
and View all. At accessibility sizes the existing vertical waiting layout remains.
Cards use small existing activity artwork, name/date/status hierarchy, people and
one next step; confirmed cards use the date block and existing detail route.
No grouping, permissions, stored records, submission, invitation or Calendar
rules change. See the [213 QA](./qa/2026-10-24-plan-home-redesign.md).

## Native inline information hierarchy — Preview 212

The owner still taps the activity title or location directly to edit. A small
decorative pencil identifies each editable value; read-only participants keep
the ordinary heading. Editing uses fixed Activity name and Location (optional)
labels above the existing multiline fields, with the same shared field surface
as other native forms. Both editing fields use the same one-to-three-line native
viewport; longer values scroll internally without changing stored contents or
limits. Cancel and Save align to the trailing edge, stacking only
when their full labels cannot fit. A light divider separates activity information
from candidate dates, passive status and the timetable.

This adds no entry, workflow step, state or request. Original edit permissions,
trimming, limits, save/error handling, availability drafts, explicit submission,
sharing, invitation versions and Calendar rules remain unchanged. Focused and
full-flow acceptance are recorded in the [212 QA](./qa/2026-10-24-plan-information-editor.md).

## Collection stage metadata — Preview 211

The native editable COLLECT detail keeps title/share and editable location in
its heading. Its stage moves to the existing date/people metadata group: date
range first, then a small grey dot and regular caption containing Collecting
availability and the time zone. Dates/status remain full-width and naturally
wrap; the existing adaptive row stacks against people/avatars when needed.
The stage is passive text, with no capsule or calendar icon. Activity-idea stages
keep their own existing status wording in this same location.

This applies only where the editable collection timetable is rendered. Legacy
fixed-time collecting plans retain their heading status. Invitation, confirmed,
expired and invitation-adjustment headings keep their existing status/overrides;
shared overview badges are unchanged. No state, request or consent rule changes.

## Native creation uses the shared editor — Preview 196

Owner amendment 2026-10-24: use the same native Form/Section, grouped canvas,
surface rows, text title token, SSFlowActionDock and ssFlowSheet as the current
intention editor. Keep two sections: activity/location and candidate dates/hours
with optional ideas as its final row. Remove the separate gray title plate and
card action outlines; retain outlined date/hour/Clear controls. Accessibility
hour/zone spacing increases locally; all create/share/date/invitation rules stay.
No new editor entry or workflow step is added.

## Native creation form hierarchy — Preview 195

Owner amendment 2026-10-24: separate activity/location, candidate date/hour
settings and the optional activity-ideas checkbox visually without adding a step.
Use a multiline activity field for visual wrapping while Return retains the
single-line title value and dismisses input. Expand the existing calendar directly
under its date row; keep Clear dates centered beneath it and time zone inside the
hour settings. Reuse existing adaptive rows, hour menus and outlined controls.
Date normalization, validation, COLLECT creation, sharing and invitation/Calendar
rules remain unchanged. This is a native presentation change only.

## Information-only native creation — Preview 194

Owner amendment 2026-10-23: the first page contains activity/location, candidate
dates, daily voting hours and the existing optional activity-ideas checkbox.
Remove the read-only timetable preview. After creating the same COLLECT plan and
opening the existing share panel, its detail timetable is directly editable.
There is no additional step or new mode. Keep date/hour validation, idempotent
creation, manual availability submission, final-time selection and invitation /
Calendar rules. Existing records and browser surfaces are unchanged here.

Remove creation-only timetable state, slot generation/rebuild observers and the
unused grid preview options; serialize the existing unique sorted date keys and
calendar time zone directly into the original request. No new state or request.
This supersedes the creation preview described below.

## Native timetable without Undo — Preview 193

Owner amendment 2026-10-23: remove the persistent one-step Undo action from both
native availability and final-time grids. Remove its transient snapshot state and
button rendering, retaining tap/toggle, hold-paint/erase, day selection, drafts,
explicit submission and invitation/Calendar rules. Availability's time-header
corner displays Time; final-time gesture guidance stays in the existing row
above the grid. Preserve the existing scroll layout and viewport dimensions. Clear candidate dates and Clear final time
remain distinct existing actions. This supersedes native Undo descriptions below;
the browser implementation is unchanged in this stage.

## One collection-first entry — Preview 191

Owner amendment 2026-10-23: new plans start by publishing a valid candidate
timetable. Enter activity/location, choose candidate dates and daily voting hours,
then Share for availability. Creation previews these hours read-only; it does not
select a final interval or submit anyone's availability. Its only primary action
opens the existing share panel. Remove creation's final/availability mode flag,
both selection sets, automatic availability submission and review handoff.

After sharing, all participants, including the organizer, fill and explicitly
submit their own availability on the existing detail timetable. The organizer
uses Choose final time on that same timetable, reviews the roster, and sends a
formal invitation. This remains available with zero votes. Existing accept,
decline/ignore, invitation versions, cross-day selection, owner publication and
unique Calendar rules remain. Final selection returns through the existing back
arrow; remove the redundant Collect availability first footer action.

Activity suggestions remain an independent checkbox. They use the same initial
share action; a proposed activity must still be chosen before invitations.
App contacts and browser guests keep the existing collection and RSVP surfaces.
Creation continues to send one ordinary COLLECT request with dates and daily
hours, then uses the existing share handoff; no endpoint, schema, guest identity
or legacy FIXED-record change. This supersedes the creation branches described
in Previews 187–190 below; existing final/availability drafts in details remain.

## Clear candidate dates — Preview 190

The expanded calendar has one compact outlined “Clear dates” button centered
directly below it, before any collection-hour controls. It clears the candidate
date set in one tap, reusing the existing timetable rebuild to clear both related
time selections. Activity name and location remain. With no selected date, this
button and the existing next action are disabled; selecting new dates restores
the button and the ordinary timetable flow. There is no confirmation dialog,
server request or new state/validation path.

## Candidate date identity and editing — Preview 189

Default dates and MultiDatePicker edits use the same calendar, locale and day
components, including the calendar field. Picker changes normalize equivalent
representations to one day; candidate keys and generated timelines remain unique.
Removing a default day works on the first tap, and adding it again cannot create
duplicate slot starts. Existing availability and final-time drafts remap by their
actual instants when candidate dates change.

While the existing date controls are expanded, the grid is unmounted; collapsing
the same date row restores the timetable. The model and validation still update
with each date edit. Full-day slots are built once per timetable, and cell clock
formatting reuses one formatter per grid pass. No debounce, autosave, extra
confirmation step, server request or change to invitation/Calendar rules is added.
Zero-date and 31-date validation retain their existing behavior.

## Compact creation information — Preview 188

Activity name, optional location, candidate dates and the optional friends' idea
checkbox share one outlined information group with aligned rows and dividers.
The activity name is the primary editable field. Date summaries omit the year
only when both endpoints fall in the current local year; the same existing date
and collection-hour controls expand below the group. The default candidate dates
remain tomorrow through the following six dates.

Creation combines the timetable heading, selection legend and undo action above
the existing grid; accessibility text may stack these items. Information fields
scale through accessibility1, with fixed-size decorative icons, while the rest
of the page keeps its existing text rules. Name/location focus hides the creation
dock until the keyboard is dismissed, without submitting or discarding input.
No date, suggestion, draft, invitation, publication or Calendar rule is changed.

## One timetable from creation to invitation — Preview 187

The native creation page opens directly with activity/location and the shared
editable timetable. Amber cells choose the final invitation interval; duration
comes from those cells. There is no native “Time already set” branch, separate
start/date picker, duration picker or required group-size step. A secondary
“Collect availability first” switches the same table to green personal availability;
switching back preserves both local selections. Any unsubmitted green selection
also passes into the existing per-account durable availability draft when the plan
is created through the final-time path; it is never submitted implicitly. Dates are compact and expandable.
Changing candidate dates or collection hours preserves selections by their actual
start instants rather than silently shifting their IDs. Returning to either table
mode scrolls to its own selected time, or the default collection start.

Next creates an ordinary COLLECTING plan and opens the existing invitation review.
No one needs to submit availability first. The review can add existing App contacts
through the existing card-delivery picker, select invitees, or retain the existing
link-capacity choice. Sending remains explicit. Back returns to the same timetable;
final-time drafts persist locally per account and token and are invalidated by a
new invitation version. Selecting a cell makes no HTTP request, submits no personal
availability and does not send an invitation.

Collecting availability creates the same COLLECTING plan and opens the existing
share panel; any selected personal availability is submitted only by that explicit
share action. Later final-time selection uses the same grid and invitation review.
Friends' activity suggestions remain an independent optional checkbox. If enabled,
the initial action shares for suggestions while preserving the owner's local final
time. The activity board stays visible; an activity must be chosen in review before
formal invitations can be sent. While the activity composer is open, the timetable
dock and sharing toolbar are hidden so they cannot cover its input; Confirm or
Cancel restores them. No extra two-choice start page is introduced.

Creation and detail use one timetable model, touch surface, range validator and
summary. The share sheet and App-contact picker are also reused. Existing FIXED
records, their APIs and legacy constraints remain supported, but the native create
page does not create new FIXED records. The older FIXED UI descriptions below are
historical contracts for retained records. No schema, endpoint, web, RSVP, owner
publication, capacity, expiry or Calendar rule changes in this stage.

## Edit the visible plan information in place — Preview 186

Before confirming an activity or issuing an invitation, the organizer taps the
activity name or location directly in the detail heading to edit those values.
An empty location uses the existing optional-location placeholder. Inputs stay
in the heading, with explicit Save / Cancel only while editing; no separate Edit
entry or information sheet. Named accessibility Edit actions remain available.
Saving changes only metadata through the existing details endpoint; cancelling
restores the displayed server values. Personal availability drafts stay intact.

While editing, the availability/final-time dock and sharing menu are hidden so
they cannot cover the editor actions or compete with Save. They return after Save
or Cancel. Time remains directly selectable on the existing timetable. Candidate
dates, time zone, permissions, chosen activities, invitations and Calendar rules
are unchanged. Participants and confirmed plans retain read-only information.

## Final time uses timetable cells — Preview 185

The organizer taps a cell to select it and taps it again to deselect it. Holding
and dragging paints or erases cells, using the same touch surface, undo and day
selection as personal availability. Final selection is amber with square checks;
personal availability stays green with circular checks. Leaving and returning
preserves the final-time draft without submitting availability or invitations.

The final-time grid covers the complete candidate dates, including midnight.
Dates remain visible while scrolling hours; hours remain visible in each cell.
Across dates, a drag follows chronological time rather than a multi-day rectangle.
Unsurveyed hours show a dash and are never counted as available or persisted as
availability. Invitation review explicitly identifies uncollected availability.
The final interval may cross midnight or span consecutive candidate dates. There
must still be one continuous interval: disconnected selections remain editable,
with an inline gap message and disabled review, rather than silently clearing or
filling cells. The summary shows both endpoint dates and the actual elapsed time.

Reviewing the roster, explicitly sending invitations, individual accept/decline,
organizer publication, consent versions and unique Calendar entries retain their
existing rules. Whole-date server validation is shared by old and new clients;
the original response slot IDs, records and candidate-hour availability are intact.
No schema migration or alternate invitation engine is introduced.

## Action hierarchy and fitting — Preview 184

Standalone actions in the native App and share page use a visible 1pt/1px outline,
including compact text and icon actions. Native primary actions use a solid fill,
regular secondary actions a soft rounded surface, compact actions a capsule, and
icon actions a circular surface. Destructive actions retain red. Plans/Together
section pickers use one group boundary and a solid selected segment, without
framing every unselected option. The response count is plain information outside
the avatar button; only the right-side avatar group opens the complete people list.
The empty state retains the people icon action, and more than three responses use
three avatars plus +N. Borders adapt to light/dark appearance. Share web retains
its Preview 183 rounded secondary buttons; the 185 backend adds cross-day validation.
Native standalone actions retain at least a 44pt target. Regular actions include
vertical content padding; compact actions use a 36pt minimum visible surface with
a capsule shape. Icon actions have a 44pt circular surface. Navigation actions use
compact icon labels for standard Cancel/Done/Save, keep their localized accessible
names, and hide the redundant iOS 26 toolbar background. Padding belongs inside
the outline; never inset a border through the label or stack two control frames.
Button labels scale through standard sizes; compact/navigation/section labels stop at
xxxLarge and regular action labels at accessibility1, while page body text keeps
the user's full text-size setting. Existing content-sized selectors keep their
own geometry and use only the shared border/press treatment.
Web standalone actions have a minimum 44px height, content-based height, explicit
vertical padding and centered labels/icons. Narrow/large-text activity headers
wrap whole controls, preserving complete one-line short labels. Content cards, list rows and
timetable cells keep their own interaction geometry and existing selection logic.
The native shared style and outline helper cover existing components without
introducing a new action state or changing planning, invitation or Calendar rules.

## Local activity completion — Preview 181

The composer offers three localized example activities as quick-fill chips. Tapping a
chip fills that item; unmodified Tab fills the first matching local suggestion.
Neither action submits or writes a response. Complete/unmatched input keeps normal Tab navigation,
and web IME composition and modifier shortcuts are preserved. Explicit Confirm
still creates the idea. Native accessibility sizes show the same chips above
the input so they remain reachable with the keyboard open. Existing records,
interest, activity choice, RSVP, publication and Calendar rules remain unchanged.

## Compact activity board — Preview 180

Undecided activities use a compact two-column board in the App and share page.
The header keeps the idea disclosure/count on the left and Suggest an activity
on the right. Suggest opens an inline composer above the board; Confirm replaces
the header action on the right, with a local cancel beside the input. Adding an
idea keeps the board expanded. Native accessibility sizes and narrow web screens
use one column. Interest remains independent of attendance. The existing owner
invitation review still chooses the activity and invitees; no rules or records
are migrated. Final delivery and test scope are in [deployed state](./DEPLOYED_STATE.md).

## Native compact participant row — Preview 164

The native plan detail removes its nickname editor and participation card. Existing
names, responses and guest/web naming rules remain unchanged. Activity and status
share a heading, with organizer/location/edit together and dates/time zone below.
Above the editable timetable, the submitted response count sits beside at most
three participant initials and a +N overflow indicator. Tapping the row opens the
existing complete people/progress sheet, including unsubmitted invitees. The
count and avatars include submitted responses only. Timetable title, availability
instructions and legend are omitted; undo stays in the grid's time-header corner.
Manual submit and organizer final-time selection share the bottom action area,
stacking at accessibility sizes. Drafts, explicit invitations, RSVP, publication,
expiry and Calendar rules are unchanged. Physical delivery status is recorded in
[deployed state](./DEPLOYED_STATE.md).

## Independent activity and time choices — Preview 156

Friends can suggest activities and Time already set are independent controls in
the same creation form. Toggling either keeps title, place, candidate dates,
exact start, duration and group size. With both enabled, the existing FIXED plan
starts in COLLECTING at invitation version zero, retaining chosenStart/chosenEnd.
No invitation, availability response or creator acceptance is created yet.

App and share-page participants see the read-only set time and inline activity
ideas. They suggest/mark interest without filling availability or accepting.
The organizer reviews the same time, selects an activity and invitees, then
explicitly sends invitations. Review/cancel alone writes nothing. Choosing an
idea without its own location preserves the plan's existing location. The set
time cannot be changed by sending a different invitation interval.

The same existing activity-choice and invitation endpoints perform this flow;
no new mode, database field, schema migration or alternate invitation engine.
Formal invitation version one enables explicit RSVP. Organizer publication still
governs Calendar/final alerts, and unconfirmed planning expires at the set start.
Ordinary fixed invitations without activity ideas continue to start in INVITING.

## Native detail hierarchy — Preview 153

The canonical detail separates plan identity, personal participation, the shared
timetable and the current task. Only an undecided activity adds one inline row
under the plan title: an initially collapsed idea count, interest actions and a
single in-place suggestion field. There is no activity module, editor page or
separate owner choice here; the existing invitation review makes the final choice.
Known/chosen activities do not show that row. Returning from final-time selection
keeps an unfinished suggestion and the personal availability draft.

The organizer may edit title/location through `PATCH /api/v1/time-polls/{token}/details`
while COLLECTING and before an activity has been selected. This does not alter
candidate dates, responses or invitations. An undecided topic follows its edited
title; selected activity identities and already-issued consent remain frozen.

Nickname editing is explicit. During collection its value joins the existing
device-local availability draft and is only shared by submitting availability;
the editor explains this. Later nickname changes retain the existing dedicated
endpoint. Cancelling a changed information/nickname form offers discard/keep.

The timetable remains directly editable. Organizer final-time selection has a
distinct navigation title, amber selectable cells and return action; review/back retains
the draft range and roster. Sharing lives in one toolbar entry with accepted App
contacts, web sharing and copy; it does not submit availability. The people view
distinguishes submitted availability from invitation replies. Publication,
individual consent, calendar and cancellation contracts are unchanged.

## Invite existing App contacts — Preview 152

Create a plan → Invite App contacts → select accepted contacts → Send plan.
Each friend receives one native plan card in their existing direct chat and an
entry in Plans, even before opening or filling it. Search and multi-selection
use the existing contact list. Already delivered contacts are marked and cannot
be sent the same card twice. Public web sharing remains a secondary action.

For a collecting plan, the card opens the inline availability timetable. Sending
or opening a card records neither availability nor acceptance. Unfilled contacts
can still be explicitly selected when the organizer chooses final time and reviews
the invitation roster. For a formal invitation, the same card shows the final
time and opens the highlighted timetable with explicit Accept / Decline / Reply
later. The organizer may also invite contacts to an already published future plan;
their Calendar entry still waits for their own acceptance.

Delivery uses existing contact, chat safety, membership, consent-version and
capacity rules. Availability remains manually submitted, and opening the contact
picker or sending a card preserves unsaved local selections. Organizer-controlled
final sending below continues to govern Calendar and final alerts. This adds the
delivery mechanism that Preview 151's entry-only change did not provide.

## Native entry and public sharing — owner correction / Preview 151

App participants open a received plan card, chat invitation or notification to
reach its native detail. Plans home offers Start a plan; it has no separate
Open a plan link button, paste dialog or fallback menu item. Its empty state
describes created plans and received invitations. Public share links let friends
without the App fill availability and respond on the web. Existing external
deep-link routing remains compatible; native entry does not ask people to copy
or paste a URL. This presentation change does not add a new recipient-discovery
or invitation-delivery mechanism, or alter existing membership/consent rules.

## Organizer-controlled final sending — owner correction / Preview 145

Choose final time → review invitees → collect Accept / Decline / Reply later →
organizer explicitly **Send final plan** at any time → only accepted participants
receive final notifications and Calendar entries. Nobody else's reply is required;
even the organizer alone can send. Unanimous acceptance never auto-publishes.
Reply later leaves INVITED unchanged; no reply is recorded by simply leaving.

After sending, invited participants and open-link guests may still accept before
the chosen start (within existing capacity). Only the newcomer receives a final
alert; existing attendees are not notified again. Changing to Declined removes
that person's Calendar entry and updates accepted companions. Guests see the final
arrangement on the shared page; they have no account Calendar or device push
subscription. Existing confirmed records remain valid, and bilateral conversation
plans retain their separate two-person contract.

`POST /api/v1/time-polls/{token}/publish {version}` is owner-only, row-locked and
idempotent. It reuses CONFIRMED/confirmedAt; no schema migration or rewriting old
records. RSVP itself never changes INVITING to CONFIRMED. Pending and declined
people get neither the final push nor a local inbox confirmation notice. Source
sharing, manual availability submission, expiry, safety locks and capacity stay.

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
on sending the invitation; under Preview 145, Calendar waits for the organizer
to explicitly send the final plan, including only accepted participants. Cancelled drafts change nothing; old requests retain
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

`TimePoll` is the persisted root of manual plans. Current native creation sends
COLLECT and starts in COLLECTING; optional activity ideas use that same entry.
FIXED and expected-count fields remain supported contracts for existing records
and compatible clients, rather than a separate current native creation branch.
The existing invitation roster limit remains twenty. Existing conversation-bound
PlanCommitment/PlanRequest records remain intact and appear alongside these
records in Plans. Their origin consent, bilateral Outcomes and Repeat rules are
not imported into manual plans. Discovery Pod and archived code remain disabled.

The native first-level Plans page owns creation, plan-card entry, confirmation
progress and availability collections. An existing card, successful creation,
message link or external deep link opens one canonical detail above that root.
Back returns directly to Plans, including after Done selecting. Creation alone
uses a dismissible form sheet; the secondary TimePollSheet list is not part of
current Plans or Messages navigation. Root cards refresh after saved responses.

## Final-time selection in the timetable — Preview 122

The organizer explicitly starts **Choose final time**, then picks a continuous
candidate-backed range in the same timetable. In Preview 143, every additional
tap on the same date extends the existing interval, filling the cells between;
tapping within it leaves it selected. There is no two-tap cycle or hidden reset.
**Choose time again** explicitly clears only this invitation-time draft. Holding
and dragging replaces the interval; choosing another date starts a new interval,
as explained above the table. A date header selects all configured hours for that
date. Personal availability continues to allow separate cells across dates, with
tap-to-toggle, paint/erase, day selection and undo. An unsent label,
calendar icon and separate outline distinguish this draft from personal availability;
counts stay visible and no response is changed. New invitations start without a
preselected range. The next action opens a roster-only review with exact time and
availability labels. Adjusting time retains both the range and checked roster.
Only Send invitations mutates the existing invitation API/version. Cancelling a
draft changes nothing; rescheduling uses the same selection with the old range
prefilled. Existing identity, consent and Calendar rules remain unchanged.

## Overview appearance — Preview 144

The three plan overview styles share Together's `SSFlowCard`, category header
band, original activity artwork, radius, border and shadow. Actionable cards stay
vertical; waiting cards stay in the horizontal rail, with the existing large-text
vertical fallback. Confirmed cards retain their date summary. Short status,
activity, timing, real people and the existing review action remain the content;
opening a card does not submit availability, send or accept an invitation.
Decorative title matching selects artwork only and never changes the stored
activity or rules. Each entire card exposes its title, state, time and action as
one accessible label, including when its header uses a separate visual container.

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

- COLLECTING: immutable candidate slots, one explicitly submitted response/account or browser guest.
  The complete heatmap and response count are primary. No duration is required,
  and no common-time/maximum-attendance cards are shown. The older summary/window
  fields remain compatible for existing clients.
- INVITING: a chosen future start/end and explicit roster. Creator send is explicit
  acceptance; each other selected person accepts or declines. For FIXED,
  link holders can join until the target count is filled. Declining that open link
  does not consume a seat. No Calendar entry exists before the organizer explicitly sends the final plan.
- CONFIRMED: the organizer explicitly sent the final arrangement. Only selected
  ACCEPTED participants receive Calendar projections and accepted companions,
  atomically in the publishing transaction. Repeated sending/acceptance never
  duplicates projections. Pending and declined participants have no projection; guests confirm on the web and have no personal Calendar row; excluded respondents retain history, not membership.
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

- `POST /publish {version}` — organizer explicitly sends the final plan to accepted participants; no quorum. Idempotent after publication.

| Method/path | Behavior |
| --- | --- |
| POST `/invitations` | Owner selects future start and explicit end, response IDs, current version; omitted end retains the legacy duration/60-minute fallback |
| PUT `/invitation-response` | Authenticated viewer accepts/declines current version |
| POST `/cancel` | Owner cancels current version and removes projections |

All use the authenticated v1 envelope and OpenAPI contract. The 192-bit token
serves as an invite capability for link holders. The guest web page shows the
shared poll and supports filling, nickname editing and confirmation without
downloading or registering; see [Guest participation](./GUEST_IDENTITY.md). No third-party code/page/save service is involved.

TimePollInvitation has unique `(pollId,userId)` membership. CalendarEntry has an
optional cascading TimePoll relation, unique `(userId,timePollId)`, and a relation
index. Two additive forward migrations extend existing tables and create the
invitation table; old migrations/data are preserved. Generic calendar mutation
APIs exclude these entries. Schedule/search DTOs include timePollToken only for
manual-plan projections, preserving existing payload shapes otherwise.

Shared plan writes acquire existing ordered user safety locks before a poll row
lock. Block/account removal use the same safety boundary and remove projections.
Explicit response submissions remain bound to their login generation and serialize
against conflicting mutations while a request is in flight. A local unsubmitted
draft does not block sharing or final-time invitation. Refresh preserves the local
edit revision and reads the same persisted root. Plans
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
