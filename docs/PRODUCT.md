# SideSeat Product

**Status:** Frozen v1.0 with approved activity-fit (2026-09-08), flexible-timing, event-driven publication and discovery-first (2026-09-09) amendments

**Last updated:** 2026-10-23

**Scope:** Product positioning, canonical objects, information architecture, invariants, and non-goals

**2026-09-26 owner-approved interaction amendment (local implementation):**
Together uses My intentions → Recommendations → Saved intentions. A private heart
bookmark does not notify the peer. Say hello sends one contextual message and opens
its readable conversation; the peer must reply before ongoing chat is available.
Contacted cards leave recommendations; saved cards retain the chat entry.
The 2026-10-02 owner decision keeps newly saved cards in the current browsing list
with an Interest shown state, without flying to or opening Saved intentions.
An explicit refresh or new search may omit previously saved cards.
Additional public intentions load from Find more recommendations into the same feed.
This amendment supersedes legacy bilateral-YES and no-save-shelf descriptions;
older endpoints remain compatibility paths. It does not approve paid quotas,
additional identity disclosure, production deployment, or a new history policy.

**2026-09-26 owner-approved membership foundation:**
Accounts distinguish Free and time-limited Plus through server-owned membership.
An invitation grants configurable membership days with a shared redemption cap
and deadline; each account can redeem a given code once. See
[Membership](./MEMBERSHIP.md) for implemented behavior and operator controls.
Recommendation quotas, exposure weighting and Plus-only calendar AI remain
separate follow-up integrations; the membership badge does not certify them.

This is the highest product authority in the repository. Implementation details
belong in feature contracts; build status belongs in release records.

**2026-10-15 owner-approved unified planning amendment:**
Plans owns manual coordination from availability collection through individual
confirmation and Calendar projection. A creator can collect availability first or
choose a concrete time directly. Both routes use one shared plan and the same
invitation, confirmation and cancellation lifecycle. Native SwiftUI and Sideseat's
API/database retain 30-minute paint/erase over existing quarter-hour storage, explicit submission and attendance
heatmap mechanism; provider pages, advertisements and storage are excluded.

**2026-10-23 owner-approved collection-first entry:** new native plans publish a
candidate timetable before anyone chooses the final time. Activity, candidate
calendar dates and daily voting hours lead directly to sharing; the creation grid
is a read-only preview. The organizer and friends then explicitly fill their own
availability on the canonical detail timetable. Final-time selection and roster
review happen there, remain available with no votes, and lead to the existing
invitation, individual response, organizer publication and Calendar lifecycle.
There is one creation flow, without a final/collection mode switch. Optional
activity proposals remain in that same flow. Existing records and consent rules
are unchanged; see the Preview 191 unified planning contract.

**2026-10-20 owner-approved manual submission amendment:** App and share-web
selection changes are private local drafts, with one explicit Submit my availability
or Save changes button and acknowledgement-based feedback. Drafts recover per
account/guest and plan; leaving/backgrounding never submits them. Submitted data
alone drives attendance counts, while peer and invitation refresh continues.
Invitation and activity/name actions do not publish or discard availability drafts.
A dirty draft does not prevent choosing final time, sending or confirming an
invitation. Existing records, quarter-hour storage and Calendar consent remain
intact. This supersedes the earlier Preview 136 autosave amendment.

**2026-10-21 owner-approved final-time interaction:** An organizer places one
continuous time block with a tap, using the activity duration or one hour by
default (shortened only on initial placement if the candidate window ends sooner).
Taps inside keep it unchanged; taps outside move it while retaining its duration.
Visible start/end grips resize it; dragging the middle moves it. Date changes retain
local start time and duration, within candidate boundaries. The bottom controls
edit date/start/end directly, then proceed to review invitees. Availability, manual
submission, invitation versions and Calendar consent are unchanged. This replaces
the Preview 143 grow-only tap interaction below.

**Historical 2026-10-20 / Preview 143 final-time amendment (superseded above):** repeated taps on one date
extend one continuous invitation-time interval; tapping an included cell keeps
it selected. No hidden third-tap reset is permitted. Choose time again clears
only that draft from the fixed bottom bar; a new hold/drag or another date
explicitly replaces the range. Availability still supports separate cells across
dates and explicit deselection, day selection and undo. Final-time edits never
submit personal availability or send invitations.

