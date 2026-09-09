# SideSeat Design System

**Status:** Current native design contract

**Last updated:** 2026-09-09

**Governing flow:** [User Flow](./USER_FLOW.md)

**Scope:** SwiftUI tokens, reusable components, visual hierarchy and interaction presentation

## 1. Principles

- Use native SwiftUI structure and behavior first.
- One primary task per screen.
- Use one interactive Rose accent (`#FB4185`) consistently.
- Product primary actions use adaptive ink/chalk; Rose is a small selection accent,
  not a large filled area on every card. Original category artwork adds personality.
- Brand gradients belong to Auth/Tutorial and rare hero moments, not product lists.
- Together, Calendar, Messages and Me share one component/token system.
- Dynamic Type, VoiceOver, Light/Dark and safe-area behavior are requirements.
- Calendar grids and message bubbles may use specialized layout but still consume
  semantic tokens.

## 2. Product surfaces

| Surface  | Primary task                   | Visual rule                                                                         |
| -------- | ------------------------------ | ----------------------------------------------------------------------------------- |
| Together | Intent, countdown, Opportunity | Action-first cards; status through text/structure, not color alone                  |
| Calendar | Understand and edit time       | Neutral grid; Rose for selection/current-time hierarchy                             |
| Messages | Coordinate and manage Plans    | Reading comfort over brand saturation; source and Plan cards have distinct surfaces |
| Me       | Identity and settings          | Native grouped hierarchy; light brand wash only where useful                        |

Root pages may use one compact brand/navigation signature. Secondary pages use
standard iOS titles and back behavior.

## 3. Semantic tokens

Tokens live in `SideSeatTheme.swift`; calendar-specific metrics live in
`CalendarChrome.swift`.

| Token family                   | Use                                                           |
| ------------------------------ | ------------------------------------------------------------- |
| `accent` / `rose`              | selected controls, compact emphasis, unread state             |
| `ProductAction.*`              | paired ink/chalk product button fill and foreground           |
| `activityInset`                | warm neutral activity context and selected category surface   |
| `verifiedSeal`                 | verified trust state; never reuse interaction Rose            |
| `bg`, `bgGrouped`, `surface`   | system-adaptive canvases and cards                            |
| `textPrimary`, `textSecondary` | system-adaptive content hierarchy                             |
| `danger`, `success`            | destructive/error and success semantics                       |
| `calendarNow`                  | current date/time indication                                  |
| `Chat.*`                       | canvas, own/peer bubble, structured card and quote separation |
| spacing/radius/text tokens     | consistent layout and Dynamic Type                            |

Do not add Feature-local hex values, duplicated radii or an additional visual
framework without an explicit design-system decision.

## 4. Components

Reusable controls live in `Core/Design/Components/`:

- `SSPrimaryButton`, `SSSecondaryButton`;
- `SSTextField`, `SSSecureField`, `SSFieldMessage`;
- `SSCard`, `SSSectionHeader`, `SSGroupedSection`;
- `SSFlowCard`, `SSFlowCardHeader`, `SSFlowNotice`, `SSFlowChoice` and
  `SSFlowActionDock` for the Together → Plan journey;
- `SSActivityArtwork` and `SSActivityChoice` for the six illustrated activity categories;
- `SSListRow`, `SSEmptyState`;
- `SSScreen`, `SSBrandAtmosphere`;
- `SSActionPrompt` for product-owned confirmation;
- SideSeat share components where a stable shared pattern exists.

System permissions and system-owned input remain native. Product confirmations,
dangerous operations and recurrence-scope decisions use the centered SideSeat
prompt. Long-press menus share an action model but choose presentation by object:
message and event actions remain anchored near their source; region actions may
use a panel. Tapping outside dismisses any custom menu.

### Together and Plan card template

Use one anatomy across owner Intent, Opportunity, mutual chat source, Plan list
and chat Plan cards: context/status → concrete title → time/place/person → action.
The shared surface uses a 22pt radius, 16pt content inset, neutral adaptive fill
and a quiet hairline. Status always includes text; it never relies on color alone.
Use inset notices for privacy and the effect of accepting or rescheduling.

An actionable Plan or mutual Opportunity has one full-width ink/chalk primary action.
An undecided Opportunity uses the bidirectional interest bar described below.
Withdraw, decline and alternate-time actions remain secondary, with targets at
least 44pt high. At accessibility sizes, alternatives stack without shrinking
their labels. Outcome choices have equal weight and show only the viewer's answer.

### Opportunity card hierarchy — 2026-09-09

The native Opportunity variant keeps `SSFlowCard` and shared tokens, with this
reading order: activity → peer → shared time → activity context → fit → decision.
The concrete activity uses a leading bold title and a trailing original category illustration;
do not repeat the category when it is already the title. A 48pt system/custom
avatar and inline verified seal give the peer a recognizable place near the top.
The time row uses the warm neutral `activityInset`, not a large nested explanation card.

