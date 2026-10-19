# Plans home — first implementation

Owner-approved concept, 2026-10-19. Partiful-inspired event identity, Howbout-inspired friend context, existing vertical needs-you / horizontal waiting groups. This is the approved image concept, not a device screenshot.

The implementation uses an adaptive warm ivory / forest / sage palette scoped to Plans home, compact category artwork, existing avatars and real organizer/participant names. Only title-matched hotpot, badminton and coffee receive photographic default covers. Other recognized categories retain original vector artwork, with a neutral title tile for unmatched titles; undecided activities remain undecided. Covers require no new creation step or upload.

`PlanHomeHero`, `PlanCoverHotpot`, `PlanCoverBadminton`, and `PlanCoverCoffee` are original bitmap assets generated with the built-in imagegen tool for this project. The hero is illustrative; it is never a participant roster. Actual people come from the existing plan or profile, with normal avatar fallback.

Prompts: editorial transparent collage of friends at a café with badminton crop; square hotpot meal; racket/shuttlecocks on court; two coffee cups on a café table. Source generations retained at the conversation-generated-image locations; bundled versions are optimized in the asset catalog.

First-use creates a plan through the existing single form. Opening a card never accepts or sends. Shared-plan list metadata is additive and read-only: organizer and at most three existing visible people, excluding the viewer/organizer; after invitation only selected people are previewed. Saved availability never implies attendance. No schema, confirmation, notification, cancellation or Calendar rules change.

[Exact generation prompts](./asset-prompts.json). Bundled images: `ios-native/SideSeat/Resources/Assets.xcassets/PlanHomeHero.imageset` and `PlanCover{Hotpot,Badminton,Coffee}.imageset`.