**2026-10-16 timetable amendment:** Availability is input, never acceptance.
Collection shows the complete availability heatmap and response progress, without
common-time or maximum-attendance recommendation cards. Creating a collection does
not require an activity duration. Friends can decide to spend half a day or a full
day together from the timetable. The creator explicitly chooses start/end and
invitees; sending confirms the creator's participation. Every
selected invitee must explicitly accept that invitation version before the same
plan appears in each selected registered person's Sideseat Calendar. The timetable
does not automatically choose the activity duration or roster. Declines remain pending; choosing
a new time/roster resets acceptance. Cancellation removes Calendar projections.

The owner also approved browser guest participation on 2026-10-15: invite-link
holders can enter/edit their poll nickname, fill availability and confirm
participation on the share page without a download or registration. Guests must
confirm alongside account holders; they remain poll-scoped and receive no personal
Calendar row. Their names appear as companions for registered participants.

This approves manually shared 2–20-person plans, including five-person collection;
it does not activate discovery-driven Pod formation, group chat, matching, repeat
eligibility or bilateral Outcome credit for these manual plans. Existing
conversation-bound one-to-one Plans keep their consent and provenance contracts.
See [User Flow](./USER_FLOW.md), [time polls](./TIME_POLLS.md) and the
[unified planning contract](./UNIFIED_PLANS.md). Deployment facts belong in
[Deployed state](./DEPLOYED_STATE.md).

**2026-10-19 owner-approved integrated planning amendment:**
Howbout is the planning-module product reference; direct timetable interaction
and collaborative activity suggestions are integrated with SideSeat's explicit
invitation and Calendar rules. The default remains one creation form. Optional
activity ideas and availability run in parallel in the same plan detail, without
mode switching. Interest never satisfies an availability task. The organizer may
choose final time first, then explicitly choose the activity and roster together
before sending. Existing private/manual and conversation-bound records retain
identity, provenance and consent. This adds no public group, social graph or
calendar-sharing permission. See [Integrated planning](./PLAN_ACTIVITY_START.md).

**2026-10-19 owner correction — invitations do not require availability:**
The organizer can set a final time and invite friends before anyone else responds,
including with no availability responses at all. The same plan/link becomes a
formal invitation with an explicit total count, using the existing direct-time
confirmation rules. Friends can confirm the highlighted time directly in the App
or share page. Saved responses and activity data remain; no response or attendance
is fabricated. Known respondents can still form a closed roster. Adding link
participants is explicit; deselecting a known invitee never silently opens a roster.
Calendar still requires the displayed total and every selected person's acceptance.

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

## 1. Positioning

Product vision:

> 让一个原本陌生的校园，逐渐充满熟悉的人。

External slogan:

> 让每一段校园时光，都有人同行。

SideSeat is an intent-to-familiarity campus product. It helps a student express
something concrete they want to do soon, meet another relevant student around
that action, turn mutual willingness into a real Plan, and make an appropriate
second encounter easier.

SideSeat is not a campus content feed, people directory, swipe product, follower
graph, course community, dating mechanic, or professional calendar replacement.

## 2. Product loop and goal

```text
Intent
→ private Opportunity
→ mutual consent
→ contextual coordination
→ confirmed Plan
→ both Calendars
→ bilateral Outcome
→ private Meet Again
→ Familiar eligibility
→ Repeat Opportunity
→ second occurred encounter
```

The first encounter is the current shipped foundation. Outcome, Meet Again and
repeat must be added in this dependency order. Pod is gated until the one-to-one
repeat loop works.

Primary long-term measure:

> The share of students who had at least one qualifying repeated SideSeat
> encounter in the last 30 days.

Near-term measures remain confirmed Plans and bilaterally reported occurred Plans
per 100 weekly active users. Match count, post count and time spent are not North
Stars.

## 3. Information architecture

The current native app and browser have five destinations and open on Together:

```text
Together / 同行
Plans / 计划
Calendar / 日历
Messages / 消息
Me / 我
```

- **Together** owns Weekly Intent, matching sessions, first/repeat Opportunities,
  private bookmarks and later Pod formation.
- **Plans** owns availability collection, manual invitations, waiting proposals,
  upcoming commitments and ended-plan feedback for conversation-bound Plans.
  Its first-level overview includes creation and shared-link entry, grouped
  collection/confirmation progress and the next confirmed activity. Manual plan
  details use one canonical level above that overview across all entry points.
