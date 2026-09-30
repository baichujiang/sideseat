# Together Engineering Contract

**Status:** Implemented first-encounter foundation

**Policy:** `MUTUAL_OPPORTUNITY_V1`

**Last updated:** 2026-09-26

**Governing flow:** [User Flow](./USER_FLOW.md)

**Scope:** Weekly Intent, matching session, Mutual Opportunity and mutual activation

**2026-09-26 recommendation contact amendment (local, not deployed):**
Recommendations use private bookmarks and explicit first messages. This supersedes
private YES/NO UI and the bilateral-YES activation rules below for this new path.
`POST /api/v1/me/mutual-opportunities/{id}/interaction` accepts BOOKMARK,
UNBOOKMARK, SEND (body), REPLY (body), or IGNORE. Mutations require ownership,
authentication and an idempotency key. First messages require 1–500 trimmed characters.

`MutualOpportunityBookmark` is viewer-private. `MutualOpportunityMessageRequest`
holds one first message per opportunity. `/api/v1/inbox` exposes participant-scoped
pending `messageRequests`; the receiver sees sender identity and the target intention
snapshot, never its private note. A message request remains outside `Connection`
until the recipient supplies a written reply. Under the canonical pair, intention and
opportunity locks, reply atomically creates/reuses chat, inserts the context card and
both messages, unlocks normal messaging, and marks the opportunity MUTUAL. Existing
private-decision routes cannot bypass this reply requirement. Blocks, moderation,
ended intentions and inactive canonical chats reject new contact.

Saved opportunities remain retrievable when expired, with actions disabled except
unbookmark. Ignore is not disclosed to the sender. Sending/replying may notify the
other participant; bookmarking never does. Plan acceptance remains separate.

**2026-09-26 conversation presentation amendment (local, not deployed):**
Native first-message sending opens an intention conversation immediately. Saved cards
and the inbox both provide a clickable chat destination. The participant-scoped
`GET /api/v1/me/mutual-opportunities/{opportunityId}` returns the first message and,
after reply, its canonical connection. The native destination renders a pending
message timeline and transitions in place to DirectChatView after reply. The sender
has no send control before reply. Recipient reply uses the existing interaction
transaction; no Connection is created prematurely. Inbox retains outgoing unresolved
requests as readable conversations, including expired/ignored requests; ignored status
remains private and REPLIED requests are represented by the normal conversation.

**2026-09-26 contacted-feed amendment (local, not deployed):**
Native recommendations exclude opportunities with a message request or coordination.
Private bookmarks also exclude a card from the feed after a successful save.
The tab order is intentions → recommendations → bookmarks; the default selection
logic is unchanged. Native saving animates a small card toward the bookmarks tab
and announces success. Reduce Motion uses static confirmation instead. Saved cards and message history are
preserved; only feed presentation changes. Exploration filters intentions linked to
participant-owned contacted or viewer-bookmarked opportunities before applying its result limit, allowing
eligible cards to refill the requested result set up to its access limit. Failed sends and canceled composers
leave cards in place. The opportunity API remains a shared source for bookmarks and
conversation state; feed filtering does not delete opportunities or messages.

**2026-09-26 on-demand recommendations amendment (local, not deployed):**
The recommendation page omits the finding-status description. Additional public
intentions load only after tapping Find more recommendations, then appear directly
in the same feed without a More intentions section. Search again refreshes those
results. Native limits are Free five / Plus ten; Plus is a DEBUG-only preview until
membership entitlements are connected. The production endpoint remains capped at
five. Saving and contact retain their shared card actions and feed exclusions.

**2026-09-26 unified exploration contact amendment (local, not deployed):**
Explore cards use the recommendation bookmark and first-message mechanism.
`POST /api/v1/explore/intents/{intentId}/contact` prepares or reuses contact context
under canonical pair and intention locks, without recording YES or sending a notification.
A new `DRAFT` opportunity is visible only to its creator, excluded from matching
occupancy, and backed by a private response intention excluded from My Intentions.
BOOKMARK remains private; SEND rechecks the current public intention and transitions
the draft to PENDING with a message request. Reply still creates the chat. Preparing
or canceling the composer never bookmarks, sends, or starts a chat. Existing
recommendations are reused. The legacy `/interest` route remains for older clients;
the current native app no longer calls it. The draft enum and activation constraint
are separate additive migrations so PostgreSQL commits the enum value before use.

**2026-09-09 publication amendment (local, rollout-gated):**
[Event-driven automatic matching](./INTENT_DRIVEN_MATCHING.md) supersedes the
session-only enrollment rules below for explicitly published intentions when
`v2AutomaticMatching` is enabled. ACTIVE lifecycle is the supply gate; no separate
Start or 48-hour session is required. Legacy rows default to their original
session consent, without automatic conversion. Pause/end and locked insertion
preserve the existing safety boundaries. Build 38 remains on the legacy flow.

