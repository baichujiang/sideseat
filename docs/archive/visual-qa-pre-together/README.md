# Native Visual QA — Historical Pre-Together Baseline

**Status:** Historical evidence; current visual sign-off pending

**Governing design system:** [Design System](../../DESIGN_SYSTEM.md)

**Scope:** Simulator screenshots captured before the Together navigation cutover

**Date:** 2026-08-10

**Device:** iPhone 17 Pro Simulator (iOS 26.5) — no physical iPhone was connected

**Build:** SideSeat-Development

**Capture:** `ios-native/scripts/capture-visual-qa.sh` → `VisualQAScreenshotUITests`

> This capture predates the current
> Together / Calendar / Messages / Me navigation and must not be used as the
> visual sign-off for the current TestFlight build.

Screenshots live in this folder (`*-light.png` / `*-dark.png`).

## Historical §8 checklist

| Criterion | Light | Dark | Notes |
|-----------|-------|------|-------|
| Auth recognizable (BrandMark + Rose) | Pass | Pass | softWash brand atmosphere; accentGradient title; rose links |
| Product surfaces look native (not poster) | Pass | Pass | TabView / List / Calendar chrome; no full-bleed brand gradient on tabs |
| Single interactive Rose | Pass | Pass | Selected tab, unread badges, verified seal, toolbar icons |
| Calendar Rose hierarchy | Pass | Pass | Neutral grid; selected day uses bright Rose fill; Today / Now use deeper Rose |
| Me hero light wash only | Pass | Pass | Hub rows use HubTint; not full-screen brand wash |
| Deep mode readable | — | Pass | Auth wash darkens; product uses system black/grouped |

## Historical screen matrix

| Screen | Light | Dark | Verdict |
|--------|-------|------|---------|
| Auth | `auth-light.png` | `auth-dark.png` | Pass — brand surface OK |
| Home (Week) | `home-light.png` | `home-dark.png` | Pass — neutral grid + bright/deep Rose hierarchy |
| Discover | `discover-light.png` | `discover-dark.png` | Pass — list + rose accents |
| Discover plan | `discover-plan-light.png` | `discover-plan-dark.png` | Pass — decision details, verified host, persistent actions |
| Plan share | `discover-plan-share-light.png` | `discover-plan-share-dark.png` | Pass — 3:4 Xiaohongshu card + QR deep link |
| SideSeat share | `sideseat-app-share-light.png` | `sideseat-app-share-dark.png` | Pass — localized invite poster + QR landing link |
| Create sheet | `create-light.png` | `create-dark.png` | Pass — system confirmationDialog |
| Chats | `chats-light.png` | `chats-dark.png` | Pass — unread Rose pills |
| Chat bubbles | `chat-bubbles-light.png` | `chat-bubbles-dark.png` | Pass — Berry Clay own bubble + stronger neutral peer surface, iPhone 13 mini |
| Chat context menu | `chat-context-menu-light.png` | `chat-context-menu-dark.png` | Pass — source-anchored compact actions, preferred above with edge fallback, iPhone 13 mini |
| Me | `me-light.png` | `me-dark.png` | Pass — hub rows + hero wash |
| Courses | `courses-light.png` | `courses-dark.png` | Pass — neutral school text + compact enrollment rows |

## Current baseline required

Before the next visual freeze, capture both Light and Dark appearances for:

- Together: no intent, multiple intents, matching countdown, expired session,
  Mutual Opportunity and unavailable/error states.
- Calendar: month/week/day, create/edit/detail and Apple Calendar import/export.
- Messages: inbox, conversation, Action Context, Plan proposal and context menu.
- Me: profile, course management, social preferences and settings.
- Auth and the four-tab shell at the largest supported Dynamic Type size.

Record the exact version/build, simulator or device model, iOS version and any
known fixture limitations. Do not change the historical verdicts below to imply
that an uncaptured current screen passed.

## Frozen archive boundary — 2026-10-15

The owner has frozen this historical material. Do not overwrite these PNGs,
execute former capture instructions from this archive or use this verdict as
current sign-off. New current evidence belongs in a new dated QA record outside
this directory. See [deployed state](../../DEPLOYED_STATE.md).
