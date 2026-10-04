# SideSeat User Flow

**Status:** Frozen v1.0 for the current one-to-one flow

**Last updated:** 2026-10-03

**Governing product:** [Product](./PRODUCT.md)

**Scope:** User-visible interaction from Intent through Plan, plus the approved repeat boundary

**Approved publication amendment:** With `v2AutomaticMatching`, publishing replaces
the separate matching start. Legacy saved intentions keep their original consent.
See [event-driven automatic matching](./INTENT_DRIVEN_MATCHING.md). Not yet deployed.

**Approved timing amendment:** The flexible timing behavior below is implemented
locally behind `v2FlexibleTiming`; Build 38 still uses exact windows until a new
internal client and backend rollout. See [delivery and verification](./FLEXIBLE_INTENT_TIMING.md).

## 1. App entry

Registered accounts can use their existing conversations, plans and own calendar
without a school or language profile. Campus readiness gates Together and campus
discovery only. A conversation link is retained through login and opens before
optional tutorials; later profile completion must preserve existing relationships.
The bottom navigation is always:

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

With current intentions, the compact + Add text action sits beside "What I want
to do" in the content heading, without a background or border and with a minimum
44-point touch target. The empty state shows only Add an intention, including when a returning user has completed their previous intentions.
The Together navigation bar has no creation action.

The user may create several independent Intents. One Intent contains one concrete
activity and a timing preference. Default: time to discuss. A compact Time row
opens a dedicated sheet for one or more exact windows. Done saves the draft;
Cancel or swipe dismissal keeps the previous selection; Not sure yet restores
undecided timing. Existing date-range preferences are preserved until explicitly
replaced or cleared. Intention is not an appointment.

Current editor behavior:

- one form: choose the activity, optionally describe it and set the time; the
  bottom action publishes or saves;
- the Time section lists every selected date/weekday and time range. Its Modify
  action opens the time sheet to adjust, add or remove slots; undecided timing
  stays a compact row. Published own-intention cards show two slots initially
  with an inline action to expand or collapse the rest;
- Plan again prefills the original weekday/local time and duration next calendar
  week. The user can adjust it or return to undecided timing before publishing;
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
The native page keeps a horizontal selector when the complete labels fit. At
accessibility text sizes or narrower widths, one button shows the current section
and opens a section sheet; selection and each page's scroll position are retained.
The sheet exposes the full section names and selected state to accessibility.
An empty My intentions page shows one brief heading, a short **Add** action with
the full **Add an intention** accessibility label, then explanatory text. It does
not repeat the active-intentions heading or reduce the user's text size.
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
matching supply. Preparing an opportunity updates its card in place. Saving keeps
the card and scroll position in the current browsing list, with a filled heart and
Interest shown state. It neither flies to nor opens Saved intentions; that page is
entered explicitly. An explicit refresh or new search can replace the result set
and omit already saved cards. A successfully sent message removes the card from recommendations
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
  **View chat** button. Cards saved during browsing remain in place until an explicit
  refresh or new search; removing a bookmark restores an otherwise eligible,
  uncontacted card on later requests.
- **Messages** keeps active conversations in the main list. The **New greetings** shortcut sits below search, above the conversation rows,
  leaving the navigation title uncluttered. It has a blue waving-hand tile with the label below,
  aligned to the left, and shows the total greeting count as an icon corner badge and opens a separate list grouped into **Waiting for
  your reply** and **Awaiting their response**. Each list has its own search. Pinned conversations
  have an adaptive blue-gray background; ordinary chats keep the standard background.
  Both appear in one continuous list, with pinned chats first and no Pinned/Recent section headings.
- The conversation is available in **Messages → New greetings** for both participants. Before a reply,
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

### Current arrangement in a native conversation — 2026-10-03

The chat header reads the current connection's authorized, paginated Plans. It
prioritizes an invitation needing the viewer's reply, then an ongoing or next
confirmed meet-up, then an outgoing invitation. Superseded, canceled and ended
Plans do not replace a current arrangement. Multiple Plans open a grouped list;
a proposed reschedule stays with its existing confirmed time.

An explicit historical Plan entry remains focused and says **Viewing · Ended**;
**View current plans** returns to the current arrangement. With no current Plan,
the original source is labeled **Met through this intention**. Source snapshots
remain in chat history/details. Failed refreshes retain known data and offer retry.

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

Plan list cards and chat Plan cards include a compact relative-time hint alongside
their existing date/time information. Future dates use Tomorrow / In N days;
same-day times use Today, approximate hours (within six hours), or Within an hour.
Confirmed Plans within 30 minutes show Starting soon, then In progress until the
end time. An unconfirmed proposal never claims to be in progress. Canceled,
declined, expired or superseded proposals have no countdown. Absolute dates remain
visible, including full date headings in Upcoming. Hints refresh each minute and
on returning to the app; elapsed time never records a completed Outcome.

