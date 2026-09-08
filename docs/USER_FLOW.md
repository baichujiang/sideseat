# SideSeat User Flow

**Status:** Frozen v1.0 for the current one-to-one flow

**Last updated:** 2026-09-08

**Governing product:** [Product](./PRODUCT.md)

**Scope:** User-visible interaction from Intent through Plan, plus the approved repeat boundary

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
这周你想和同学一起做什么？
[添加想做的事]
```

The user may create several independent Intents. One Intent contains one concrete
activity and one or more explicit time windows.

Current editor behavior:

- two steps: choose the concrete activity, then available times; Back preserves
  all entered fields, and the bottom action advances or saves;
- choose Coffee, Study, Sports, Explore, Food or Events;
- Coffee, Explore, Food and Events require a short concrete action rather than
  matching on the broad category alone;
- Sports accepts direct text with common suggestions instead of a long fixed list;
- Study may include a current course, a concrete goal and whether parallel study
  with different goals is acceptable;
- course input does not appear for unrelated categories;
- time input advances in 15-minute increments;
- after choosing a start, the default end becomes 30 minutes later;
- duration is at least 30 minutes;
- save returns to Together without silently starting matching.

Delivered Opportunities lead the Together page. Matching controls appear when
there is an Intent or an existing matching session; the initial empty state
leads with creating an Intent. The top-right Plans entry provides a direct route
to coordination and history. Recent Plans on Together contain unanswered private
Outcome prompts; saved answers remain editable in Plans history or conversation.

The user can edit, pause, resume or end each Intent independently.

## 3. Start matching

With at least one active Intent, the user explicitly taps `开始匹配`.

```text
IDLE → MATCHING for 48 hours → EXPIRED
            │
            └── user stops → IDLE
```

The server owns the expiry time. Together displays a live countdown, not a static
duration label. The countdown means “your eligible Intents are in the matching
queue”; it does not promise a result or disclose anyone else's activity.

All eligible active Intents participate. The current release does not ask the user
to select a matching duration. Stopping or expiry prevents new Opportunities but
does not erase already delivered Opportunities or active conversations.

## 4. Opportunity generation

The system privately considers pairs whose users both have active matching
sessions. It filters school, verification, language, time overlap, course,
activity compatibility, Block, moderation and cooldown constraints.

- General categories require the same normalized concrete action; a broad
  category alone is not a current-client match.
- Sports requires the same normalized concrete activity.
- Study prefers the same goal.
- Different Study goals may form a parallel-study Opportunity only when both
  users explicitly allow a shared study context.

Each unoccupied Intent may have one current Opportunity. There is no global
“maximum three matches” across unrelated Intents.

## 5. Decide on an Opportunity

An Opportunity card leads with:

- the shared thing;
- overlapping time context;
- minimum identity/trust context such as verified school, shared course or shared
  language;
- `愿意一起` and `暂时不要`.

It does not show a compatibility score, candidate ranking, full profile or the
other person's decision.

Decision behavior:

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

The app may now say that both are willing and offer `开始聊`. It must not create a
celebratory dating-like Match screen.

The Conversation opens with the source card so neither user enters an unexplained
blank chat. People who have chatted remain reachable in Messages after this
specific coordination ends, subject to Block and connection state.

## 7. Create and confirm a Plan

From the source card or conversation:

```text
Action Context
→ prefilled Plan Draft
→ review missing details
→ send proposal
→ accept / propose another time / decline
→ CONFIRMED Plan
→ Calendar projection for each participant
```

The draft inherits trusted title/activity, participants, proposed time, course and
available place context. Existing information is never requested again. The user
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
