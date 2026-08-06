# Native Visual QA — Design Freeze (§8)

**Date:** 2026-07-22  
**Device:** iPhone 17 Pro Simulator (iOS 26.5) — no physical iPhone was connected  
**Build:** SideSeat-Development  
**Capture:** `ios-native/scripts/capture-visual-qa.sh` → `VisualQAScreenshotUITests`

Screenshots live in this folder (`*-light.png` / `*-dark.png`).

## §8 checklist

| Criterion | Light | Dark | Notes |
|-----------|-------|------|-------|
| Auth recognizable (BrandMark + Rose) | Pass | Pass | softWash brand atmosphere; accentGradient title; rose links |
| Product surfaces look native (not poster) | Pass | Pass | TabView / List / Calendar chrome; no full-bleed brand gradient on tabs |
| Single interactive Rose | Pass | Pass | Selected tab, unread badges, verified seal, toolbar icons |
| calendarNow ≠ selection | Pass | Pass | Now line + today badge stay red; selected day uses Rose fill |
| Me hero light wash only | Pass | Pass | Hub rows use HubTint; not full-screen brand wash |
| Deep mode readable | — | Pass | Auth wash darkens; product uses system black/grouped |

## Screen matrix

| Screen | Light | Dark | Verdict |
|--------|-------|------|---------|
| Auth | `auth-light.png` | `auth-dark.png` | Pass — brand surface OK |
| Home (Week) | `home-light.png` | `home-dark.png` | Pass — accent selection + now red |
| Discover | `discover-light.png` | `discover-dark.png` | Pass — list + rose accents |
| Discover plan | — | `discover-plan-dark.png` | Pass — decision details, verified host, persistent actions |
| Plan share | — | `discover-plan-share-dark.png` | Pass — 3:4 Xiaohongshu card + QR deep link |
| SideSeat share | — | `sideseat-app-share-dark.png` | Pass — localized invite poster + QR landing link |
| Create sheet | `create-light.png` | `create-dark.png` | Pass — system confirmationDialog |
| Chats | `chats-light.png` | `chats-dark.png` | Pass — unread Rose pills |
| Me | `me-light.png` | `me-dark.png` | Pass — hub rows + hero wash |

## Follow-ups (non-blocking)

1. **Physical device** — still outstanding for §8 quality sign-off. Plug in an iPhone, then:
   `ios-native/scripts/capture-visual-qa.sh --device`
   Appearance is forced via `--ui-testing-appearance=` (no `simctl` on hardware). Overwrite this folder’s PNGs and update the Device line above.
2. **Home event tile wrap** — “Weekly planning” can break mid-word in narrow week columns (calendar density; not a token issue).
3. **Me bottom inset** — last hub row can sit under the floating tab bar in dark; consider extra list bottom padding.
4. **Today control color** — keep `CalendarChrome.nowRed` (not Rose) so “今天” stays tied to now, not selection.

## Re-run

```sh
# Simulator (default)
ios-native/scripts/capture-visual-qa.sh

# Physical iPhone (真机 §8)
ios-native/scripts/capture-visual-qa.sh --device
# or: DEVICE_UDID=<udid> ios-native/scripts/capture-visual-qa.sh --device
```