### Native Plans overview — 2026-10-02

Plans opens on **Overview**, showing invitations that need the viewer's response
first (two initially, with an explicit expand action), followed by the nearest
confirmed meet-up. The next meet-up remains visible even when there are no pending
invitations. **View all** opens the complete Upcoming list, grouped by date.
Outgoing invitations sit in a collapsed **Awaiting their response** section with
a count. The existing Upcoming and Ended tabs remain available.

At accessibility text sizes, one current-section button opens a full-height section
sheet. All three sections remain selectable, with the current selection announced;
switching sections retains each list's scroll position. Normal text sizes keep the
segmented control. Ended-plan continuation actions in both Plans and chat use short
visible labels at accessibility sizes, while their accessibility labels retain the
full action and the original companion's name. No text-size cap is applied.

Each card separates activity, time, location and participant. Incoming invitations
name the sender and show **View and respond**, opening the existing conversation
and its accept / alternative-time / decline controls. Confirmed cards carry an
explicit confirmation label. Ended retains private Outcome entry and editing.
This changes presentation only; it does not send a response or create a commitment.

### Chat plan navigation — 2026-10-04

At accessibility text sizes or when the full summary cannot fit the available
height, chat uses a compact status entry. Tapping it locates the same plan revision
in the message history, aligned from its top. Full plan facts remain in that card.
Current-plan navigation and jumping to the latest message are separate actions.
The latest-message control appears while away from the bottom and reserves space
outside the message viewport; it preserves the composer draft and clears explicit
historical plan focus. Choosing a different plan is explicit; closing its selector
keeps the previous selection. The original historical plan is not replaced by the
current-only plan list. Long draft input scrolls within the editor when vertical
space is needed for messages and fixed controls.

### Smart time coordination — 2026-10-02 (simplified)

The chat composer has one **Plan** entry. It opens the standard Plan editor with a
**Find a time together** shortcut at the very top, matching Calendar's Smart fill
entry. Manual date/time, title, location and note fields remain directly editable.
The separate smart-time bar above the chat composer has been removed.

Tap the editor shortcut to immediately load three concrete free windows from the
signed-in user's synchronized calendar, for example Saturday 09:00–12:00 and Sunday
13:00–17:00. No date-range setup, duration picker or schedule sharing page is
involved. **Show other times** cycles through further suggestions.

The chooser shows the current activity title when provided, followed by a grouped
list of date, time range and free duration. **Show other times** sits alongside the
list heading. A close button returns to the draft; empty/error states also offer
**Choose time manually**. Large text uses a full-height sheet and stacked content.
The activity title is context only and does not affect recommendation ranking yet.

Recommendations cover tomorrow through the following seven days in Berlin time.
They retain continuous free time within morning (09–12), afternoon (12–17) and
evening (17–21), excluding fragments shorter than 30 minutes and prioritizing
several dates. They describe **your** availability, not the peer's private calendar.
Errors and no suitable windows are explicitly shown rather than guessed.

Selecting a window returns to the same Plan editor and updates only start/end time.
Existing title, location, note and conversation origin are retained. Canceling the
recommendation sheet leaves the whole draft unchanged. Nothing is sent until **Send plan**; the peer must
accept before either calendar changes. Closing recommendations sends nothing.
No new share/link is created. Existing historical share cards remain separate
compatibility surfaces. Calculation is local and uses no LLM; this iteration adds
no Plus gate. Unsynchronized commitments may be absent from suggestions.

The requested next recommendation upgrade is not implemented by this entry change:
respect the user's daily available hours, rank by activity fit, schedule density,
transition/rest buffers and weekday/weekend context, explain why a window fits,
and let the sender offer several candidate times for the peer to choose. Current
recommendations remain free-window filtering and send one selected Plan time.

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

Smart fill supports typing, on-device dictation and image text input. Add from
image opens the system photo picker for one image. On-device OCR appends text to
the existing input, preserving typed details. The user can edit the result and
open the source image for comparison before Preview events. Images are not
uploaded; the existing text parser returns up to ten editable event drafts, and
the user confirms the batch separately. Images are limited to 20 MB and parser
input to 2,000 UTF-16 code units; oversized text is retained for editing rather
than silently truncated. Dense grid timetables may need smaller crops and manual
correction of date/time associations.

The current smart-fill design uses one editable preview for all drafts, with no
inference badges or extra confirmation step. Missing information is completed
before preview, and the user chooses when to save. The authoritative completion
tree, duration rules, examples and verification boundaries live in
[Calendar smart input](./CALENDAR_SMART_INPUT.md). The policy is implemented and
locally verified; production and device release status is tracked separately.

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

