# SideSeat User Flow

**Status:** Frozen v1.0 for the current one-to-one flow

**Last updated:** 2026-09-09

**Governing product:** [Product](./PRODUCT.md)

**Scope:** User-visible interaction from Intent through Plan, plus the approved repeat boundary

**Approved publication amendment:** With `v2AutomaticMatching`, publishing replaces
the separate matching start. Legacy saved intentions keep their original consent.
See [event-driven automatic matching](./INTENT_DRIVEN_MATCHING.md). Not yet deployed.

**Approved timing amendment:** The flexible timing behavior below is implemented
locally behind `v2FlexibleTiming`; Build 38 still uses exact windows until a new
internal client and backend rollout. See [delivery and verification](./FLEXIBLE_INTENT_TIMING.md).

## 1. App entry

After authentication, onboarding and required student eligibility, the app opens
Together. The bottom navigation is always:

```text
Together / Calendar / Messages / Me
```

If Together is temporarily unavailable, show an explicit retry/unavailable state.
Do not restore the old Discover feed as an implicit fallback.

## 2. Create an Intent

Together initially explains one action:

```text
近期你想和同学一起做什么？
[添加想做的事]
```

The user may create several independent Intents. One Intent contains one concrete
activity and a timing preference. Default: time to discuss. Users can instead
choose a day/date range (tomorrow, this weekend, next week, custom), optionally a
day-part, or one or more exact windows. Intention is not an appointment.

Current editor behavior:

- two steps: choose the concrete activity, then timing preference; Back preserves
  all entered fields, and the bottom action advances or saves;
- choose Coffee, Study, Sports, Explore, Food or Events;
- Coffee, Explore, Food and Events require a short concrete action rather than
  matching on the broad category alone;
- Sports accepts direct text with common suggestions instead of a long fixed list;
- Study may include a current course, a concrete goal and whether parallel study
  with different goals is acceptable;
- course input does not appear for unrelated categories;
- exact time input advances in 15-minute increments; after choosing a start,
  the default end becomes 30 minutes later, with a 30-minute minimum duration;
- flexible and undecided timing never fabricate an exact start/end;
- publishing returns to Together and automatically starts finding company, after
  explicit disclosure; saving a paused intention keeps it paused.

Delivered Opportunities lead the Together page. Published intentions show
“Finding company automatically”; no separate Start/48-hour countdown appears.
The initial empty state leads with publishing an activity. The top-right Plans entry provides a direct route
to coordination and history. Recent Plans on Together contain unanswered private
Outcome prompts; saved answers remain editable in Plans history or conversation.

The user can edit, pause, resume or end each Intent independently. New timing-aware
intentions last 14 days; active/paused intentions can be explicitly extended for
14 days from now. Extension does not move the selected dates or exact windows.
Legacy intentions keep their original expiry unless the owner extends them.

## 3. Automatic matching

The new client labels the final action `发布意向` and explains that SideSeat
automatically finds company during its validity; the user may pause anytime.

```text
Publish → ACTIVE (automatically find company) ↔ PAUSED
                   └── end / expiry → no new matches
```

Both users need not be online together. A compatible new publication can match
an existing active intention, and both users receive a notification. No match is
guaranteed. Pause/end removes that intention from supply; resume tries immediately.
Pending cards become unavailable, while mutual chat and confirmed Plans remain.
Old saved intentions offer review/publication, not silent enrollment. Until rollout,
Build 38 and legacy intentions keep the original explicit 48-hour session path.

## 4. Opportunity generation

The system privately considers pairs with active published intentions (or explicit
legacy session consent). It filters school, verification, language, timing compatibility, course,
activity compatibility, Block, moderation and cooldown constraints.

Exact overlapping windows are preferred. Compatible date ranges/day-parts or
undecided timing are eligible, but explicit conflicts are excluded. Unknown does
not mean both people are free all day. Their cards say “time to discuss”.

- General categories prefer the same normalized action. Under the approved
  activity-fit rollout, different concrete actions within Coffee, Food, Explore
  or Events may be offered as details-to-agree opportunities. Both original
  descriptions are shown; an exact shared action is not fabricated.
- Sports requires the same normalized concrete activity.
- Study prefers the same goal.
- Different Study goals may form a parallel-study Opportunity only when both
  users explicitly allow a shared study context.

Each unoccupied Intent may have one current Opportunity. There is no global
“maximum three matches” across unrelated Intents.
Feasible opportunities are ordered by activity fit, with oldest-first ties.
A lower score does not prevent delivery; no eligible active peer still means no match.

## 5. Decide on an Opportunity

An Opportunity card leads with:

- the shared thing;
- overlapping availability or a date preference / “time to discuss” label;
- activity fit out of 100 and an expandable explanation. Timing-aware V2 scores
  activity, common language and school, with timing shown separately. Legacy V1
  snapshots keep their original time points. Neither is a person rating or success probability;