- **Calendar** owns personal scheduling, courses, confirmed Plan projections,
  retrieval and Apple Calendar interoperability.
- **Messages** owns contextual first-message requests, ongoing communication after a
  written reply, and conversation-bound Plan negotiation. Manual coordination
  is managed in Plans; approved links open the same plan there.
- **Me** owns identity, verification, courses, language, privacy, safety and
  durable preferences.

There is no separate public Discover tab, city selector, people search,
generic publisher, classmate roster or course chat in the current product.

## 4. Canonical objects

| Object | Meaning | Not equivalent to |
| --- | --- | --- |
| Weekly Intent | Activity-specific willingness with owner-controlled public visibility | Post, profile field, calendar event |
| Matching Session | Explicit, bounded participation in Opportunity generation | Guarantee of a match |
| Mutual Opportunity | Private, finite, action-first possibility between two eligible users | Person recommendation, invitation, Plan |
| Bookmark / first message | Private saving, or an explicit contextual contact request; a written reply opens ongoing chat | Automatic matching consent, a Plan or a public like |
| Action Context | Immutable, privacy-filtered source carried into coordination | Mutable copy of the source Intent |
| Conversation | Transport for mutually authorized coordination | Friendship or Familiar Face |
| Plan Draft | Prefilled but non-binding proposal input | Commitment |
| Plan | Shared commitment controlled by proposal/accept/counter/cancel lifecycle | Chat message or calendar decoration |
| Calendar Projection | Each participant's schedule representation of a confirmed Plan | Independent owner of shared facts |
| Outcome | One participant's private occurred/did-not-occur answer | Rating or public review |
| Shared Encounter | Derived only after both participants report OCCURRED | End time passing or one response |
| Meet Again | Private, withdrawable permission considered only after an occurred encounter | Friend request or visible waiting state |
| Familiar eligibility | Derived permission to consider the same pair around a relevant new Intent | Contact, follower, public relationship |
| Repeat Opportunity | New action-scoped opportunity with new consent and provenance | Reopening an old Plan |
| Pod | Future temporary 3–5-person peer commitment with its own group contract | Several bilateral Plans or permanent group chat |

Legacy public Actions, Activities, Interest and old Discover routes remain only
for existing-record lifecycle and rolling-client compatibility. They do not
authorize a current acquisition surface.

## 5. Source-of-truth invariants

1. A user begins with a shared action, never a people directory.
2. A Weekly Intent grants action-specific eligibility. Its public visibility and contact controls follow the current Together contract; private bookmarks are never peer notifications.
3. A user may maintain multiple independent Intents; each Intent describes one
   concrete thing.
4. Explicitly publishing an Intent starts automatic matching, with disclosure
   before publication. Old saved intentions are not silently enrolled by upgrade.
5. Matching participation follows each published intention's ACTIVE lifecycle;
   pause, end or expiry exits supply. The separate 48-hour session remains only
   for already-shipped clients/legacy intentions. See the
   [event-driven matching amendment](./INTENT_DRIVEN_MATCHING.md) for rollout status.
6. Calendar content is never read by matching or recommendation logic.
7. Opportunity generation uses explicit course, activity, language, school and
   user-declared social-time context only. The approved [discovery-first policy](./DISCOVERY_FIRST_MATCHING.md)
   makes differences relevance factors, not eligibility cutoffs; 0/100 remains
   deliverable among actively participating people. Privacy/safety/refusal remain
   hard boundaries. Missing historical feedback does not block ordinary discovery
   or count as permission for a repeat encounter.
8. A Mutual Opportunity is pair-scoped and symmetric. There is no creator,
   public candidate pool or winner. The 2026-09-08 owner decision permits
   explainable activity-fit scores and internal ordering of feasible opportunities,
   not ratings or popularity ranking of people.
9. A bookmark is private and sends no notification. An explicit Say hello action sends one contextual message, visible in Messages to both participants. No further message is allowed before the peer replies.
10. A written reply authorizes ongoing contextual chat. Legacy private YES/NO decisions remain compatibility behavior.
11. Conversation permission is not commitment. Only an accepted Plan creates a
    shared commitment and two Calendar projections.
