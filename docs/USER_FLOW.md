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
Together / Plans / Calendar / Messages / Me
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

In My intentions, tapping a card opens its editor. The top-right × opens a delete
confirmation; confirming removes that intention and stops new matching. The card
has no bottom action row, pause/resume control or overflow menu. Existing
conversations and confirmed Plans remain unchanged. Old paused intentions retain
their status when edited and can be deleted through the same × control.

The existing backend expiry and legacy pause/resume contracts remain supported
for older clients. This card simplification does not change saved timing or expiry.

## 3. Automatic matching

The new client labels the final action `发布意向` and explains that SideSeat
automatically finds company during its validity; the user can delete the intention anytime.

```text
Publish → ACTIVE (automatically find company)
                   └── delete / expiry → no new matches
```

Both users need not be online together. A compatible new publication can match
an existing active intention, and both users receive a notification. No match is
guaranteed. Deleting removes that intention from supply. Legacy clients can still
pause/resume through the existing API.
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
  or Events may be offered as details-to-agree opportunities. The peer’s original
  description is shown; an exact shared action is not fabricated.
- Sports requires the same normalized concrete activity.
- Study prefers the same goal.
- Different Study goals may form a parallel-study Opportunity only when both
  users explicitly allow a shared study context.

Each unoccupied Intent may have one current Opportunity. There is no global
“maximum three matches” across unrelated Intents.
Feasible opportunities are ordered by activity fit, with oldest-first ties.
A lower score does not prevent delivery; no eligible active peer still means no match.

### Together page layout (2026-09-26)

The page order is **My intentions / Recommendations / Saved intentions**.
Recommendations initially shows personalized opportunities, without a finding-status
explanation. A **Find more recommendations** button at the bottom explicitly searches
for additional public intentions. Results appear in the same feed, with no separate
“More intentions” heading, search/filter panel, or upgrade panel. The button becomes
**Search again**, refreshing this supplementary result set rather than paginating.
The native access configuration allows five results for Free and ten for Plus;
Plus is currently a DEBUG preview only. Production membership entitlements are not
connected and the server still caps results at five.
Explore cards use exactly the same private Interested/save and Say hello controls
as recommendations. Opening the composer needs no prior interest action and creates
no notification; canceling sends nothing. The private contact draft does not reserve
matching supply. Preparing an opportunity updates its card in place. Saving removes
it from the recommendation feed after success and animates a miniature card toward
Saved intentions. A successfully sent message removes the card from recommendations
and exploration; eligible cards refill the requested result set up to its access
limit. Demonstration cards have disabled contact/save controls.
Saved intentions contains private heart bookmarks, an empty state and removal.
My intentions keeps its existing editing and deletion behavior.

## 5. Save an intention or send a message

Recommendation cards show the other person's avatar/name, activity, declared timing, school, primary language, intention course and public description preview when available. Private notes and missing details are omitted.
They do not repeat the viewer's intention, display scores or explain matching.
Two equal-width buttons sit at the bottom of each recommendation card: a heart
with **Interested** for private saving, and **Say hello** for the first message.
A filled heart indicates a saved intention. Accessibility text sizes stack the
buttons vertically so their labels remain readable.

- Bookmarks never notify the other person. **Saved intentions** retrieves them, including
  ended intentions with messaging disabled; users can remove a bookmark at any time.
- Say hello opens a composer with the target intention attached. Nonempty text, up
  to 500 characters, is required. Cancellation sends nothing; failures retain the draft.
- A highlighted notice above the first-message field explicitly states that only one
  message can be sent before the recipient replies, and suggests a brief introduction.
  Incoming replies do not show this first-message notice.
- One first message is allowed per opportunity. Sending immediately opens the conversation
  with that message as the sender's bubble. Contacted cards leave recommendations,
  including after a reply. Saved cards remain in **Saved intentions** with a clickable
  **View chat** button. Saved cards are also removed from recommendations; removing a bookmark restores an
  otherwise eligible, uncontacted card.
- The conversation is available in **Messages** for both participants. Before a reply,
  the sender can read it while the input area says to wait for the recipient's reply.
  The recipient can reply directly in the chat or ignore it. Incoming pending requests
  count in the Messages badge. Ignoring is private and does not permit resending.
- The same conversation page resolves to normal chat after a written reply; the sender
  sees this update while the page is open or when reopening it. Sent history remains
  readable if the intention expires or the request is ignored.
- A written reply creates/reuses the canonical chat, preserving the intention context,
  first message and reply in one transaction. Only then can this flow continue chatting.
- No plan or Calendar event is created by bookmarking, sending or replying.
- Expired/ended intentions cannot receive new messages or replies. Blocks and active
  moderation restrictions prevent contact. Legacy private-decision endpoints remain for
  Explore/older clients, but cannot accept a message request without a written reply.


## 6. Mutual consent and Messages

Additional recommendations use the same real Weekly Intents, private bookmark,
and first-message flow: send a contextual greeting, then continue chatting after a
written reply. They do not open a prefilled intention editor. The 2026-09-21 update removes the separate
showcase cards and their “Create a similar intention” action; an empty feed stays
empty. QA accounts publish real intentions within the isolated QA cohort, using
the same card UI and actions as ordinary accounts.

For recommendations, the recipient’s written reply performs the following transition.
The legacy Explore path performs it after two explicit YES decisions:

1. revalidates both users, Intents, the Opportunity window and safety state;
2. creates or reuses one canonical active Conversation;
3. freezes one privacy-filtered Action Context/source card;
4. marks the Opportunity mutual;
5. returns the exact Messages route.

The saved card offers `查看聊天`; the conversation source card says `关于这条意愿`.
No separate Match screen is introduced.

The Conversation opens with the source card so neither user enters an unexplained
blank chat. People who have chatted remain reachable in Messages after this
specific coordination ends, subject to Block and connection state.

## 7. Create and confirm a Plan

From the source card or conversation:

The intended sequence is first message → reply → chat about details → propose
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
surface in the current five-tab app. Their technical behavior is isolated in
[Legacy Action Compatibility](./LEGACY_ACTION_COMPATIBILITY.md).

## Browser workspace — 2026-09-21

After browser login, `/together` opens the five-destination shell. A desktop rail
and phone navigation lead to Together, Plans, Calendar, Messages and Me. Course
management is under Me. Old Discover/public-publishing URLs redirect to Together;
old Plan shortcuts redirect to Plans. No installation or add-to-home workflow is
part of the browser.

Together uses private persistent intentions and the same server-controlled feature
gates as the App. Publish explicitly enables matching; edit, pause, resume and end
use version checks. An individual YES stays private. Mutual YES opens coordination;
its source card can propose a Plan. Plans separates Waiting, Upcoming and Ended.
Acceptance creates both calendar projections; outcomes and meet-again permission
remain private. The browser reads actual persisted records, without demo cards.

Calendar remains the most complete migrated module: day/week/month navigation,
manual and natural-language entry, categories, course schedules, ICS import/export,
subscription calendars, search and availability sharing. Recurring edits can affect
one occurrence, this and future occurrences, or the series; an empty repeat end
means no end date. Shared Plan facts open coordination in chat and cannot be
edited/deleted as personal events. Calendar data refreshes from the server instead
of restoring a persistent page snapshot.

The browser uses ICS for calendar interoperability. Apple Calendar access remains
native. Event-share links show the filtered snapshot and currently use the App to
add a copy. The rebuilt messaging workspace covers text, replies, history, shared
calendar viewing and Plan negotiation; advanced media composition and the remaining
native-only utilities are subsequent migration work.
