# SideSeat Design System

**Status:** Current native design contract

**Last updated:** 2026-10-25

**Governing flow:** [User Flow](./USER_FLOW.md)

**Scope:** SwiftUI tokens, reusable components, visual hierarchy and interaction presentation

## 1. Principles

- Use native SwiftUI structure and behavior first.
- One primary task per screen.
- Owner refinement 2026-10-19: provide one default complete flow. Start with the
  task's inputs and result; expose exceptions as secondary contextual actions.
  Avoid repeated two-choice gates or an extra page for fields that fit in the
  same form. Keep meaningful sends, invitee selection and attendance consent
  explicit; direct edits and navigation should not gain artificial confirmations.
- Routine buttons, filters, menus, tabs and private-save controls use neutral text
  and neutral selected surfaces. Selection also uses a checkmark, icon or weight.
- Product primary actions use adaptive ink/chalk. Together contact actions use a
  soft neutral capsule; an existing conversation keeps its separate success role.
  Deep Rose remains an explicitly scoped brand emphasis, not the default greeting.
  Avoid pale pink fills with red text.
  Original category artwork adds personality without coloring every control.
- Brand gradients belong to Auth/Tutorial and rare hero moments, not product lists.
- Together, Plans, Calendar, Messages and Me share one component/token system.
- Dynamic Type, VoiceOver, Light/Dark and safe-area behavior are requirements.
- Calendar grids and message bubbles may use specialized layout but still consume
  semantic tokens.

## 2. Product surfaces

| Surface  | Primary task                   | Visual rule                                                                         |
| -------- | ------------------------------ | ----------------------------------------------------------------------------------- |
| Together | Intent, countdown, Opportunity | Action-first cards; status through text/structure, not color alone                  |
| Plans | Understand and complete the next planning step | Role-specific next actions, a short shared lifecycle, visible link sharing and persistent contextual actions |
| Calendar | Understand and edit time       | Neutral grid and date selections; solid blue for today, separate current-time marker       |
| Messages | Coordinate and manage Plans    | Reading comfort over brand saturation; source and Plan cards have distinct surfaces |
| Me       | Identity and settings          | White identity and management groups; preserve user-selected personalization         |

Root pages may use one compact brand/navigation signature. Secondary pages use
standard iOS titles and back behavior.

### Object menus, confirmations and confirmed dates — 2026-10-25

An object's short action menu stays beside the pressed object, choosing above or
below from the available space. Inbox uses the existing anchored menu at ordinary
text sizes; accessibility sizes retain the scrollable large panel so long actions
remain reachable. Outside tap and accessibility Escape dismiss without acting.
Calendar's explicit time-region panels retain their existing placement.

Global product confirmations use the existing centered `ssActionPrompt`, with
clear cancel/confirm roles and scrollable content at large text sizes. Native
input and system-permission dialogs remain native. Read-only Calendar detail
opens at its large detent for accessibility text.
Optional action icons must leave enough room for whole words at large text;
omit a redundant decoration when it forces an unnatural word break.

Plan confirmation shows the invitation roster directly below the reply progress.
Reuse the existing participant rows, complete reply labels and quiet dividers;
do not add an expand or separate people-list step here. The collecting stage
keeps its compact avatar summary and existing participant sheet. Existing guest
recovery actions stay with their corresponding records and permissions.

Opening a shared plan keeps one detail surface. While its first request is in
flight, show the tapped card's existing title and date/time summary above a static
timetable placeholder, instead of a separate full-page spinner. Navigation-only
summaries are scoped to that plan token and cleared on return. Editing, sharing
and invitation actions appear only after the authoritative detail has loaded.

Confirmed Plan cards use a typographic calendar date: small localized month and
weekday above a large day, with the existing complete start/end time below.
Cross-day endpoints, year and timezone remain available, and accessibility keeps
the original complete description. Use the existing date formatter and whole-card
route; candidate-only and waiting cards retain their own date representations.