12. Shared Plan facts are owned by Plan. Calendar may edit only personal metadata.
13. Context and trusted provenance survive ordinary closure as a safe historical
    snapshot or tombstone.
14. Decline, withdrawal, expiry and safety removal use neutral presentation and do
    not reveal which participant acted.
15. Block is a pair-wide safety hard stop governed by [Safety](./SAFETY.md).
16. Completed history is not rewritten by later Block or Unblock.
17. Outcome and Meet Again are independent private states; silence means
    unverified, never a negative answer.
18. Familiar eligibility never grants generic contact rights or creates a public
    social graph.
19. A repeat always requires a new current Intent, Opportunity, consent and Plan.
20. Two-person Together uses one bilateral Plan. Pod starts at three participants
    and cannot ship without a dedicated group commitment and safety contract.
21. An Intent need not declare an appointment: it can express a local day/range,
    an optional day-part, exact availability, or undecided timing. Unknown timing
    is not all-day availability. Only a timed, accepted Plan creates commitment.
    See [Flexible intention timing](./FLEXIBLE_INTENT_TIMING.md) for the gated rollout.

## 6. Module boundaries

### Together

Lead with the action. Show the minimum person context needed for a decision.
Current-stage controls and matching semantics are defined in
[Together Contract](./TOGETHER_CONTRACT.md).

### Messages

Preserve the source card, support lightweight coordination, and make Plan
management reachable even when no response is pending. Existing conversations
remain available after their first coordination ends unless safety state prevents
contact.

### Calendar

Owner decision on 2026-09-21: rebuild the browser interface around the current App,
with scheduling as the first complete workflow. Browser entry opens Together
(`/together`), and the five-destination shell exposes Plans, Calendar (`/home`),
Messages and Me. Courses are managed under Me. Legacy public publishing screens
redirect to current destinations. Installation prompts, the PWA manifest and
persistent page snapshots are removed.

Web and native scheduling share account identity, persistent calendar data,
recurrence and sharing services. The browser uses the existing HttpOnly session
and versioned native APIs for intentions, opportunities, plans, chat and profile.
Browser access does not imply EventKit access. See [current browser flow](./USER_FLOW.md#browser-workspace--2026-09-21).

Reliably carry personal events, course timetable and confirmed commitments.
Calendar is the destination of the social funnel, not a recommendation surface.
Search stays a lightweight retrieval tool. Import/export and Apple Calendar sync
are utilities, not a second social loop.

### Courses

Store only the minimum course identity needed for matching and timetable use:
code, name and optional instructor. Courses have no roster, mega-chat or feed.

### Me

Own profile, student verification, courses, language, privacy, Block, matching
preferences and settings. Short-lived Intent editing remains primarily in Together.

### Sharing

- Share Event produces a permission-filtered view/copy that another person may add
  to their calendar. It is not an RSVP invitation and never exposes the sender's
  internal Event Detail.
- Share Availability is lightweight time coordination, normally inside a
  conversation. It exposes minimum busy/free availability and selectable candidate
  times, not the user's calendar.
- Invite to Event, attendee lifecycle and collaborative editing remain future,
  separate product concepts.

## 7. Current non-goals

- public people or post browsing;
- swipe matching, person compatibility/probability claims or popularity ranking;
- followers, likes, online status or a Familiar Faces people wall;
- unsolicited one-sided messaging;
- course community, classmate directory or permanent Pod community;
- generic content production and engagement optimization;
- collaborative calendars, RSVP and full attendee lifecycle;
- private calendar data as a recommendation input;
- complex EventKit availability until the social loop proves its value;
- additional Messenger features unrelated to real coordination.

## 8. Product-change rule

Owner decision on 2026-09-08: broaden delivery beyond exact activity descriptions
and show users the degree of fit. [Activity-fit policy](./MATCHING_ACTIVITY_FIT.md)
defines the first implementation: related general-category activities are eligible,
scores explain/order opportunities without a high-score delivery threshold, and
hard eligibility plus bilateral consent remain intact. This changes the old
no-score rule for activities only; it does not create a people-browsing surface.

A proposal belongs in the active roadmap only when it strengthens a transition in
the canonical loop without creating an overlapping state owner. Changing a frozen
invariant requires an explicit product decision followed by updates to
`USER_FLOW.md`, the relevant contract and tests.
