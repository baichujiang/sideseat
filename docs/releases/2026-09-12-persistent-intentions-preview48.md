# Persistent intentions — Preview 48 preparation

Superseded: the user later authorized the production release, which completed with Preview 52. See [the production release record](2026-09-12-persistent-intentions-production.md). The following is the historical preparation record; Preview 48 was not installed.

Date: 2026-09-12. Source: `891b627` plus the current reviewed workspace. User requested deployment to the existing phone Preview.

Status: signed artifact and backend release build ready; not installed, not deployed, no remote migration performed. The existing Preview targets the production API, and the Vercel Preview environment has no database configured. Production changes await explicit authorization under `docs/RELEASE.md`.

## Prepared artifact

- SideSeat Preview / `app.sideseat.mobile.preview` / 1.0.0 (48).
- Development API: `https://api.sideseat.de`.
- Signed device build and `codesign --verify --deep --strict` passed.
- Preserved artifact: `/tmp/sideseat-persistent-preview48/SideSeat.app`.
- Build log: `/tmp/sideseat-persistent-preview48-build.log`.
- Paired target: iPhone 16 Pro Max, device `DBD39EB5-1345-539C-A974-E6128E75A942`.
- Before installation, inventory confirms Preview 47 and ordinary SideSeat 41.
- Backend release build passed with `SKIP_DATABASE_MIGRATIONS=1`; log `/tmp/sideseat-persistent-backend-release-build.log`.
- Functional and native verification is recorded in [the implementation record](2026-09-12-persistent-intentions.md).

## Reviewed production impact

Read-only inspection found the latest applied migration is `20260911001000_explore_intent_visibility`; `WeeklyIntent.expiresAt` remains NOT NULL.

The new migration `20260912010000_persistent_intentions` would preserve 28 current active intentions without a deadline and finalize 2 already elapsed ACTIVE records. The other 16 ENDED and 5 EXPIRED records retain their historical status. Matching publication and Explore visibility are preserved. Counts must be refreshed immediately before an approved migration.

A read-only lifecycle snapshot contains 51 intention rows and 9 pending opportunity rows, including only IDs and lifecycle/participation fields: `/tmp/sideseat-persistent-preview48/lifecycle-before-migration.json` (0600, outside Git).

The new backend directs earlier iOS clients without the persistent-intent capability to update using HTTP 426 for intent routes. Consequently deploying the shared backend also affects the ordinary older App. A Preview-only request does not authorize that production change.

Once explicitly authorized: coordinate the existing intention/matching write gates, refresh the lifecycle snapshot, apply the reviewed migration, deploy the reviewed backend, verify the real API, then install and launch the preserved Preview 48 artifact. Verify the bundle, version and target API again immediately before installing. Production installation/TestFlight distribution is not part of this Preview request.