### Shared native root foundation — 2026-10-25

This is the implemented source contract for the five native root pages. The
[local design draft](./designs/2026-10-25-root-foundation-v1/README.md) records the
approved visual direction; its browser dimensions are not native layout metrics.
This section does not establish a test result, installation or release status.

The shared light palette is warm-white canvas `#F7F7F3`, white content surface
`#FFFFFF`, primary ink `#1C2421`, secondary text `#747B75`, neutral selection fill
`#EDEFE8` and separator `#E7EAE3`. Product primary fill remains `#26322D` with its
paired foreground. Each semantic token has its native dark counterpart. Existing
strong secondary text, system control fills, category bands and semantic state
colors retain their separate roles; this palette does not recolor every item.

Use `SideSeatTheme.screenHorizontal` for 20pt root content margins. The common
content-card radius is 24pt, management-group radius 20pt and control radius 14pt.
`SSFlowCard`, `SSGroupedSection` and `SSManagementSection` use the shared surface
without a default decorative outer stroke or colored card shadow. Hierarchy
comes from spacing, typography, quiet row dividers and meaningful content.
Activity category bands and genuine identity decoration remain scoped to their
existing content roles.

All five root titles use `ssRootNavigationTitle`: a compact 22pt app mark, 7pt
gap and semibold `title3` in the native inline navigation principal area. This
compact title label caps at `xxxLarge` and stays on one line. Body content,
form fields and rows continue to follow the system text setting; sheets preserve
their existing Dynamic Type propagation. Native navigation controls retain their
own hit areas and system placement rather than inheriting browser header slots.

Plans, Together and Calendar section/view navigation share `SSRootTabs`:
equal-width transparent targets, primary/secondary text with selected weight,
and a 24 × 3pt capsule underline for the selected item. Each target is at least
56pt high; its compact label caps at `xxxLarge` and may wrap. Accessibility
preserves the selected trait and existing identifiers. There is no filled track
or outer action outline. Together
retains its section-menu fallback at accessibility sizes or when labels do not
fit, plus the existing paging and scroll-position behavior.

The bottom five destinations remain the native `TabView` managed by iOS. Bar
height, item placement, glass and safe areas are system-owned; do not treat the
HTML draft's independent 112px footer, 78px pill or screenshot pixels as an App
geometry guarantee. The iOS 26 floating bar can overlay scrolling content.
`rootScrollBottomClearance = 104` supplies explicit scroll clearance on root
lists that need it, including Together, Messages and Me. Plans keeps its separate
creation dock through `safeAreaInset`; Calendar retains its existing grid/viewport
ownership. These native mechanisms must keep final items and controls reachable.

Preserve each page's information structure: Together keeps its three sections,
Plans its two sections and contextual creation entry, Calendar its existing view
and tool controls, Messages its search/shortcuts/conversations, and Me its
identity and management groups. The foundation does not add matching controls to
every header, add new routes, or alter invitation and Calendar rules.

Together recommendation empty states use one centered, unframed group (maximum
340pt): quiet people icon, short title, status-aware description and vertically
aligned actions. Find more is the product primary; View my intentions is a text
secondary, or the sole primary when Explore is unavailable. Successful exploration
with no results uses a static icon/title/description, without an extra retry.
Keep loading/errors distinct, preserve finding counts and allow natural text scroll.

### Planning clarity

For first use, explain the link → agreement → Calendar path. Creation opens directly
on activity/place/time in one form, then creates the timetable. Optional activity
ideas or exact-time invitations expand from secondary text actions in context.
With active plans, collapse that introduction
and prioritize what needs the viewer's input. “Waiting for others” must distinguish
saved availability from confirmed participation. Status colors support explicit
labels and the next action; they do not replace those explanations.

