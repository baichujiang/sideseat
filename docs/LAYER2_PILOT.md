# Layer 2 Outcome pilot Gate

**Status:** Open — Layer 3 is blocked

**Decision:** Determine whether Outcome has enough real bilateral observation to
support the Layer 3 repeat-opportunity experiment. This is an early-pilot
readiness Gate, not a product-market-fit claim.

## Measurement contract

Each snapshot uses the rolling 14 days ending at report time. An eligible Plan
is the current accepted revision whose end time is inside the window and whose
connection remains active and Block-safe. Legacy accepted Plans without a
stable commitment remain eligible under the same participant-safety rules.

Repository-owned QA, generated test, showcase, demo and seed accounts are
excluded when either participant matches the maintained exact-name or prefix
registry in `lib/analytics/layer2-outcome-pilot.ts`. The report is aggregate
only and does not print usernames, user IDs or Plan IDs.

Metrics:

- participant response coverage = saved private Outcome answers / (2 × eligible
  Plans);
- bilateral Plan coverage = eligible Plans with answers from both participants
  / eligible Plans;
- `occurred`, `did not occur` and `skip` all count as an answer;
- silence is missing data and is never converted to `did not occur`;
- a Shared Encounter remains a separate derived fact that requires two
  `OCCURRED` answers.

## Minimum effective sample and thresholds

A snapshot qualifies only when every condition is true:

| Check | Threshold |
| --- | ---: |
| Eligible non-QA ended accepted Plans | at least 20 |
| Distinct non-QA participant pairs | at least 10 |
| Plans with bilateral answers | at least 8 |
| Participant response coverage | at least 60% |
| Bilateral Plan coverage | at least 40% |

Twenty Plans provide 40 response opportunities while ten distinct pairs prevent
one highly active relationship from deciding the Gate. The coverage thresholds
require a majority of individual opportunities and a substantial bilateral
subset without interpreting non-response as a negative answer. These are
directional pilot thresholds; a larger sample is required for precise outcome
rate estimation.

The full Gate passes only after **two qualifying snapshots at least seven days
apart** are recorded here. This prevents one short acquisition or reminder
spike from unlocking Layer 3.

## Reproducible collection

Run the aggregate read-only report against the production database:

```bash
npm run report:layer2-pilot
```

Only organic answers submitted by non-QA participants count. Do not seed,
backfill or infer Outcome rows to satisfy this Gate. Record each weekly snapshot
below with its exact UTC window and report output. If a run does not qualify,
continue the Layer 2 pilot and collect another weekly snapshot; do not enter
Layer 3.

Recruitment, consent, tester instructions and the truthful-answer protocol are
defined in the [non-QA pilot tester guide](./LAYER2_PILOT_TESTER_GUIDE.md).

## Recorded snapshots

| Recorded at (UTC) | Window start (UTC) | Candidate Plans | Excluded QA/internal | Eligible non-QA Plans | Distinct pairs | Answers | Bilateral Plans | Response coverage | Bilateral coverage | Qualifies |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 2026-09-07 10:37:35 | 2026-08-24 10:37:35 | 3 | 3 | 0 | 0 | 0 | 0 | 0.0% | 0.0% | No |

The first baseline contains no eligible non-QA Plan: all three candidate Plans
in the production window involve repository-owned QA or seed accounts. It is a
valid non-qualifying snapshot, not evidence of a negative Outcome rate.

## Next step

Continue the Layer 2 pilot with real non-QA participants and run the next weekly
snapshot no earlier than 2026-09-14 10:37:35 UTC. Keep collecting until two
qualifying snapshots at least seven days apart exist. Only then update this
document and `docs/ROADMAP.md` to mark the Gate passed and begin Layer 3.
