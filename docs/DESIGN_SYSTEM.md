# SideSeat Design System

**Status:** Current native design contract

**Last updated:** 2026-09-08

**Governing flow:** [User Flow](./USER_FLOW.md)

**Scope:** SwiftUI tokens, reusable components, visual hierarchy and interaction presentation

## 1. Principles

- Use native SwiftUI structure and behavior first.
- One primary task per screen.
- Use one interactive Rose accent (`#FB4185`) consistently.
- Brand gradients belong to Auth/Tutorial and rare hero moments, not product lists.
- Together, Calendar, Messages and Me share one component/token system.
- Dynamic Type, VoiceOver, Light/Dark and safe-area behavior are requirements.
- Calendar grids and message bubbles may use specialized layout but still consume
  semantic tokens.

## 2. Product surfaces

| Surface | Primary task | Visual rule |
| --- | --- | --- |
| Together | Intent, countdown, Opportunity | Action-first cards; status through text/structure, not color alone |
| Calendar | Understand and edit time | Neutral grid; Rose only for selection/current-time hierarchy and primary CTA |
| Messages | Coordinate and manage Plans | Reading comfort over brand saturation; source and Plan cards have distinct surfaces |
| Me | Identity and settings | Native grouped hierarchy; light brand wash only where useful |

Root pages may use one compact brand/navigation signature. Secondary pages use
standard iOS titles and back behavior.

## 3. Semantic tokens

Tokens live in `SideSeatTheme.swift`; calendar-specific metrics live in
`CalendarChrome.swift`.

| Token family | Use |
| --- | --- |
| `accent` / `rose` | selected controls, primary product CTA, unread state |
| `verifiedSeal` | verified trust state; never reuse interaction Rose |
| `bg`, `bgGrouped`, `surface` | system-adaptive canvases and cards |
| `textPrimary`, `textSecondary` | system-adaptive content hierarchy |
| `danger`, `success` | destructive/error and success semantics |
| `calendarNow` | current date/time indication |
| `Chat.*` | canvas, own/peer bubble, structured card and quote separation |
| spacing/radius/text tokens | consistent layout and Dynamic Type |

Do not add Feature-local hex values, duplicated radii or an additional visual
framework without an explicit design-system decision.

## 4. Components

Reusable controls live in `Core/Design/Components/`:

- `SSPrimaryButton`, `SSSecondaryButton`;
- `SSTextField`, `SSSecureField`, `SSFieldMessage`;
- `SSCard`, `SSSectionHeader`, `SSGroupedSection`;
- `SSFlowCard`, `SSFlowCardHeader`, `SSFlowNotice`, `SSFlowChoice` and
  `SSFlowActionDock` for the Together → Plan journey;
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

An actionable Opportunity or Plan has one full-width Rose primary action.
Withdraw, decline and alternate-time actions remain secondary, with targets at
least 44pt high. At accessibility sizes, alternatives stack without shrinking
their labels. Outcome choices have equal weight and show only the viewer's answer.

### Editing sheets

Intent and Plan editors use `ssFlowSheet`: native large sheet presentation,
22pt corner radius, drag indicator, adaptive grouped canvas and system motion.
The pinned `SSFlowActionDock` keeps the commit action and its consequence visible
above the safe area/keyboard. Disable dismissal and duplicate submission only
while saving. Back navigation retains editor input; save errors remain inside
the editor. Native sheet motion respects Reduce Motion; the Intent step change
also disables its animation when Reduce Motion is enabled.

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