Each detail has a contextual action area. Plans reserve the solid ProductAction
control for creating, sending invitations or explicitly confirming participation.
Choosing time and reviewing a roster use soft filled controls; sharing uses a quiet
unframed share icon, with a separately labelled Copy link utility. Viewing Calendar
or opening another destination uses a light row with a destination icon and arrow.
Declining uses red text and an x-circle. Icons, explicit labels and fill/arrow
structure distinguish effects without relying on color alone. Inline availability
edits retain explicit submission and local-draft feedback. Link sharing
cannot depend on finding an overflow menu. Destructive cancellation stays in that
menu. Keep the current paired ProductAction colors, availability colors and design
tokens. Pass Dynamic Type into presented sheets; let the availability page scroll
in accessibility sizes instead of compressing the timetable out of view.

### Button boundaries — 2026-10-24

Use boundaries for fields, content containers and meaningful selection states,
not as the default signal that something is tappable. `SSActionButtonStyle` keeps
toolbar/icon utilities transparent, regular/compact secondary actions softly filled,
and prominent commits solid. None adds a decorative stroke. Text links stay plain;
filled primary actions do not acquire a second outline. The App root uses
`softFill: false` so inherited utilities stay transparent while retaining the
shared target, disabled, press and destructive-role behavior. Explicit secondary
components own their soft fills. Existing 44pt hit targets,
labels, disabled feedback and press feedback remain. A selection border/checkmark,
timetable cell grid, avatar or badge separation stroke still has a specific purpose.
Message shortcuts share one white group with a quiet internal divider; their
individual icon-and-label targets do not acquire outer button boxes.
Navigation rows keep their destination arrow, while decline actions use red text.
Remove redundant call-site outlines instead of wrapping already styled labels again.
Chat context bars and native information rows use `softFill: false` because their
parent already owns the surface. Unread/latest jump controls keep one floating
material/fill without a second action background. Chat title and More toolbar
items hide the iOS shared background; More uses a plain ellipsis and both retain
44pt targets. Composer Plan is an unframed icon, while semantic Send/Cancel-reply
glyphs and editable-input boundaries remain.


### Public invitation visual continuity — 2026-10-04

Public intention links mirror the native semantic palette, system-first typography,
Together card geometry, 14px controls and Chat bubble colors. The web stylesheet
maps those tokens locally and follows the visitor's system light/dark preference.
Routine actions use ProductAction ink/chalk; the owner-requested “Open SideSeat”
action uses adaptive Rose with black text. Primary buttons are at least 50px high,
with 44px utility targets. The page preserves its focused invitation → guest contact
→ registration → App continuation path and compact explanatory copy.

## 3. Semantic tokens

Tokens live in `SideSeatTheme.swift`; calendar-specific metrics live in
`CalendarChrome.swift`.

| Token family                   | Use                                                           |
| ------------------------------ | ------------------------------------------------------------- |
| `accent` / `rose`              | brand identity and rare compact emphasis; not routine controls             |
| `utilityAction` / `ControlSelection.*` | neutral control text, selected fill and border                |
| `BrandAction.*`                | rare deep-Rose primary action with white text                  |
| `ProductAction.*`              | paired ink/chalk product button fill and foreground           |
| `activityInset`                | warm neutral activity context                                |
| `Together.headerFill`          | retained activity-category surface for explicit `SSActivityHeaderBand` consumers, including Explore; not the root cards' general header fill |
| `verifiedSeal`                 | verified trust state; never reuse interaction Rose            |
| `bg`, `bgGrouped`, `surface`   | shared adaptive canvas `#F7F7F3` and white content surface in Light |
| `textPrimary`, `textSecondary` | shared adaptive ink `#1C2421` and secondary `#747B75` in Light |
| `fillSubtle` / `separator` | neutral `#EDEFE8` control/selection well and `#E7EAE3` separator in Light |
| `fillTertiary` / `textSecondaryStrong` | existing native system control well and stronger compact text; separate from the new secondary palette |
| `danger`, `success`            | destructive/error and success semantics                       |
| `calendarToday` / `onCalendarToday` | solid current-date marker and high-contrast number in Month/Week/Day, without an outer outline |
| `calendarNow`                  | current-time line and time badge                              |
| `Chat.*`                       | canvas, own/peer bubble, structured card and quote separation |
| spacing/radius/text tokens     | consistent layout and Dynamic Type                            |

