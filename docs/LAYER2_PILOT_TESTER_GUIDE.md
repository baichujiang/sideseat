# Layer 2 non-QA pilot tester guide

**Status:** TestFlight build `1.0.0` (33) submitted; waiting for external Beta review

**Gate:** Layer 3 remains blocked until the
[Layer 2 pilot Gate](./LAYER2_PILOT.md) records two qualifying snapshots at
least seven days apart.

## TestFlight access prerequisite

Build 33 remains assigned to `SideSeat Internal` (one tester). With owner
authorization, it was also added to the existing external group
`SideSeat 用户测试` and submitted for Beta App Review. By
`2026-09-08T00:49:26Z`, App Store Connect showed Waiting for Review, one external
group build and zero external testers. The existing public invitation link and
100-tester limit were unchanged. The link is not yet evidence of an available
Build 33 download.

Before sending invitations:

1. Beta App Information and Beta App Review Information are saved as of
   2026-09-08, including the owner-provided contact and existing QA reviewer
   login. Both QA accounts passed authentication and remain excluded from the
   pilot. Keep credentials in App Store Connect, never in Git or this guide.
2. Wait for Beta App Review approval. Automatic tester notification was
   deselected at submission, so manually start testing/notify testers after
   approval. Verify external build availability before distributing the
   existing link to consenting participants.
3. Confirm the first external participant can accept the invitation and install
   `1.0.0 (33)` before treating recruitment as live. Do not give ordinary
   testers App Store Connect team access just to bypass external beta review.

The authorized follow-up assigned Build 33 and submitted its review; it did not
add testers, send invitations or change public-link settings. No production
Plan or Outcome data was read or written.
See Apple's [test information requirements](https://developer.apple.com/help/app-store-connect/test-a-beta-version/provide-test-information)
and [external tester workflow](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers).

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

After access is confirmed, each pair should use Build 33 through the real product flow:

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

Use this message only after external access is confirmed and only for people
who already agreed to participate:

> You are invited to the SideSeat Layer 2 pilot on TestFlight build 33. Please
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