Related activities show a neutral category title, the fact that details remain
to be agreed, and both original ideas. Parallel Study also shows both goals.
These comparisons use two columns normally and stack at accessibility text sizes.
Never relabel an opportunity as an agreed activity or a confirmed Plan.

Activity fit is a compact `score/100` disclosure row. Its neutral label and
Rose-tinted number refer to activity compatibility, not a person rating or success
probability. Expanding reveals the match explanation, course context where present,
score breakdown, overlap and disclaimer, using intrinsic text height and reduced-
motion-aware animation. Legacy cards without a score show “Why this opportunity”.

Use the interest bar for the initial decision and a short mutual-consent reminder.
Private YES still exposes only a withdrawal action; only the existing mutual/
coordination state exposes “Chat about the details”. No matching,
consent, production data or Layer 2 Gate rule changes accompany this redesign.

Card hierarchy verification before the swipe-bar change passed on 2026-09-09
(Europe/Berlin), iPhone 17 Pro / iOS 26.5
simulator, `SideSeat-Development`:

- Six activity topics, 100/100 exact cards and parallel Study goals; private YES
  and mutual-ready presentation; YES, NO and Withdraw fixture callbacks.
- Related 60/100 cards and expand/collapse in Chinese, English and German,
  including Dark and Chinese accessibility5. Expanded text reserves its full
  height before the decision area; different ideas remain visible when collapsed.
- Largest-Dynamic-Type Together navigation and decision targets; two lifecycle
  unit tests confirm the existing consent/coordination requirements.
- Final result: 3 UI tests + 2 unit tests passed in
  `/tmp/SideSeatOpportunityRedesign-20260909-r4.xcresult`; log:
  `/tmp/sideseat-opportunity-redesign-native-r4.log`.
- Screenshots: `docs/visual-qa/opportunity-*.png` and `activity-fit-*.png`
  (local, ignored). Strings validation, document formatting and diff checks pass.

These are offline QA fixtures, not production matching or TestFlight acceptance.
The redesign and system avatars are committed/pushed for
[Build 38](./releases/2026-09-09-testflight-38.md); that record tracks publication.

### Private interest swipe bar — 2026-09-09

`SSOpportunityDecisionBar` replaces the undecided card's two standalone buttons
with one neutral capsule track, embedded direction labels and a 48pt circular
handle. Right is “Interested” / `有兴趣`; left is “Ignore” / `忽略`.
The neutral left half and subtle Rose right half distinguish the two actions;
only the handle shows directional chevrons, leaving more room for the labels.
The 48pt handle uses fixed-size symbols while the endpoint text follows Dynamic
Type. Short helper text keeps the card compact, and release feedback uses the
same interest/ignore wording as the labels and VoiceOver actions.
Rose indicates the interest direction; skipping stays neutral, not red/destructive.

Only releasing after actual horizontal travel reaches 72% of the available
half-track submits. Projected flick velocity never commits. Short/reversed drags
return to the center; vertical scrolling can begin on the handle without answering.
The handle's native pan recognizer rejects vertical intent before recognition:
the initial SwiftUI gesture consumed scrolling on iOS 26.5, reproduced in UI QA.
Crossing the threshold produces selection feedback and a localized release cue.
Reduce Motion removes the return spring. Saving uses the existing mutation state
to show progress and disable input; server errors leave the original card retryable.

Both embedded labels remain 44pt-or-larger tap targets, and the handle exposes
named VoiceOver actions. Large text grows the track and wraps labels instead of
shrinking them. This is one visual control, not a people-swiping deck or match
celebration. Existing private YES/NO, withdrawal and bilateral consent rules stay
unchanged; mutual interest opens chat, while Plan confirmation remains separate.

Swipe-bar verification passed on the same iPhone 17 Pro / iOS 26.5 simulator:

- Actual left/right drags in Chinese Light and German Dark; short drags return
  to center; vertical drags starting on the handle scroll the page without answering.
- Embedded tap alternatives across all six topics; private YES and mutual-ready
  states still gate the conversation action correctly.
- Chinese/English/German fit disclosures, Chinese accessibility5 and largest-text
  Together navigation/decision targets; 4 UI tests + 4 gesture/lifecycle unit tests.
- Result: `/tmp/SideSeatOpportunitySwipe-20260909-r5.xcresult`; log:
  `/tmp/sideseat-opportunity-swipe-r5.log`. Prettier, string validation and diff checks pass.
- Local screenshots: `docs/visual-qa/opportunity-swipe-zh-Hans-light.png` and
  `opportunity-swipe-de-dark.png`; no live Outcome or matching data was written.