Do not add Feature-local hex values, duplicated radii or an additional visual
framework without an explicit design-system decision.

### Availability state colors — owner decision 2026-10-15

The time-poll editor uses `SideSeatTheme.Availability` to distinguish actual
selection states. Selected cells and fully selected day headers use teal with a
paired contrasting foreground. A partly selected day uses amber with a minus
symbol; unselected time remains an empty adaptive surface. A compact legend and
the existing checkmarks/accessibility values explain these states without relying
on color alone. Both appearances have explicit paired colors. This scoped owner
request updates availability editing; routine navigation and filters retain their
neutral tokens, and the existing group heatmap continues to encode attendance.

## 4. Components

Reusable controls live in `Core/Design/Components/`:

- `SSPrimaryButton`, `SSSecondaryButton`;
- `SSTextField`, `SSSecureField`, `SSFieldMessage`;
- `SSCard`, `SSSectionHeader`, `SSGroupedSection`;
- `SSRootTabs` / `SSRootTabItem` for root section and Calendar view navigation;
- `SSManagementSection` / `SSManagementRow` for identity, campus and settings groups;
- `SSFlowCard`, `SSFlowCardHeader`, `SSFlowNotice`, `SSFlowChoice` and
  `SSFlowActionDock` for the Together → Plan journey;
- `SSActivityArtwork` and `SSActivityChoice` for the six illustrated activity categories;
- `SSListRow`, `SSEmptyState`;
- `SSScreen`, `SSBrandAtmosphere`;
- `SSActionPrompt` for product-owned confirmation;
- SideSeat share components where a stable shared pattern exists.

### Together intention actions — 2026-10-25

`SSIntentionActionRow` places compact actions at the trailing edge at ordinary
text sizes. Bookmark is a 44pt icon target with its existing accessibility label;
the selected heart retains the neutral selection fill. Contact uses
`SSIntentionContactButton` with utility ink on a soft `fillSubtle` capsule instead
of an equal-width filled primary action. Only the existing `opensConversation`
state uses the chat icon, success text and a light success fill. The state and
contact permissions are unchanged. At accessibility sizes, the row stacks and
both actions keep their full wrapping text and at least 44pt targets.

System permissions and system-owned input remain native. Product confirmations,
dangerous operations and recurrence-scope decisions use the centered SideSeat
prompt. Long-press menus share an action model but choose presentation by object:
message and event actions remain anchored near their source; region actions may
use a panel. Tapping outside dismisses any custom menu.

### Together warm paper refresh — 2026-09-12

Historical design progression: the dated navigation tracks, default hairline,
colored card shadow and deep-Rose first-contact emphasis described below have
been superseded by the 2026-10-25 shared native root foundation and compact
neutral contact actions. The dated behavior and verification records are retained.

Following review of Preview 46, the owner selected warm cream, brand Rose accents
and restrained card layers. This replaces the forest/citron header and broad
category fills from that preview.

`SideSeatTheme.Together` owns the adaptive paper colors used by the cards. The
2026-09-20 navigation refinement keeps the shared inline brand title and system
navigation chrome, with no Together-specific title-bar background or tint. The
page and section-selector surround use the grouped system background. A neutral
native Add action is shared by all three tabs; it shows a text label when
space permits and an icon at accessibility sizes. The pinned section selector
uses equal-width, minimum-44pt buttons on a warm inset surface. The 2026-10-02
owner decision replaces the dusty-Rose selection with a neutral gray fill and
semibold primary text in both appearances. Control text keeps at least 4.5:1
contrast. The 2026-10-04 refinement keeps the current text size and lets the three
buttons and selected surface fill equal shares of the available width. At
accessibility sizes, or when the labels do not fit, one full-width section chooser
opens a list with wrapping labels and a checkmark for the current section. A divider separates the
fixed navigation from scrolling content; page swipes retain each scroll position.