**2026-09-09 timing amendment (local, rollout-gated):**
[Flexible intention timing](./FLEXIBLE_INTENT_TIMING.md) supersedes the exact-only
rules below when `v2FlexibleTiming` is enabled. New explicit preferences are EXACT,
FLEXIBLE (inclusive local dates plus ANY/MORNING/AFTERNOON/EVENING), or UNDECIDED.
Non-exact modes store no exact windows; compatible preferences may match with NULL
Opportunity timestamps. New intentions last 14 days; EXTEND is an explicit,
version-checked owner mutation. Legacy NULL preferences retain exact semantics and
original expiry. Calendar is still populated only by accepted timed Plans.
Build 38 / production have not received this amendment yet.

## 1. Weekly Intent

A Weekly Intent is private, owner-scoped and short-lived. Current fields support:

- one topic: Coffee, Study, Sports, Explore, Food or Events;
- normalized concrete activity text where needed;
- optional current course for Study only;
- optional Study goal and parallel-study consent;
- a concrete action for Coffee, Explore, Food and Events;
- one or more explicit social time windows;
- IANA time zone and short clarification;
- `ACTIVE`, `PAUSED`, `ENDED`, `EXPIRED` lifecycle.

Users may maintain multiple independent Intents. There is no user-facing product
quota. A high server abuse guard may bound non-terminal rows but must never be
presented as “you may only want to do N things.”

```text
ACTIVE ↔ PAUSED
  │         │
  └─────────┴──→ ENDED
  └────────────→ EXPIRED
```

- Only ACTIVE Intents owned by a user with an active matching session are supply.
- ENDED and EXPIRED are terminal.
- Expiry is the next Sunday boundary in the submitted IANA time zone and no more
  than eight days from creation.
- Editing does not silently extend expiry.

Time-window rules:

- user-declared availability only; never inferred from Calendar;
- future ISO timestamp ranges, 30 minutes to 12 hours;
- no overlap and no end after Intent expiry;
- at most seven windows per Intent;
- iOS uses 15-minute increments and defaults end to start + 30 minutes;
- server timestamps remain authoritative.

## 2. Matching session

```text
IDLE ── start with ACTIVE Intent ──→ MATCHING
MATCHING ── stop ──→ IDLE
MATCHING ── 48 hours ──→ EXPIRED
EXPIRED ── start ──→ MATCHING
```

- Start/restart is explicit and creates one fixed server-authoritative 48-hour
  window.
- The current release has no duration selector.
- The client renders remaining time from the server expiry and corrects after
  foreground/reload.
- Stop/expiry blocks new inserts but preserves delivered Opportunities and active
  coordination.
- Both owners' sessions are locked and revalidated before Opportunity insertion.

## 3. Eligibility and matching

V1 requires:

- onboarded and verified users in the same served school;
- both users currently MATCHING;
- ACTIVE Intents with at least 30 minutes of overlapping declared time;
- at least one shared language;
- same current course when either Intent is course-scoped;
- no pair Block, moderation suppression, cooldown or unresolved-limit violation.

Calendar content is never queried.

Compatibility rules:

- general non-Study/non-Sports topics prefer the same normalized concrete
  action; with `V2_ACTIVITY_FIT_ENABLED=1`, different concrete descriptions in
  the same topic may create `SHARED_CONTEXT` with no parallel-study context;
  nullable legacy rows never consume a new concrete Intent;
- Sports requires the same normalized concrete activity; broad `SPORTS` alone is
  insufficient;
- activity fit orders feasible candidates; no minimum-score delivery filter;
- Study exact normalized goal is preferred to parallel study at equal time fit;
- different Study goals may match as `PARALLEL_STUDY` only when both users allow
  shared-context parallel study;
- each currently unoccupied Intent may produce one current Opportunity;
- there is no global maximum-three rule across unrelated Intents;
- list reads and generation batches remain technically bounded.

The [activity-fit policy](./MATCHING_ACTIVITY_FIT.md) defines weights, frozen
snapshot fields and rollout. Related opportunities preserve both descriptions,
use a neutral topic-level Plan title, and require coordination before commitment.

## 4. Opportunity and decision state

```text
PENDING ── both current YES ──→ MUTUAL
   │
   ├── time/intent/eligibility loss ──→ EXPIRED
   └── safety/terminal connection ────→ UNAVAILABLE
```

Viewer decision:

```text
UNDECIDED → YES → WITHDRAWN
UNDECIDED → NO
```

Raw counterpart decision, decision order and timestamp are never serialized. A
unilateral YES creates no Conversation, waiting state, push or visible counterpart
state. NO does not expose an actor; neutral expiry closes the unresolved object.

## 5. Atomic mutual activation

The second valid YES executes under user-safety, canonical-pair and Opportunity
locks:

