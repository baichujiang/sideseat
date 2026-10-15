# Preview 100 — unified manual plans

Owner authorized implementation, required backend release, phone installation,
five-person QA and GitHub push. Current branch: `codex/ios-uxui-20260922`.
GitHub was fetched before work; the clean `a5904fc` baseline matched the remote.
Archives remain frozen. No TestFlight/App Store upload.

## Delivered behavior

**Plans → + → Create a plan** offers **Collect availability / 一起定时间** and
**Set a time / 直接选时间**. Both use one manual shared lifecycle: choose participants,
invite, individual confirmation, then all selected participants' Sideseat Calendar
projections. Availability is not acceptance. Five complete responses produce common
whole-duration windows or maximum attendance. Explicitly choosing four invitees
leaves the fifth respondent outside confirmation and Calendar. Decline/reinvite,
stale version rejection, cancellation and safety cleanup are implemented.

The existing native grid/autosave and Sideseat-owned storage remain. Existing
conversation-bound bilateral Plans keep their contracts and appear in the same
Plans destination. Discovery Pod, old group routes and archives stay inactive.
Calendar sync here means Sideseat Calendar; no automatic external Apple/Google
write-back was added.

## Source and backend

- Feature/API source: `76571765decce2a3cdee4cdfb15faf8330cfcd5a`, committed and pushed.
- Final native source: `6d5e6b5137c78e49291805b1a9989ac462fb209f`, committed and pushed.
  Its sole app-source change after the full phone flow corrects the manual-plan
  Calendar guidance from Messages to Plans; related UI regression coverage added.
- Backend: **READY**, `dpl_4vBvPch35jxdarqmgnxmvSsGSt6u`,
  [deployment](https://sideseat-jmi9xysst-baichus-projects.vercel.app).
  `api.sideseat.de` and `www.sideseat.de` were inspected and resolve to that ID.
- Release context rebuilt from verified production `dpl_7osq5AhK8d7Bsxh3hs2tQUHE4vRi`.
  All 1,315 retained baseline files were verified before 22 explicit overlays;
  the existing production analytics/runtime differences were preserved. Seven
  archived original paths were excluded. Post-upload, all **1,323** source file
  SHA-1 values match the controlled context, with no archive/native-shell source.
- Fresh repeatable-read logical backup: **100 tables, 29,722 rows, 1,394,961 bytes**,
  existing private Blob storage; full readback SHA-256 verified before migration.
  Schema/migration sources remain in the release context. This is a logical
  recovery point, not a full restore rehearsal. Contents/credentials are excluded
  from Git; [backup metadata](../qa/evidence/2026-10-15-unified-plans/backup-summary.json).
- 148 prior applied migrations; only
  `20261015120000_unified_planning` and
  `20261015123000_unified_planning_calendar_index` were pending and applied.
  Existing rows/history/checksums were not rewritten.
- Vercel Secret values cannot be pulled locally. The explicit one-shot preflight
  used the staged production build's existing database/private-storage access,
  checked the project/target, backed up, migrated, and created five disposable QA
  accounts. Only encrypted QA credentials were emitted; the operator's local key
  recovered them privately. Secret visibility and project environment values did
  not change. Normal build migration was disabled with `SKIP_DATABASE_MIGRATIONS=1`.
- Candidate `--prod --skip-domain` and public production each passed five-account
  API checks before/after promotion of that exact build. A deployment-filtered
  error-log query returned no records during acceptance.

## Phone and verification

Signed **SideSeat Preview / app.sideseat.mobile.preview / 1.0.0 (100)** installed
on iPhone 16 Pro Max / iOS 26.0.1. Ordinary SideSeat **97** remains installed.

Full physical five-account UI flow passed in **321.509 s**: native creation, five
real logins/grid fills/autosave, common 5/5, maximum 4/5, result → explicit roster,
creator + four individual confirmations, no early Calendar entries, five Calendar
projections with four companions each, five-account Upcoming reopen, Calendar
search/read-only detail/Manage Plan. Direct-time creation plus confirmation,
Chinese dark/accessibility launch passed in **60.562 s**. Zero failures.
The full physical suite used native source `7657176`.

Visual review then found the old Messages caption at the top of Calendar details.
The one-line native correction `6d5e6b5` passed all 394 Swift Testing cases and the
27.108 s simulator live Calendar guidance/canonical-route regression. That final
signed binary was reinstalled; empty-argument normal launch and running PID
**32089** were confirmed. Backend, invitation and Calendar write logic are unchanged
from the physically verified feature source. Full five-person UI was not rerun for
this caption-only correction.

The standalone QA runner was removed. All five temporary accounts were deleted,
all QA polls were gone, and deleted-account tokens returned 401. Original Preview
credentials used a separate ephemeral test session. Private credentials and the
operator decryption key were removed after verification.

[QA report](../qa/2026-10-15-unified-plans.md),
[delivery receipt](../qa/evidence/2026-10-15-unified-plans/delivery.json),
[phone common result](../qa/evidence/2026-10-15-unified-plans/phone/five-common.png),
[phone confirmation](../qa/evidence/2026-10-15-unified-plans/phone/five-confirmed.png),
[final caption verification](../qa/evidence/2026-10-15-unified-plans/simulator/calendar-guidance.png).