Together cards use a 24pt radius, 20pt inset, neutral system-adaptive bodies, a warm
hairline and a subtle shadow. Category artwork stays compact. Activity headings
are semibold; timing is an unboxed detail row. A 64pt warm inset decision rail has
a 52pt ivory handle, with the privacy explanation underneath. Owner and Explore
secondary actions share neutral controls; first-contact emphasis uses deep
Rose/white. Dark Mode uses warm charcoal and plum. Category color never indicates match quality, consent or a Plan.
Opportunity reading order remains peer → activity → timing → private decision.

The Preview 49 refinement places the two decision labels above the rail so the
handle never covers their meaning. Labels wrap at accessibility sizes, where the
rail grows to 72pt. Minus and heart endpoints accompany a centered directional
grip. During dragging, a restrained wash grows from the origin with actual travel;
the free side shows “Keep sliding”, then “Release to confirm” at the existing
68% threshold. Threshold haptics and the heart/minus handle state accompany the
text. Release pins the handle and shows a spinner while saving; a retained card
returns to center after the async action. Short or cancelled drags spring back.
Reduce Motion preserves direct tracking and state feedback without lift/spring.
VoiceOver supports adjustable selection and named interest actions. The native
horizontal recognizer continues to leave vertical scrolling to the page, while
the entire control excludes horizontal page changes.

### Together and Plan card template

Shared availability details use a clear status → title → dates/place → labelled
time-zone hierarchy. Keep name tools compact and separate from selection guidance.
My availability has a persistent bottom save status and Done selecting action on
web and native. Show a spinner while saving, a teal icon and explicit saved label
after acknowledgement, and retained-choice/Retry feedback on failure. Pair status
with text and selected days/hours. Done selecting opens results with a saved notice;
it remains distinct from accepting a later invitation. Use neutral primary actions
and adaptive white/ink surfaces, preserving the established teal/amber grid colors.

Use one anatomy across owner Intent, Opportunity, mutual chat source, Plan list
and chat Plan cards: context/status → concrete title → time/place/person → action.
The shared surface uses a 24pt radius and neutral adaptive fill without a default
outer hairline or colored shadow. `SSFlowCard` keeps its 16pt default content
inset; Together's card anatomy supplies its existing 20pt inset. Current root
headers use the neutral card material with topic text, icons or artwork.
Colored category bands remain only at explicit `SSActivityHeaderBand` call sites,
including the retained Explore presentation.
Root page margins are independently 20pt.
Status always includes text; it never relies on color alone.
Use inset notices for privacy and the effect of accepting or rescheduling.

Plan detail commits use their contextual ink/chalk primary action. Together
contact and bookmark actions follow the compact row above. A Plans overview card
is itself the destination target and has no duplicate inner Open timetable
button; a quiet chevron indicates navigation.
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

Historical header progression: the full-width category bands described in the
dated refinement below are not the current root-card header contract. The shared
root foundation uses the neutral card material; the colored band component and
its palette remain available to existing explicit consumers such as Explore.

2026-09-21 card-header refinement: recommendation cards emphasize category
color in the full-width peer/avatar-to-activity-artwork row. Coffee uses latte,
Study mist blue, Sports olive, Explore mint, Food peach, and Events lavender,
with corresponding deeper surfaces in Dark mode. `Together.headerFill` owns
these colors. The header follows the card's top corners; activity details,
interest controls, and page navigation retain their existing styling. Category
color never represents consent or interest status.
Category picker options use the neutral `surface` token with explicit selection.
Recommendations, Intentions and Explore share `SSActivityHeaderBand`: a full-width colored top row
with rounded top corners, followed by a neutral `surface` body. The same latte,
mist-blue, olive, mint, peach or lavender hue identifies the activity in all
three lists, with corresponding Dark mode headers. Selection still uses the
explicit outline/checkmark. The shared top navigation and controls are unchanged.
Card-body rows use 8pt gaps and 12pt vertical insets, with no additional padding
around the availability row. Header styling, 20pt horizontal insets, text sizes,
and the existing 44pt-or-larger action targets stay unchanged.

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