- for related activities, both participants' descriptions and a details-to-agree cue;
- minimum identity/trust context such as verified school, shared course or shared
  language;
- one bidirectional interest bar: left `忽略`, right `有兴趣`.

It does not show a person's compatibility rating, candidate ranking, full profile
or the other person's decision. Historical opportunities without a score snapshot
do not display an invented score. See [Activity fit](./MATCHING_ACTIVITY_FIT.md).

Decision behavior:

Drag the center handle toward either side and release past the threshold to submit.
Short or cancelled drags return to the center; vertical scrolling does not answer.
The two labels inside the same bar are also tappable, and VoiceOver exposes both
actions. While saving, the bar shows progress and disables further choices.
This is private interest, not acceptance of a Plan.

```text
UNDECIDED → YES → WITHDRAWN
UNDECIDED → NO
```

One-sided YES remains private. It creates no chat, waiting badge or “they have not
answered” state. NO and expiry use neutral closure. An unresolved YES may be
withdrawn without a confirmation dialog.

## 6. Mutual consent and Messages

When the second current YES is committed, the system atomically:

1. revalidates both users, Intents, the Opportunity window and safety state;
2. creates or reuses one canonical active Conversation;
3. freezes one privacy-filtered Action Context/source card;
4. marks the Opportunity mutual;
5. returns the exact Messages route.

The app may now say `你们都有兴趣` and offer `聊聊细节`. It must not create a
celebratory dating-like Match screen.

The Conversation opens with the source card so neither user enters an unexplained
blank chat. People who have chatted remain reachable in Messages after this
specific coordination ends, subject to Block and connection state.

## 7. Create and confirm a Plan

From the source card or conversation:

The intended sequence is interest → mutual interest → chat about details → propose
a Plan → explicit Plan confirmation. Showing interest does not skip the conversation
or confirm time/place. Chat itself does not confirm a Plan either.

```text
Action Context
→ prefilled Plan Draft
→ review missing details
→ send proposal
→ accept / propose another time / decline
→ CONFIRMED Plan
→ Calendar projection for each participant
```

The draft inherits trusted title/activity, participants, available proposed time, course and
available place context. For an undated Opportunity, the user must explicitly
review/select proposal times and enable “Propose these times” before Send is
available. This is the author's proposal, not bilateral agreement.
Existing information is never requested again. The user
must still explicitly confirm before sending.

Plan creation uses the shared editing sheet with a pinned send action. A new-time
proposal leads with timing and retains the previous title/place. The response
card gives Accept the primary action, followed by alternate time and decline.
It explains the effect on both calendars before acceptance.

Plan is the shared source of truth. A chat message cannot confirm a Plan, and a
Calendar entry cannot independently change shared title, time, place or
participants. Confirmed changes use mutual reschedule; either participant may
cancel an upcoming Plan through the canonical Plan flow.

## 8. Calendar result

After acceptance, both users see the confirmed Plan in Calendar. Personal category,
color, reminder and private note may differ. Shared facts remain controlled by the
Plan.

Calendar additionally supports personal events, courses, lightweight search and
Apple Calendar interoperability. It does not show people recommendations.

## 9. Failure and terminal paths

- Matching session stopped/expired: no new Opportunities; restart is explicit.
- Intent paused/ended/expired: not used for new matching.
- Opportunity declined/withdrawn/expired: neutral closure, no actor disclosure.
- Eligibility or safety loss: unavailable state without revealing why.
- Plan time becomes past: require a new future time rather than reusing it.
- Conversation ends: does not silently cancel a confirmed Plan.
- Block: follow [Safety](./SAFETY.md); no manual Plan cleanup is required first.
- Unblock: never restores an old Opportunity, Context or Plan.

## 10. Post-event and repeat flow

Layer 2 is implemented: ended confirmed Plans offer private happened / did not
happen / skip responses from Together, Plans history and the conversation reached
from Calendar. Saving shows the viewer's answer; Change answer reopens the choices.
Shared Encounter is derived only after both independently answer OCCURRED.

The owner authorized implementation and internal acceptance of the following
repeat extension on 2026-09-08. Real-user pilot evidence remains pending and is
not a development prerequisite; production rollout requires a separate release.

```text
confirmed Plan ends
→ each participant privately answers happened / did not happen / skip
→ after own happened answer: would you do something together again?
→ both happened + both permissions
→ Familiar eligibility (not shown as a friend graph)
→ later compatible Intent
→ new Repeat Opportunity
→ new consent, Context and Plan
```

No one sees the other person's Outcome or Meet Again answer. One-sided permission
creates no waiting state or notification. “Repeat” is counted only after a second
qualifying encounter is independently confirmed and reported occurred.

## 11. Legacy compatibility

Existing public Course/Buddy Actions and Activities may finish their safe lifecycle
and preserve trusted Plan provenance. They do not appear as a public acquisition
surface in the current four-tab app. Their technical behavior is isolated in
[Legacy Action Compatibility](./LEGACY_ACTION_COMPATIBILITY.md).
