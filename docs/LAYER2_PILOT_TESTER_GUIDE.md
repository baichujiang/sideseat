# Layer 2 non-QA pilot tester guide

**Status:** Active on TestFlight build `1.0.0` (32)

**Gate:** Layer 3 remains blocked until the
[Layer 2 pilot Gate](./LAYER2_PILOT.md) records two qualifying snapshots at
least seven days apart.

## Who may participate

Invite only people who have agreed to test SideSeat and who will use their own
normal accounts. Repository QA, seed, showcase and generated accounts do not
count. Do not add production users to TestFlight without their consent, and do
not store a tester email roster in this repository.

The minimum measured sample is 20 eligible ended accepted Plans across at least
10 distinct non-QA pairs. As an operating target, each of at least 10 consenting
pairs should complete two genuine Plans and both participants should answer
each available Outcome prompt.

## Tester flow

Each pair should use Build 32 through the real product flow:

1. Both participants install the TestFlight build and use separate normal
   accounts.
2. Use Together normally to reach a Mutual Opportunity and Messages.
3. Create and accept a concrete Plan that both people genuinely intend to do.
4. After the Plan ends, open its Outcome prompt from Together, Messages or
   Calendar history.
5. Each participant independently answers `occurred`, `did not occur` or
   `skip`, according to what actually happened.
6. A reminder to answer is allowed, but participants must not disclose or
   coordinate which answer they choose.

Do not create artificial Plans, backfill answers or tell participants to select
`occurred` to satisfy the Gate. Silence stays missing data; it is never counted
as `did not occur`.

## Privacy expectation

- An Outcome answer is private to the participant who submitted it.
- The app must not expose the other participant's answer or whether they have
  answered.
- A Shared Encounter is derived only when both private answers are `occurred`.
- A one-sided answer, `did not occur` or `skip` must not create a Shared
  Encounter.

Report a privacy mismatch immediately and stop that pair's testing until it is
triaged. Product feedback and technical failures can be submitted through the
in-app Feedback surface without including the other participant's answer.

## Invitation text

Use this message only for people who already agreed to participate:

> You are invited to the SideSeat Layer 2 pilot on TestFlight build 32. Please
> use your own account and SideSeat's normal Together → Messages → Plan flow for
> real plans. After a plan ends, both people should independently answer the
> private Outcome question truthfully: occurred, did not occur or skip. Do not
> share your answer with the other participant. Please report technical or
> privacy problems through Feedback.

## Measurement and schedule

The production report is aggregate-only and excludes QA/internal accounts. The
formal weekly snapshot runs Monday at 12:38 Europe/Berlin. The next snapshot may
run no earlier than `2026-09-14T10:37:35Z`.

Passing one snapshot does not unlock Layer 3. Two consecutive snapshots must
each meet all documented minimum sample and coverage thresholds, with at least
seven days between them.