2026-09-20 refinement: after a successful private YES, the control retains a
Rose selected rail with the heart at the right and “Interest shown”. A separate
footer pairs “Waiting for a response” with a directly visible “Withdraw interest”
button (44pt minimum target); accessibility text sizes stack the footer. Explore
uses the same saved-state component. There is no reverse-drag action because
withdrawal closes the opportunity, while mutual consent replaces the control
with “Chat about the details”. Failed submissions keep the undecided control
retryable. Page title/header styling is unchanged.

2026-09-21 interest-knob refinement: the 52pt circle uses a muted cream-gold fill,
warm gold-brown ink and a soft border, with an outlined star while undecided and
a filled star when interest is armed or saved. Small direction chevrons remain
in the idle knob; skipping still uses a minus. The shared saved-state control
uses the same star and colors in Recommendations and Explore. Only the knob
palette and matching interest symbol change; Rose navigation, rail styling,
tap targets, gesture thresholds and consent behavior stay unchanged.

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

### Compact intention inputs — 2026-09-22

The activity picker uses compact horizontal buttons with a 56pt minimum height,
small existing artwork, a neutral surface, an outline and an inline checkmark.
This keeps one-tap selection while leaving more space for the concrete activity
above the keyboard. At accessibility sizes, the picker remains a single column,
text scales fully and decorative artwork is omitted. Card-header artwork and
category colors remain as described above.

Text-limit guidance replaces the intention action dock's general detail only
while input is too long. It stays above the keyboard, next to the disabled action.
When publication is available, the existing matching/paused disclosure returns.
The editor uses native focus and scroll centering when focus, the input reason or
the available Form height changes, keeping the active input above the action
dock. Step navigation ends focus locally and preserves the draft.

### Intention creation entry — 2026-10-02

Place the compact + Add action beside the "What I want to do" heading in the
My intentions content area, not in the Together navigation bar. Show it only
when the current intention list has content. With no current intentions, use
only the central Add your first intention action. The heading action scrolls
with the list and appears on neither Recommendations nor Saved intentions.
Keep a 44pt minimum target; accessibility text sizes use a plus icon with the
full localized Add an intention accessibility label.

### Expired intention action — 2026-10-02

Place Plan again inside the expired card, trailing the status badge in the same
row. Use a compact capsule with a minimum 44pt hit target; remove the separate
full-width action beneath the card. At accessibility sizes, stack the badge and
action inside the card and wrap the label. Terminal cards are noninteractive
containers with an enabled repeat action; active-card edit/delete behavior is
unchanged.

### Intention time selection — 2026-10-02

Keep a stable Time section in the intention form. Undecided timing uses a compact
"Time undecided · Tap to set" row. Once selected, show every exact window in a
chronologically ordered text list, with date/weekday and time range on each row.
The section heading shows the number of options when there is more than one and
an explicit Modify action opening the dedicated sheet. Stack date and time when
space is limited or accessibility text sizes are enabled.

Published own-intention cards initially show two windows. An inline disclosure
expands the remaining windows and can collapse them again without opening the
editor. Keep disclosure and edit controls separate in the accessibility tree.

The sheet owns temporary start/end and additional-slot drafts. Done validates and
commits them; Cancel and swipe dismissal leave the form unchanged. "Not sure yet"
explicitly clears the committed selection and dismisses the sheet; hidden exact
drafts are never submitted with undecided timing. Keep the last committed exact
slot available when reopening within the editor. Existing date ranges remain
intact until explicitly replaced or cleared. Plan rebooking still requires an
exact time. Repeating an intention prefills next week's original weekday/local
time and duration, displayed immediately in the summary.

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