### Directly invite the same person again — 2026-10-03

Ended cards in Plans and chat offer **Plan again** (or **Arrange another time**
after a did-not-happen answer). Feedback is optional for this action; it does not
require Meet Again permission or its feature gate. Saved feedback is compact and
remains editable and private.

The new draft inherits the same recipient, title, activity type and place. Dates
and note start empty. The user explicitly chooses a new future time or a free-time
suggestion, then sends the invitation. Canceling creates no message or calendar
entry. Editing a text field provides a keyboard Done action before continuing.

Submission creates an independent Plan in the original conversation, with no
reused intention origin or counterproposal link. Acceptance adds the new activity
to both calendars; the first Plan and its feedback are preserved.

### Publish a new intention after an ended activity — 2026-10-03

Ended, accepted Plans in Plans and chat offer two distinct paths: **Plan again
with [person]** continues the existing conversation; the lighter **Publish new
intention** opens a new-intention draft on the current surface. Neither path waits
for the peer's private feedback or Meet Again permission.

The new intention starts with the Plan title and an unambiguous activity category
when available. Custom Plan types require an explicit category choice. Time
starts undecided; old dates, participants, messages and private notes are not
copied. The user reviews the public-intention disclosure before publishing.
Cancel returns to the same Plan/chat without writing. Successful publication opens
My intentions with the newly published card and a **View recommendations** action;
recommendations keep their real loading/empty state. Original history is retained.

This does not expose ENDED intentions as a history list: deleted and consumed
intentions currently share that state.

### Private permission for future matching

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

### 2026-10-02: external intention sharing, first version

An explicit share action on an active intention creates an unlisted public link. Visitors see the activity and declared availability without signing in. Contact starts a temporary guest session; the first written greeting enters the publisher's existing message requests, and their written reply opens direct chat. The visitor stays on the shared page throughout.

“Keep in touch” and “Add to my schedule” offer inline username/password registration. The guest User ID and conversation are preserved. Registration is required for a private calendar reminder; it does not confirm a bilateral Plan. No school identity is fabricated, and profile completion can happen later. Apple/Google sign-in is outside this first version. See [implementation and local verification](qa/2026-10-02-intent-share.md).

### 2026-10-03: guest conversation and Plan continuation

The shared intention page streams conversation updates while visible, reconnects on return, and uses polling only while the stream is unavailable. A Plan invitation shows its title, time, location, note and current status in the conversation. “Create account & accept invitation” opens inline registration with that Plan retained; successful registration continues through the canonical acceptance API and writes both participants’ Calendar projections. Guests cannot accept before registration. The existing guest identity, messages and invitation remain intact. The registered visitor can continue on the page or sign into the app with the same credentials.

Ending an intention stops new visitors from contacting its owner but preserves access for its existing Mutual conversation participants while the share token remains valid. This includes the automatic ending that follows Plan acceptance. Revocation, Block and moderation continue to stop shared-page access. Canceling or changing a Plan updates the visible card.

### 反馈编辑与保存（Preview 93）

计划页与原聊天的结束计划共用反馈组件。较大字号／不足的宽度下，已保存状态和选项完整换行，修改入口单独占行。编辑时仍显示最后一次确认的私有结果；“取消修改”只收起编辑，不发请求。提交中显示保存进度并禁用重复操作；只有读回对应结果后结束编辑。提交失败或结果未能确认时保留原值并显示重试提示。发生／未发生仍分别对应再约／换个时间，发布新意愿独立存在。

最大辅助字号且键盘打开时，引用回复提示使用输入行左侧的回复／取消按钮；收起键盘恢复完整引用预览。提示的读屏值保留发送者与原消息。引用关系和全部草稿不变；输入框占位文字不参与容器高度测量。

同样在大字号输入期间，“最新”入口并入输入行，保留 44 pt 触区与完整读屏名称，收起键盘恢复“最新”文字。字号变化保留当前阅读的消息，计划定位直接落在卡片正文。原生实时接收保留 SSE 空行分隔，收到消息后按原规则更新未读提示。

大字号下，来源意愿摘要同样使用紧凑入口。点开继续查看完整来源及事件信息，详情关闭后保留草稿。

**2026-10-04 sharing continuity amendment:** A selected shared time is submitted
separately from greeting text with the intention version. The server validates it
against the locked current intention and stores an immutable suggestion in the
conversation source. The native Plan draft prefills that suggestion and requires
the proposer to confirm it. Stale selections at greeting submission keep the text
and refresh available times; already-sent suggestions remain historical context,
and elapsed times require a new proposal. No selection means time remains open.
