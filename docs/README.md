# SideSeat Documentation

**Status:** Current index and authority map

**Last updated:** 2026-10-16

## Read this first

The active reading path is intentionally short:

```text
DEPLOYED_STATE (version, live flags, actual entries and archive boundaries)
→ PRODUCT
→ USER_FLOW
→ ROADMAP
→ relevant engineering or platform document
```

When documents conflict, authority is:

1. the user's latest explicit product decision;
2. [Product](./PRODUCT.md);
3. [User Flow](./USER_FLOW.md);
4. the relevant current contract or approved Safety rule;
5. [Roadmap](./ROADMAP.md) for implementation order;
6. OpenAPI, Prisma, source and tests as implementation evidence.

Code shows what exists; it does not silently change frozen product meaning.
Historical build evidence never certifies a newer build.

## Active documents

| Document | Purpose |
| --- | --- |
| [Deployed state](./DEPLOYED_STATE.md) | Current phone/backend versions, actual feature entries, live flags, retained compatibility and frozen archive boundaries |
| [Unified plans](./UNIFIED_PLANS.md) | Manual availability/direct-time creation, explicit invitations, individual confirmation and owned Calendar projections |
| [Product](./PRODUCT.md) | Positioning, product objects, navigation, invariants and non-goals |
| [User Flow](./USER_FLOW.md) | Current user-visible Intent → Opportunity → Plan flow and repeat boundary |
| [Calendar smart input](./CALENDAR_SMART_INPUT.md) | Event extraction, missing-information completion, duration defaults, uniform preview and acceptance examples; implemented policy, shared defaults and verification boundaries |
| [Roadmap](./ROADMAP.md) | Current implementation order and decision gates |
| [Together Contract](./TOGETHER_CONTRACT.md) | Weekly Intent, matching session and Mutual Opportunity engineering rules |
| [Native time polls](./TIME_POLLS.md) | Native creation, paint/erase, autosave, attendance results and own-data contract |
| [Safety](./SAFETY.md) | Pair-wide Block, Plan/Calendar cleanup, privacy and concurrency |
| [Native iOS](./IOS.md) | SwiftUI architecture, environments, build and Calendar sync |
| [Profile personalization](./PROFILE_PERSONALIZATION.md) | Profile completeness, themes, decorative icons, display styles and Plus entitlement |
| [Membership](./MEMBERSHIP.md) | Free/Plus identity, invitation redemption limits and operator instructions |
| [Design System](./DESIGN_SYSTEM.md) | Tokens, reusable UI, interaction and visual acceptance |
| [Release](./RELEASE.md) | Database/Vercel/TestFlight/App Store procedure and gates |
| [Privacy](./PRIVACY.md) | App Store data disclosure and provider mapping |
| [Layer 2 pilot Gate](./LAYER2_PILOT.md) | Non-QA sample, coverage thresholds and weekly decisions |
| [Layer 2 pilot tester guide](./LAYER2_PILOT_TESTER_GUIDE.md) | Consent, recruitment and truthful Outcome instructions |

## Compatibility and evidence