### Profile editor — 2026-09-12

Edit Profile keeps labels on the left and values on the right at ordinary text
sizes. Each inset card has a compact icon/header and quiet row separators;
inputs no longer sit inside individual gray wells. A native menu/picker keeps
selection checkmarks while exposing a consistent trailing chevron. Only the
focused text row receives a neutral fill, without a leading marker. Focus
animation respects Reduce Motion. As of 2026-09-22, the editor uses a native
inline title with Cancel and Save, matching Privacy. The avatar/account header
and bottom Save area are removed to leave more room for fields and the keyboard.
Semantic colors and 44pt minimum custom input/control targets remain in use.

Editable text stays leading-aligned within the right-hand input column before
and during editing. Tapping the label or row whitespace focuses that field.
One sheet-level focus state orders the text inputs; single-line Return advances
to the next input and the last field uses Done. The multiline tagline retains
Return for line breaks. A keyboard toolbar provides previous/next input and
Done; focus transitions animate only the row wash, not text or layout.

Field order is personal identity first: Basics contains nickname → gender →
tagline. Study contains school → student status → degree → major → semester
(or graduation year for alumni). Contact handles follow in their existing order.

Accessibility text sizes stack field labels and controls. Decorative header
icons stay within their badges while text scales normally. School-change
confirmation and unsaved-edit protection remain in place. Submission ends input
focus and disables fields and cancellation until the request completes, keeping
the displayed draft aligned with what is being saved. An invalid submitted field
shows one concise reason below the navigation bar; when that reason changes,
native scrolling keeps the current input in view. Validation and the tagline
counter use the same trimmed values as the partial save request. Verification is
local/simulator only; see [profile editor visual QA](visual-qa/profile-editor-polish-2026-09-12.md).

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
- selected: neutral fill plus shape, checkmark or text weight, never color alone;
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

Compact calendar metadata has local text bounds: the fixed seven-column month
grid caps weekday/day labels at `xLarge`, preserving full dates in accessibility.
Day/Week date chips and the hour rail use the same `xLarge` metadata bound. The
Week bottom controls, offscreen-event overlays and zoom hint, plus the Day
offscreen-event overlay, cap their fixed chrome at `xxxLarge`. These limits do
not cap the page, agenda or event-editor body text. Content below the grid remains
scrollable and uses its existing system-size typography and navigation.

### Browser calendar workspace — 2026-09-21

The requested Teams-inspired browser layout uses a compact app rail, a collapsible
month/category sidebar and a wide calendar grid. Desktop actions live in the top
command bar, with date and view controls directly above the grid. Month cells
show event summaries. Phone keeps bottom navigation and the visible-day slider;
sharing lives in the top bar so it does not overlap either control. Calendar
category color remains beside category identity; existing event editing is reused.

## 7. Visual acceptance

Before freezing a release, capture Light/Dark for Together states, Calendar,
Plans, Messages, Me, Auth and the five-tab shell. Record build, device, iOS and fixture.
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


### Browser workspaces — 2026-09-21

The rebuilt browser uses a five-destination rail (Together, Plans, Calendar,
Messages, Me), a fixed phone navigation bar and one main scrolling region. Shared
workspace headers, explicit empty/error states and simple bordered content groups
replace the old install-first shell. Calendar retains the Teams-inspired mini-month
sidebar, category filters, top actions and day/week/month workspace. Me contains
campus identity, verification, courses, languages, privacy and account settings.
No install bar, PWA update notice or cached tab snapshot is part of the new shell.

## Profile personalization — 2026-10-02

