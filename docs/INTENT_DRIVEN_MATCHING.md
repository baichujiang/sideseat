# Event-driven automatic matching

**Owner decision:** 2026-09-09. Publishing an activity intention is the explicit
request to find company. Remove the second Start matching action from the new flow.

**Status:** Committed/pushed as `46b0e7a`; both migrations and production backend
deployed on 2026-09-09. Both new flags remain OFF. Internal TestFlight Build 39
is processed and available in `SideSeat Internal`, with testing notes saved.
See the [release record](./releases/2026-09-09-testflight-39.md).

## Product flow

Publish an activity → automatically find company → private Opportunity → both
interested → contextual chat → propose a concrete timed Plan → accept → both Calendars.

- This is event-driven, not browsing or ranking people. Activity-fit ordering,
  eligibility, private bilateral interest and explicit Plan confirmation stay intact.
- The publication action says **Publish intention** and explains automatic matching
  until expiry, with pause available at any time. Updating a published intention
  says Save changes. Editing a paused intention does not resume it.
- Published ACTIVE intentions participate throughout their own validity (14 days
  for new publications), even if the owner is offline. There is no separate
  48-hour session or countdown in the enabled new client.
- PAUSE exits supply and invalidates pending opportunities for that intention;
  RESUME re-enters and immediately tries matching. END/expiry exits supply.
  Already-mutual coordination and confirmed Plans are not silently cancelled.
- Publish, edit, resume and extend trigger matching; list refresh is a retry path.
  New opportunity insertion notifies both users. No cron scan or guaranteed match
  is implied, and a failed push does not erase the opportunity.
- The finite decision window on an Opportunity is separate from intention
  participation; flexible Opportunity cards may still expire within 48 hours.

## Implementation and existing-client consent

- `WeeklyIntent.automaticMatching` is a non-null boolean defaulting to false.
  Migration `20260909020000_intent_driven_matching` does not enroll old rows.
- Create, EDIT and RESUME accept optional `automaticMatching: true`. The new
  client submits this after the publication/resume disclosure. Omitted means
  preserve existing consent, not silently enroll. Use PAUSE/END to leave supply.
- Previously saved legacy intentions can be reviewed and explicitly published;
  their existing data and expiry are retained. Merely opening the new version
  does not convert them. Legacy intentions otherwise keep their session rule.
- Candidate queries and locked insertion both check per-intent enrollment.
  Legacy candidates still require an active, locked session. Automatic candidates
  require an active, unexpired intention and the rollout flag, not a session.
- A user returning to an older installed client can still use Stop: it stops the
  legacy session and pauses their automatically published intentions. It does not
  delete intention history, mutual conversations or confirmed Plans.
- `V2_AUTOMATIC_MATCHING_ENABLED` / `v2AutomaticMatching` defaults OFF. Publication
  requires Weekly Intent and Mutual Opportunity enrollment to be enabled. Global
  kill switch applies; read/pause/end remain safe-drain operations.

## Verification

- During implementation, applied the new migration only to
  `sideseat_flexible_timing_20260909` on `127.0.0.1:5433`; all 134 migrations
  applied. Subsequent authorized production deployment is recorded above.
- 15 real PostgreSQL tests pass, none skipped: publication without any session,
  private first interest, mutual chat, explicit Plan and both Calendars; legacy
  consent, pause/resume, expiry/end, rollout OFF, old-client Stop and prior
  exact/related/Study/session/Plan closure regressions.
- The primary test verifies that the second publication creates the opportunity
  before any Start or list/refresh request, with zero session rows. A subsequent
  refresh does not insert a duplicate.
- V2 suite: 223 pass, 132 database-dependent skipped, zero failures; relevant
  database suites additionally executed above. OpenAPI: 170 operations validated,
  13 contract tests pass and native client regenerated without warnings.
- Native verification: 4 model/encoding tests and all 3 UI tests pass in
  `/tmp/sideseat-automatic-ui-3.xcresult`. The UI verifies Chinese Light,
  English Dark and German maximum Dynamic Type: no separate matching start or
  countdown, explicit publication copy, undecided/range/exact choices, and a
  Plan that cannot be sent until its time is explicitly confirmed.
- The final German large-type short publication label and bounded decorative
  icons also pass in `/tmp/sideseat-automatic-ui-4.xcresult` (the focused UI test
  plus all 4 model tests). Refreshed screenshots were visually inspected.
- Observed date-shortcut issues were fixed by using a single adaptive button
  layout instead of duplicate ViewThatFits trees. The UI test now checks the
  selected timing mode and that Next week actually produces a date range;
  screenshots confirm Sep 14–20. Test scrolling now targets the editor's visible
  area so taps are not intercepted by its fixed bottom dock. Runs 1–2 had failures
  and are superseded by the all-green runs above.
- TypeScript, scoped ESLint, three localization syntax checks and
  `git diff --check` pass. Logs: `/tmp/sideseat-automatic-postgres.log`,
  `/tmp/sideseat-automatic-v2-final.log`, `/tmp/sideseat-automatic-native3.log`,
  `/tmp/sideseat-automatic-native4.log`. Screenshots under `docs/visual-qa/` remain
  local QA artifacts. Native UI uses offline fixtures; the database flow uses
  real local services. This is not signed TestFlight or physical-phone acceptance.

## Next step

Both phones update to internal Build 39 → separately authorize enabling the
automatic/flexible flags →
accept the signed two-account publish → Opportunity → chat → timed Plan → both
Calendars flow. Production activation is not authorized by the current release
request. QA is not a real-user Outcome Gate sample.
