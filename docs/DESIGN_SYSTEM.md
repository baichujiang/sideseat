# SideSeat Design System

**Status:** Current native design contract

**Last updated:** 2026-09-02

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
- `SSListRow`, `SSEmptyState`;
- `SSScreen`, `SSBrandAtmosphere`;
- `SSActionPrompt` for product-owned confirmation;
- SideSeat share components where a stable shared pattern exists.

System permissions and system-owned input remain native. Product confirmations,
dangerous operations and recurrence-scope decisions use the centered SideSeat
prompt. Long-press menus share an action model but choose presentation by object:
message and event actions remain anchored near their source; region actions may
use a panel. Tapping outside dismisses any custom menu.

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
