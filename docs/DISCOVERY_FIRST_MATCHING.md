# Discovery-first Together

**Owner decision:** 2026-09-09. Discovery first; relevance orders suggestions,
not a minimum compatibility threshold. This supersedes the soft eligibility
rules in Activity Fit, flexible timing and the ordinary-discovery history gate.

**Delivery:** Owner authorized commit/push, backend with discovery OFF and internal
[Build 40](./releases/2026-09-09-testflight-40.md). Release in progress.
Production retains Build 39's existing rules until both phones update and the
owner confirms activation.
`V2_DISCOVERY_MATCHING_ENABLED` defaults OFF. No new migration is required.

## Product contract

- Only actively participating, onboarded, verified, non-guest users with an
  ACTIVE unexpired intention can be discovered. Legacy intentions still need
  their explicit live session; old saved rows are not silently enrolled.
- Different activities (including Sports and strict Study), time preferences,
  languages, schools and courses are soft differences, not exclusion filters.
  There is no minimum relevance score; even 0/100 can be delivered.
- Rank candidate pairs across **all** of the viewer's available intentions before
  allocating cards, so an older low-fit intention cannot consume a peer ahead of
  a newer high-fit one. Scores descend first, then activity points, then stable
  timing/creation-order ties. The new policy considers the participating supply
  without the old 240-row truncation; the legacy policy retains its batch bound.
- Keep finite one-to-one opportunities and existing unresolved intent/pair slots.
  Do not replace a pending choice, open conversation or accepted Plan to obtain a
  better score. This is not a public people directory or guaranteed pairing when
  all remaining people have opted out, are occupied or are unavailable.
- A past Plan without Outcome or Meet Again answers does not block a new ordinary
  discovery. No answer is inferred, inserted, or changed. Such a card is not a
  claimed Repeat Opportunity or Shared Encounter.
- The latest ended accepted Plan's explicit NO/WITHDRAWN Meet Again permission
  still stops the pair. A new refusal invalidates pending discovery privately;
  acceptance rechecks it under the pair lock. Qualified Repeat provenance still
  requires a Shared Encounter, bilateral permission and new post-Plan intentions.
- Ignore/withdraw preserves the existing **14-day pair refusal cooldown**;
  republishing cannot bypass it. Pure expiry or completed history does not impose
  that cooldown under discovery-first rules. Historical uniqueness remains intact.
- Block, moderation, ended connections, privacy opt-out, pause/end/expiry and
  per-intention consent remain hard boundaries. No private rejection reason,
  permission count or counterpart answer is exposed in a card or empty state.
- Both fresh interests are required for chat. Only a separately accepted timed
  Plan creates commitments and both Calendars. Outcome/Shared Encounter rules and
  real-user pilot metrics are unchanged; QA is not organic evidence.

## Explainable `DISCOVERY_FIT_V1`

The frozen heuristic totals 100 possible points; it is neither a person rating
nor a success probability. Unknown time contributes no asserted overlap and is
explicitly distinguished from a conflict.

| Component | Points |
| --- | --- |
| Activity | Exact 50; parallel study 35; related general activity 25; other same-category activity 10; different category 0 |
| Time | Exact overlap: up to 30 (one point per two minutes); compatible dated preferences 15; unspecified or conflicting time 0 |
| Language | Listed common language 10; otherwise 0 |
| School | Same recognized school 10; otherwise 0 |

Course differences are disclosed, not scored or presented as a shared course.
Conflicting times produce **NULL appointment timestamps**, not a made-up overlap;
the suggestion expires within 48 hours or earlier at either intention's expiry.
Different activities use the neutral source title “Do something together” and
CUSTOM Plan type, preserving both actual activities in the immutable snapshot.
Historical V1/V2 scores are not recalculated.

## Native and API

- Cards show Relevance N/100, the two actual activities and visible, localized
  differences for activity, time, language, school and course. Important caveats
  are outside the expandable calculation section. Chinese/English/German remain
  paired, including large text and dark mode.
- Publishing explains discovery beyond matching preferences. The automatic-flow
  empty state distinguishes unpublished/paused supply from “no new suggestions
  right now”, with create/refresh actions and no obsolete Start/48-hour instruction.
  Loading and request errors are not presented as an empty candidate pool.
- Additive score fields are `differences`, `viewerActivity` and `peerActivity`;
  they are allowlisted projections, not raw intent/user/Plan objects.
- Updated clients send `X-SideSeat-Discovery-Matching: 1`. Older clients do not
  receive discovery-policy cards that they cannot explain. Existing timestamps,
  historical cards and safe-drain actions retain their contracts.

## Local verification

- New pure/service checks: 8 passed, none skipped. The real PostgreSQL primary
  path uses cross-school, disjoint-language, different-category, conflicting-time
  intentions plus an unanswered historical Plan: **0/100 → private first YES →
  mutual chat → new accepted Plan → two active Calendar projections**. Historical
  Outcome and Shared Encounter counts remain zero.
- Combined PostgreSQL/pure regression checks: 26 passed, no failures; one unrelated
  Layer 3 HTTP test skipped because its local HTTP server was not configured.
  Includes old exact/related/parallel matching, flag-off behavior, pause/resume,
  legacy sessions, accepted Plan closure, repeat consent and safety regressions.
- V2 suite: 227 passed, 136 database-dependent tests skipped, no failures. Two
  source-shape assertions were updated for the new all-intent ranked loop; real
  database tests additionally protect the behavior rather than only source text.
- OpenAPI: 170 operations validated; 13 contract tests passed; native client
  generation completed. TypeScript and scoped ESLint pass.
- Native acceptance finished at `2026-09-09T05:24:19Z`: **TEST SUCCEEDED**, 46
  model/store tests and both UI tests passed. UI covers Chinese Light, English
  Dark, German largest Dynamic Type, unpublished/published empty states, opening
  the intention editor and refreshing suggestions. Screenshots were visually
  inspected; important differences remain visible outside calculation details.
- Final bundle: `/tmp/SideSeatDiscovery-20260909-5.xcresult`. Runs 1–2 stopped in
  Xcode's compiler probe (blocked output pipe, independently reproduced command
  succeeded). A temporary local CC launcher buffered the probe's exact stdout/
  stderr before forwarding them; actual compilation still used Apple's clang.
  This build-only workaround is outside the repository and changed no compiler
  output, application code, signing or release configuration.
- Runs 3–4 revealed SwiftUI accessibility identifiers propagating to children.
  Explicit accessibility grouping fixed the difference list and empty-action
  identifiers. Run 5 supersedes these failures and verifies both actual actions.

Evidence is local: `/tmp/sideseat-discovery-tests.log`,
`/tmp/sideseat-discovery-postgres-final.log`,
`/tmp/sideseat-discovery-v2-final.log`, `/tmp/sideseat-discovery-types.log`,
`/tmp/sideseat-discovery-lint.log`, `/tmp/sideseat-discovery-native5.log`.
Tests use `sideseat_discovery_20260909` on localhost:5433 and the dedicated
SideSeat simulator; no production/user fixture writes or physical-phone changes.

## Next step

Local native acceptance is complete and release is authorized:
commit/push scoped changes → deploy backend with discovery OFF → publish internal
Build 40 → confirm both phones updated → enable discovery →
signed two-account publication-to-Plan acceptance. Build 39 alone cannot show
this new UI. Preserve unrelated Info.plist changes, old archives and local media.