1. re-read users, Intents, the Opportunity window, Block, moderation and policy;
2. persist the decision idempotently;
3. create or reuse exactly one canonical ACTIVE Connection;
4. freeze one privacy-filtered source snapshot;
5. create exactly one server-owned source card;
6. transition the Opportunity to MUTUAL;
7. return the exact Messages route.

A terminal Connection, expired Opportunity, invalid Intent or concurrent Block
prevents activation. Stopping matching only leaves the supply queue: an already
delivered Opportunity remains actionable until its own expiry or another listed
invariant invalidates it. Same idempotency key returns the same result.

The source card may prefill a Plan Draft but never creates or accepts a Plan. Plan
services re-read trusted origin data and do not accept a client-forged snapshot.

## 6. API

```text
GET    /api/v1/me/weekly-intents
POST   /api/v1/me/weekly-intents
PATCH  /api/v1/me/weekly-intents/{intentId}
DELETE /api/v1/me/weekly-intents/{intentId}

GET    /api/v1/me/together-matching-session
POST   /api/v1/me/together-matching-session
DELETE /api/v1/me/together-matching-session

GET    /api/v1/me/mutual-opportunities
POST   /api/v1/me/mutual-opportunities/{opportunityId}/decision
DELETE /api/v1/me/mutual-opportunities/{opportunityId}/decision
```

- Mutations require authentication, onboarding and `Idempotency-Key`.
- Intent PATCH/DELETE also require an expected version.
- POST decision accepts exactly YES or NO; DELETE withdraws only the viewer's
  unresolved YES.
- GET returns only owner/viewer-safe projections and may lazily expire stale rows.
- The plural Intent response may temporarily include a singular legacy projection
  for rolling TestFlight clients.
- Enrollment uses global `v2WeeklyIntent` and `v2MutualOpportunity` flags. There is
  no per-account Together allowlist.
- Kill switches disable new enrollment/activation but keep read, pause, end,
  withdraw and expiry safe-drain paths available.

The recommendation projection also includes `peerIntention`: the other owner's
current activity fields, declared timing and their course. It selects intent B for viewer
A and intent A for viewer B. `descriptionPreview` is limited to 96 trimmed characters
from explicitly exploration-visible intentions, matching the public exploration card.
Non-public notes and intention/owner IDs are not exposed. `peer.campus` and
`peer.languages` provide the school and primary language independently of shared fit. Legacy
null timing preferences map to EXACT and retain their existing windows. Closed
or unavailable opportunities omit this content. Existing source snapshots used
by conversations and Plans remain unchanged. The native card uses peer activity
and timing without displaying comparisons or scores; older responses without
peer timing show “time to discuss”.

## 7. Privacy, retention and compatibility

- No private Intent note, raw decision, exact private location, person ranking or Calendar
  content enters another user's projection.
- The approved activity-fit score and both relevant concrete activity texts may
  enter that opportunity's projection; score is symmetric and independent of consent.
- Account deletion cascades private Intents, decisions and Opportunities.
- Historical source snapshots are minimized and privacy-filtered.
- Unblock never resurrects an expired/unavailable Opportunity.
- Legacy Action, Interest, Conversation, Plan and Calendar rows keep their original
  versioned semantics.
- Old clients cannot create or decide Mutual Opportunities.

## 8. Required verification

- validators reject malformed zones, past/overlapping windows and unknown fields;
- create/edit/decision/session commands are idempotent;
- another user cannot read or mutate an Intent or raw decision;
- course membership and verification are rechecked server-side;
- DST expiry is deterministic;
- exact Sports and fuzzy parallel-Study behavior are covered;
- lower-fit general activities reach bilateral consent, Plan and both Calendars;
- fit scores/reasons are symmetric and do not reveal unilateral decisions;
- both matching-session locks prevent stale-pair insertion;
- one-sided YES remains invisible;
- mutual activation creates one canonical Connection/source card;
- Block versus decision cannot leave a live hidden commitment;
- account deletion and global kill-switch safe drain work;
- OpenAPI and generated Swift types remain synchronized.

### 2026-09-26 意愿过期与重新发布（开发版本）

`GET /api/v1/me/weekly-intents` 保持 `intent` / `intents` 为非终态记录，新增 `expiredIntents` 历史数组。确切时间的截止点为最后一个时段的结束，灵活日期范围按原时区最后一天结束计算；未定时间无截止点。原生端将过期记录放入默认折叠的历史区。

「再约一次」是带入活动内容、重新选时间的 POST 创建，不是恢复或编辑旧 ID。旧收藏、招呼、聊天及计划关系不迁移到新记录。收藏响应以 `isExpired` 标识对方意愿过期，保留过期卡片上下文；已有会话继续可访问，过期意愿不接受新招呼。

原生新发布明确发送 `exploreVisible: true`；旧未公开意愿只有在编辑中主动开启后才加入更多推荐。服务端保留省略该参数时的旧默认行为，避免旧客户端无意公开内容。暂不支持周期性自动发布。
