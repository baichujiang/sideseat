# SideSeat Documentation

**Status:** Current index and authority map

**Last updated:** 2026-09-07

## Read this first

The active reading path is intentionally short:

```text
PRODUCT
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
| [Product](./PRODUCT.md) | Positioning, product objects, navigation, invariants and non-goals |
| [User Flow](./USER_FLOW.md) | Current user-visible Intent → Opportunity → Plan flow and repeat boundary |
| [Roadmap](./ROADMAP.md) | Current implementation order and decision gates |
| [Together Contract](./TOGETHER_CONTRACT.md) | Weekly Intent, matching session and Mutual Opportunity engineering rules |
| [Safety](./SAFETY.md) | Pair-wide Block, Plan/Calendar cleanup, privacy and concurrency |
| [Native iOS](./IOS.md) | SwiftUI architecture, environments, build and Calendar sync |
| [Design System](./DESIGN_SYSTEM.md) | Tokens, reusable UI, interaction and visual acceptance |
| [Release](./RELEASE.md) | Database/Vercel/TestFlight/App Store procedure and gates |
| [Privacy](./PRIVACY.md) | App Store data disclosure and provider mapping |
| [Layer 2 pilot Gate](./LAYER2_PILOT.md) | Non-QA sample, coverage thresholds and weekly decisions |
| [Layer 2 pilot tester guide](./LAYER2_PILOT_TESTER_GUIDE.md) | Consent, recruitment and truthful Outcome instructions |

## Compatibility and evidence

| Document | Purpose |
| --- | --- |
| [Legacy Action Compatibility](./LEGACY_ACTION_COMPATIBILITY.md) | Existing B-light/public Action, legacy Activity and web fallback only |
| [TestFlight 1.0.0 (29)](./releases/2026-09-02-testflight-29.md) | Immutable facts and missing evidence for one uploaded build |
| [TestFlight 1.0.0 (30)](./releases/2026-09-07-testflight-30.md) | Distributed Layer 2 build and physical acceptance evidence |
| `archive/visual-qa-pre-together/` | Historical screenshots from the old navigation; not current sign-off |

Compatibility material cannot reintroduce public Discover, publishing, city
filters, saved posts, people browsing or creator-selected candidate pools into
Together.

`ios/App/CapApp-SPM/README.md` is generated package-host documentation for the
legacy Capacitor rollback project. Do not treat it as product authority.

## Lifecycle labels

- **Frozen:** approved product semantics; explicit product decision required.
- **Current:** living guide aligned to current architecture.
- **Implemented:** code/schema/API exists but still needs build-specific testing.
- **Compatibility:** preserved only for old records, clients, migrations or rollback.
- **Historical:** named-date/build evidence, never current status.
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