The subsequent interest/ignore style refinement passed 3 focused UI tests and
4 gesture/lifecycle unit tests, with zero failures, on the same simulator.
This rerun verifies the exact Chinese/German labels and their left/right layout,
both drag directions, short-drag cancellation, vertical scrolling, three-language
fit disclosures and accessibility5 controls. Light Chinese and Dark German
screenshots were refreshed and visually checked. Result:
`/tmp/SideSeatInterestBarPolish-20260909-r1.xcresult`; log:
`/tmp/sideseat-interest-bar-polish-r1.log`. Localization validation, Prettier and
diff checks pass. Gesture thresholds, callbacks and private consent are unchanged.

This is local simulator acceptance, not a TestFlight release or a physical-device
haptic check. The feature is committed for Build 38. After internal publication,
check swipe feel and haptics on the two updated test phones.

### Interest bar motion and feedback — 2026-09-09

The bar responds to interaction, without idle loops or a match celebration:

- Pickup lifts the 48pt handle with a light impact; live drag adds a small elastic
  stretch/tilt, directional shadow and a continuous origin-to-handle color trail.
- An inset progress ring and a dashed destination mark show the travel still
  needed. Two discrete selection ticks precede the existing 72% release threshold;
  crossing it adds a springing halo, check/minus symbol, medium impact and release cue.
- Release snaps to the chosen end over 180ms and adds a firm impact. The existing
  async YES/NO action then runs; input stays locked until it completes. The UI says
  Saving, never Saved before the store confirms it. A retained card returns to
  center and re-enables its controls after an error. Tap and VoiceOver use the same path.
- Short/cancelled drags spring to center. The native horizontal recognizer still
  leaves vertical scrolling alone; actual travel, not velocity, decides submission.
- Reduce Motion removes lift/stretch/tilt, halo expansion and spring/snap animation;
  direct finger tracking, color, progress and text feedback remain. No animation
  delay is added to that mode. Haptic strength requires a physical-phone check.

The tallest localized feedback cue reserves its space, so changing hints does not
move the track under the finger. These are presentation changes only: interest is
private, bilateral interest opens chat, and confirming a Plan is still separate.

Verification passed on iPhone 17 Pro / iOS 26.5 Simulator: 4 distinct UI tests and
2 gesture unit tests across `/tmp/SideSeatSwipeMotion-20260909-r1.xcresult` and
`/tmp/SideSeatSwipeMotion-20260909-r3.xcresult`. Coverage includes Chinese Light
right-swipe, German Dark left-swipe, the English forced Reduce Motion path, short
drag cancellation, vertical scrolling, tap actions, six topics/consent states,
largest text and an offline failed-save fixture returning to centered, enabled
controls. The failure fixture makes no network request.

An actual simulator recording excerpt is retained locally, outside Git, at
`docs/visual-qa/opportunity-swipe-motion.mp4`; the held-threshold frame at
`opportunity-swipe-motion-held.png` was visually checked. Logs:
`/tmp/sideseat-swipe-motion-r1.log`, `/tmp/sideseat-swipe-motion-r3.log`.
Document formatting and diff checks pass. This verifies the local implementation,
not physical haptics. It is committed for Build 38; after internal publication,
check pickup/threshold/release haptics on both updated test phones.

### Comfort and character refresh — 2026-09-09

The product direction combines quiet functional surfaces with warm, recognizable
activity illustrations. The shared product button uses green-tinted charcoal in
Light and soft chalk in Dark, with a paired readable foreground and loading tint.
Auth/Tutorial brand gradients, Rose selection, verified blue and semantic status
colors are unchanged. The empty Intent action is a compact capsule (up to 280pt),
while editor and Plan commit actions remain full-width and easy to reach.
Button press scaling respects Reduce Motion.

Six original offline SVG illustrations replace generic filled category glyphs:
coffee cup, open book, ball, folded map, noodle bowl and tickets. They share rounded
linework and a soft organic backdrop, with cocoa, slate blue, sage, eucalyptus,
oat and lavender palettes. These are illustration colors, never answer/status
indicators. Native asset catalogs preserve their vector representation. Labels
remain localized text; illustrations are hidden from accessibility to avoid
duplicate announcements.

The same artwork appears in the category picker, saved Intent header, time-step
summary and Opportunity header. Category options use illustrated tiles with an
explicit outline/checkmark and selected accessibility trait. Large text changes
the picker to one column. Matching, private YES/NO, chat and Plan confirmation
remain unchanged. This UI is committed for Build 38; local QA writes no live data.

Largest-text verification exposed two existing editor constraints: the presented
sheet did not inherit the explicit Dynamic Type setting, and fixed step/help copy
left too little room to scroll the categories. The sheet now inherits the parent's
size; at accessibility sizes, step/help text scrolls with the form and the dock uses
localized Next/Save labels. No user-selected font size is capped or shrunk.

