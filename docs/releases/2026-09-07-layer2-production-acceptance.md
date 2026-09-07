# Layer 2 production acceptance record

**Status:** Technical acceptance passed; product gate remains open

**Date:** 2026-09-07

**Scope:** Outcome and Shared Encounter

**Governing roadmap:** [Roadmap](../ROADMAP.md)

## Release evidence

- Source commit: `e755146` (`feat(together): add private outcomes and shared encounters`)
- Remote branch: `origin/feat/native-ui-design-system`
- Pre-migration Neon branch: `pre-layer2-20260907-e755146`
- Pre-migration Neon branch ID: `br-wandering-block-aps95h1b`
- Restore-point parent LSN: `0/B92B350`
- Restore branch expiry: `2026-09-14T10:00:00Z`
- Production migrations applied:
  - `20260902120000_weekly_intent_general_activity`
  - `20260907120000_shared_encounter`
- Post-migration status: Prisma reports the database schema is up to date.
- Vercel production deployment: `dpl_HWM19p9xx9pHQQgc9CAAidoa4nkH`
- Production URL: `https://api.sideseat.de`
- Deployment state: Ready; client config, AASA, Privacy and Support checks passed.

The production deployment was built from a clean archive of the exact source
commit so unrelated local Xcode project, plist and archive changes were not
included.

## Physical-device acceptance

- Device: iPhone 16 Pro Max
- OS: iOS 26.0.1
- Signed bundle: `app.sideseat.mobile`
- API: `https://api.sideseat.de`
- Accounts: repository-defined `test_001` and `test_002` QA accounts
- QA Plan: `cmtr1yri9000912u1rufe5azb`

Accepted behavior:

1. `test_001` reached the same private Outcome state from Together, Messages
   and Calendar history.
2. The Calendar projection opened Plan details and routed back to the canonical
   direct conversation.
3. After only `test_001` answered `OCCURRED`, the database contained one private
   answer and no Shared Encounter.
4. At that midpoint, `test_001` saw only its own saved answer, `test_002` saw no
   answer, and neither API response exposed the peer answer or response count.
5. `test_002` then reached Outcome from Messages and answered `OCCURRED`.
6. The database then contained exactly two `OCCURRED` answers and exactly one
   Shared Encounter for the QA Plan.
7. Both accounts saw only their own saved answer and had zero remaining Outcome
   prompts for this Plan.

Physical-device UI tests:

- `SocialLiveUITests/testLayer2FirstParticipantReachesOutcomeFromEveryHistorySurface`
  passed in 46.572 seconds.
- `SocialLiveUITests/testLayer2SecondParticipantCompletesBilateralOutcomeFromMessages`
  passed in 24.631 seconds.

The test harness now forwards the live API base URL and stable Layer 2 fixture
identifiers through the Development scheme. Calendar navigation follows the
visible off-screen event cue and scrolls the lazy detail list before opening the
Plan.

## Outcome coverage snapshot

Window: rolling 14 days ending `2026-09-07T10:12:56.623Z`.

| Metric | Before QA | After QA |
| --- | ---: | ---: |
| Eligible ended accepted Plans | 2 | 3 |
| Participant response opportunities | 4 | 6 |
| Outcome responses | 0 | 2 |
| Plans with any response | 0 | 1 |
| Plans with bilateral responses | 0 | 1 |
| Bilaterally reported occurred Plans | 0 | 1 |
| Outcome response coverage | 0.0% | 33.3% |
| Bilateral Plan coverage | 0.0% | 33.3% |

An unanswered opportunity remains silence, not a negative Outcome.

## Gate decision and next step

The technical Layer 2 contract is accepted. The product Gate is not accepted:
one controlled QA pair among only three eligible Plans is not sufficient
bilateral response coverage, and the roadmap defines no numeric sufficiency
threshold.

Continue the Layer 2 pilot and collect non-QA bilateral Outcome responses using
the same rolling 14-day denominator. The minimum sample, coverage thresholds
and consecutive-snapshot rule are now defined in the
[Layer 2 pilot Gate contract](../LAYER2_PILOT.md). Layer 3 must not start until
that decision is recorded as passed.