| Document | Purpose |
| --- | --- |
| [Legacy Action Compatibility](./LEGACY_ACTION_COMPATIBILITY.md) | Existing B-light/public Action, legacy Activity and web fallback only |
| [Storage lifecycle and cost audit](./qa/2026-09-30-storage-lifecycle-and-cost.md) | Sequential fixes, local verification, production follow-up and Vercel Pro cost scenarios |
| [Storage production release](./releases/2026-10-01-storage-production.md) | Published backend, database recovery point, 18 migrated chat images and authenticated production verification |
| [Deployment and retirement audit](./qa/2026-10-15-deployment-and-retirement.md) | Live deployment/source comparison, phone entry audit, compatibility classification and archive verification |
| [iPhone 14 Plus guest acceptance](./qa/2026-10-15-iphone14plus-guest-flow.md) | XCTest recovery, real Safari guest/nickname/confirmation/Calendar and physical gesture evidence |
| [Chinese shared plan pages](./releases/2026-10-15-share-chinese.md) | Live Chinese default, independent language preference, candidate/public guest flow and verified production source |
| [Unified web/native selection](./releases/2026-10-15-unified-share-ui.md) | Shared grid gestures, day selection, undo, native colors, read-only results and live guest confirmation |
| [Desktop shared timetable](./releases/2026-10-15-desktop-week-view.md) | Wider desktop week with a compact participant column; mobile layout and gestures preserved |
| [Preview 106 / half-hour timetable](./releases/2026-10-16-preview106-half-hour.md) | Web/native 30-minute cells, exact legacy availability, partial states, whole-cell heatmap and actual install/test status |
| [Preview 1.0.0 (105)](./releases/2026-10-15-preview105-availability-colors.md) | Installed teal/amber availability states and legend; Light/Dark phone acceptance and save/scroll regression pass |
| [Preview 1.0.0 (104)](./releases/2026-10-15-preview104-day-selection.md) | Installed weekday/day selection shortcut; physical full-day, Undo, persistence and scroll regressions pass |
| [Preview 1.0.0 (103)](./releases/2026-10-15-preview103-guest-plans.md) | Installed guest/nickname update; later iPhone 14 Plus Safari/native/Calendar, creation and gesture acceptance pass |
| [Preview 1.0.0 (102)](./releases/2026-10-15-preview102-availability-gestures.md) | Installed availability interaction update; Simulator gestures/autosave verified, final physical acceptance awaiting phone unlock |
| [Preview 1.0.0 (101)](./releases/2026-10-15-preview101-plan-creation.md) | Previous delivery: single-sheet plan creation, physical iPhone 14 Plus regression and save-flow checks |
| [Preview 1.0.0 (100)](./releases/2026-10-15-preview100-unified-plans.md) | Previous unified manual plans delivery: five-person collection, individual confirmation and Calendar sync |
| [Preview 1.0.0 (99)](./releases/2026-10-15-preview99-native-time-polls.md) | Previous native time-poll delivery and Sideseat-owned API/storage |
| [TestFlight 1.0.0 (97)](./releases/2026-10-08-testflight97.md) | Separate supported older distribution: dated source, backend, signing and internal distribution evidence |
| [TestFlight 1.0.0 (29)](./releases/2026-09-02-testflight-29.md) | Immutable facts and missing evidence for one uploaded build |
| [TestFlight 1.0.0 (30)](./releases/2026-09-07-testflight-30.md) | Distributed Layer 2 build and physical acceptance evidence |
| [TestFlight 1.0.0 (31)](./releases/2026-09-07-testflight-31.md) | Localization-complete internal pilot build and focused smoke plan |
| [TestFlight 1.0.0 (32)](./releases/2026-09-07-testflight-32.md) | Layer 2 Plan and Outcome attention-badge pilot build |
| [Frozen retired implementations](../archive/2026-10-15-retired/README.md) | Capacitor, When2meet/Preview 98, expired demos, old roadmap; do not execute, maintain or restore |
| `archive/visual-qa-pre-together/` | Historical screenshots from the old navigation; not current sign-off |

Compatibility material cannot reintroduce public Discover, publishing, city
filters, saved posts, people browsing or creator-selected candidate pools into
Together.

The former `ios/App/CapApp-SPM/README.md` belongs to the archived Capacitor
project. Its generated host instructions have no current build authority.

## Lifecycle labels

- **Frozen:** approved product semantics; explicit product decision required.
- **Current:** living guide aligned to current architecture.
- **Implemented:** code/schema/API exists but still needs build-specific testing.
- **Compatibility:** preserved only for old records, clients, migrations or rollback.
- **Historical:** named-date/build evidence, never current status.
- **Archived / frozen:** retired material; do not edit, execute, build, deploy or
  reactivate without a new explicit owner request for that item.
- **Release record:** immutable facts for one build plus explicit missing evidence.
- **Generated:** tool-owned content, not a decision source.

## Maintenance rules

1. One rule has one authoritative home; other documents link to it.
2. Do not create another Goal, Product Model, User Flow or Roadmap file.
3. Feature contracts describe states, APIs, invariants and tests—not positioning.
4. Stable release procedure and per-build evidence remain separate.
5. Temporary prompts, chat summaries, migration journals and completed plans are
   deleted after durable rules move to an active document.
6. Update all references and run the Markdown link check in the same change.
7. Keep active documents concise; move no-longer-current screenshots/evidence to
   `archive/` and label them historical.