Verification on iPhone 17 Pro / iOS 26.5 Simulator passed 26 contrast/asset tests
and 5 UI tests: six category cards and consent states, actual bidirectional swipes,
Together at accessibility5, illustrated category switching and retained editor
input, Plan response/editor and private Outcome controls in Light/Dark. Result:
`/tmp/SideSeatComfortUI-20260909-r1.xcresult`; log:
`/tmp/sideseat-comfort-ui-r1.log`. Native screenshots are in `docs/visual-qa/`,
including `flow-activity-picker-light.png`, `flow-activity-picker-dark.png`,
`opportunity-coffee-needs_decision-light.png` and `flow-intent-times-light.png`.
This verifies local UI fixtures, not production matching or a TestFlight release.

The final follow-up passed both German accessibility5 category selection/scrolling
and the Chinese Light/Dark two-step editor regression (2 UI tests, zero failures):
`/tmp/SideSeatComfortUILargeType-20260909-r4.xcresult`, log
`/tmp/sideseat-comfort-ui-large-type-r4.log`. The large-text screenshot
`flow-activity-picker-de-large-type.png` was visually checked. Across the two final
runs, 26 unit checks and 6 distinct UI tests passed. Document formatting,
localization validation and diff checks pass. The changes are committed for
Build 38; the release record tracks internal availability and the next phone check.

### Editing sheets

Intent and Plan editors use `ssFlowSheet`: native large sheet presentation,
22pt corner radius, drag indicator, adaptive grouped canvas and system motion.
The pinned `SSFlowActionDock` keeps the commit action and its consequence visible
above the safe area/keyboard. Disable dismissal and duplicate submission only
while saving. Back navigation retains editor input; save errors remain inside
the editor. Native sheet motion respects Reduce Motion; the Intent step change
also disables its animation when Reduce Motion is enabled.

### System avatars

Use the twenty original [Little Companions](./SYSTEM_AVATARS.md) portraits for
system avatar IDs `p01`–`p20`. These identity illustrations have their own quiet
pastel palette; surrounding controls still use the shared semantic tokens.
All native surfaces resolve presets locally through the same avatar component,
while custom photos retain their original URLs. The chooser uses `ssFlowSheet`,
a live preview, an adaptive labeled grid and explicit Save/Cancel. Selection
uses a ring, checkmark and accessibility selected state, not color alone.

## 5. Interaction rules

- pressed feedback: subtle opacity/scale for about 0.15s;
- disabled: neutral fill and no fake affordance;
- loading: in-control progress and duplicate-action prevention;
- focus: native focus behavior and visible field-level error;
- selected: accent wash/fill plus shape or text, never color alone;
- keyboard: tapping outside an editor dismisses it and returns control to scrolling;
- countdown: update in place; indicators must not fly in from screen edges;
- confirmation: secondary actions do not appear at the top screen edge.

## 6. Calendar rules

- month/week/day navigation remains visually stable;
- grid/header divider and grid lines must remain visible in Light and Dark;
- current-time and dotted reference lines use accessible contrast;
- new-event floating button sits inside the calendar content's bottom-right safe
  region without covering events or width controls;
- event long press supports copy, duplicate, delete and direct duration resize;
  ordinary edit happens from event detail;
- calendar-category color appears beside category identity;
- event editor uses one component for manual and smart-add editing.

## 7. Visual acceptance

Before freezing a release, capture Light/Dark for Together states, Calendar,
Messages, Me, Auth and the four-tab shell. Record build, device, iOS and fixture.
The existing pre-Together screenshot set is historical only and lives under
`docs/archive/visual-qa-pre-together/`.

Every UI change must pass the relevant visual states, largest supported Dynamic
Type, VoiceOver labels/hints and touch target checks.

### Together / Plan verification — 2026-09-08

The Development build passed 6 state tests and 7 focused UI tests on iPhone 17
Pro Simulator, iOS 26.5. Coverage includes two-step Intent navigation with retained
input, Plans → conversation, prefilled alternate-time submission, acceptance →
Calendar, private Outcome save/change, and Together/Plan response controls at
accessibility5. Chinese Light/Dark screenshots cover the Together cards, both
Intent steps, Plans, the response card, Plan editor and Outcome choices. German
large-type controls and the new English/Chinese/German resources were checked.

The two `VisualQAScreenshotUITests` flow tests regenerate local `flow-*.png`
artifacts in `docs/visual-qa/`; screenshots use local UI fixtures, not pilot data.
This is simulator evidence for the native changes, not physical acceptance or
TestFlight build 32 certification. The next release still needs its own signed
archive, TestFlight distribution and focused physical smoke.