Owner-requested profile customization uses the existing semantic palette for
classic/rose/ocean/forest profile cards, optional SF Symbol decorations, and
classic/outline/spotlight surfaces. The profile card may have a light colored wash
or stroke; display names and body text keep semantic foregrounds. Product-wide
action colors remain unchanged. Light/dark/system is a device preference.
Under the shared root foundation, the default classic Me identity card uses the
same plain surface as management groups, without the default tinted stroke or
avatar shadow. Explicitly selected non-classic themes and outline/spotlight styles
continue to use `ProfileAppearanceSurface`; membership eligibility, optional
decoration, membership badge, avatar editing and profile editing remain intact.
See [Profile personalization](PROFILE_PERSONALIZATION.md) for entitlement and persistence.

### Messages greeting and notification shortcuts

New greetings and Notifications share one white rounded group with two equal
targets and a quiet internal divider above the conversation list. Each target
normally places its icon beside a title/count stack; `ViewThatFits` moves that
content to a vertical arrangement when needed without shrinking or capping the
title/count text. The decorative glyph stays 20pt inside a 38pt tile; it does
not grow with the system text setting or consume a larger share of the first page.
`Chat.greetingTile` and `Chat.greetingIcon` now resolve to the shared `fillSubtle`
and `textSecondaryStrong`; the former blue shortcut treatment is replaced by
the neutral foundation. Counts appear as text, including zero, rather than
overlapping corner badges. Greetings still counts the existing request list;
Notifications counts only unread notification items. Both buttons preserve their routes, identifiers,
complete accessibility count and independent hit targets. The Messages tab's
unread policy is unchanged.

Search remains a native `UISearchTextField` with clear/cancel behavior inside a
14pt rounded `fillSubtle` well and 20pt page margins, without the old floating
shadow or capsule stroke. Its input font remains native preferred Body with
content-size adjustment enabled. The well is at least 44pt high and measures
the actual native font line height plus 16pt, rather than scaling the full 44pt
control height. The decorative magnifier stays 18pt in a 20pt image view.
Recent conversations form an inset white group using rounded first/last rows
and quiet text-aligned separators. At accessibility text sizes, the name and
date move into separate leading-aligned rows; names have no line cap, and dates
may wrap without forcing the name into a narrow remaining column. Pin, unread, hide,
long-press and swipe behavior remain attached to the same conversation rows.
The notification list uses semantic text, a leading event icon, timestamp and unread dot, with a separate
read/unread accessibility value. Empty, loading and retry states remain distinct.


### Same-person follow-up and conversation arrangement — 2026-10-03

Ended Plan cards separate the historical detail hit area from the 44pt minimum
Plan again action. Before feedback, this action has low emphasis; after saving,
it uses the shared adaptive primary button. Feedback remains one editable line.
A did-not-happen answer uses Arrange another time. The editor inherits activity
and place but requires a visibly unselected new time; no extra timing switch is
added to this path. Keyboard Done dismisses text entry to expose the next fields.

The compact chat header shows status, actual Plan title and date range. Incoming
response needs outrank confirmed arrangements, which outrank outgoing invitations.
Historical focus is explicit and offers a separate 44pt current-arrangement action.
A source card says Met through this intention, never implies the old snapshot is
the newest Plan. The multi-Plan sheet groups a reschedule and its confirmed time.
Chinese, English and German strings use the existing semantic colors and Dynamic
Type. Verification evidence is tracked in the same-person remediation QA report.


## Plans home — owner-approved 2026-10-19

The initial photographic concept and its scoped `SideSeatTheme.PlanHome` palette
are recorded in [design and assets](./designs/2026-10-19-plans-home/README.md).
Current Plans root chrome and card materials use the shared native foundation
above. Cards prioritize a leading date/time group, activity name, explicit status
and real participant progress/avatars. Decorative title-derived activity covers
and the duplicate inner Open timetable action have been removed. The whole card
opens its existing destination; it never commits a response. Needs-you stays
vertical and waiting retains its existing horizontal/adaptive section behavior.
The creation action remains in a dedicated trailing dock above the native tab bar.
Brand Rose, invitation semantics and Calendar rules are unchanged.
