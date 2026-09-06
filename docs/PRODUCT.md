# SideSeat Product

**Status:** Frozen v1.0

**Last updated:** 2026-09-02

**Scope:** Product positioning, canonical objects, information architecture, invariants, and non-goals

This is the highest product authority in the repository. Implementation details
belong in feature contracts; build status belongs in release records.

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

The native app has four stable destinations and opens on Together:

```text
Together / 同行
Calendar / 日历
Messages / 消息
Me / 我
```

- **Together** owns Weekly Intent, matching sessions, first/repeat Opportunities,
  post-event follow-up and later Pod formation.
- **Calendar** owns personal scheduling, courses, confirmed Plan projections,
  retrieval and Apple Calendar interoperability.
- **Messages** owns communication after current mutual consent and all Plan
  negotiation or shared-commitment changes.
- **Me** owns identity, verification, courses, language, privacy, safety and
  durable preferences.

There is no public Discover feed, city selector, people search, save shelf,
generic publisher, classmate roster or course chat in the current product.

## 4. Canonical objects

| Object | Meaning | Not equivalent to |
| --- | --- | --- |
| Weekly Intent | Private, short-lived willingness to do one concrete thing | Post, profile field, calendar event |
| Matching Session | Explicit, bounded participation in Opportunity generation | Guarantee of a match |
| Mutual Opportunity | Private, finite, action-first possibility between two eligible users | Person recommendation, invitation, Plan |
| Decision | One participant's private YES/NO/withdraw state | Public like or counterpart status |
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
2. A Weekly Intent is private and grants only bounded, action-specific eligibility.
3. A user may maintain multiple independent Intents; each Intent describes one
   concrete thing.
4. Creating an Intent does not silently start matching.
5. Current matching participation is explicit and time-bounded. The current
   48-hour duration is a versioned implementation policy, not a permanent product
   invariant.
6. Calendar content is never read by matching or recommendation logic.
7. Opportunity generation uses explicit course, activity, language, school and
   user-declared social-time context only.
8. A Mutual Opportunity is pair-scoped and symmetric. There is no creator,
   candidate pool, ranking or winner.
9. One-sided consent is private and creates no chat, waiting indicator, message or
   disclosure of the other participant's state.
10. Only current bilateral consent authorizes contextual coordination.
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
- swipe matching, compatibility percentages or popularity ranking;
- followers, likes, online status or a Familiar Faces people wall;
- unsolicited one-sided messaging;
- course community, classmate directory or permanent Pod community;
- generic content production and engagement optimization;
- collaborative calendars, RSVP and full attendee lifecycle;
- private calendar data as a recommendation input;
- complex EventKit availability until the social loop proves its value;
- additional Messenger features unrelated to real coordination.

## 8. Product-change rule

A proposal belongs in the active roadmap only when it strengthens a transition in
the canonical loop without creating an overlapping state owner. Changing a frozen
invariant requires an explicit product decision followed by updates to
`USER_FLOW.md`, the relevant contract and tests.
