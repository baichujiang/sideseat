# Preview 99: native time polls

2026-10-15, Europe/Berlin. Owner chose SwiftUI and Sideseat-owned storage.

This replaces Preview 98's When2meet webview with native date/time creation,
15-minute paint/erase selection, autosave and group heatmap. Common windows and
highest-attendance recommendations use the saved Sideseat responses. New polls
have Sideseat share/deep links and account-scoped history. No provider page,
advertising or provider save requests remain in the active app source.

## Source and verification

Active checkout `Sideseat-ios-uxui`, current branch `codex/ios-uxui-20260922`.
Before work, baseline `ba8a92b` was clean and fetched/in sync with GitHub.
Source commit and push: pending stage record below.

[QA evidence](../qa/2026-10-15-native-time-polls.md) covers domain/API/native flows.
Preview configuration is `app.sideseat.mobile.preview / 1.0.0 (99)`;
production/TestFlight configuration remains build 97.

## Backend

- Release base: current deployment `dpl_ssQz7eBBytwUSNHj5vmaLs7ZYNNH`.
  All 1,305 source files were compared to the deployment file hashes. Ten existing
  production differences were restored in an isolated release directory. No extra
  runtime source existed in that base. Only the 13 time-poll dependency files in
  the evidence manifest were overlaid, retaining existing production behavior.
- Before migration: consistent read-only logical backup of all 98 public tables,
  29,710 rows, compressed 1,381,165 bytes, private local file. Credentials and
  backup contents are excluded from Git. This is a logical recovery snapshot,
  not a full restore rehearsal.
- 147 applied migrations match the current migration names; 5 older rolled-back
  ledger entries also exist. One existing 20260215180000 checksum differs from
  the current file, which is identical to the current production source; it was
  not rewritten. Status identified only the new time-poll migration as pending.
- Additive migration `20261015093000_native_time_polls` applied once. It creates
  `TimePoll` and `TimePollResponse`, unique account/poll answers, indexes and
  cascading foreign keys. No existing table data or old migration is rewritten.
- Candidate uses `--prod --skip-domain`, explicit migration step, and build-time
  `SKIP_DATABASE_MIGRATIONS=1`. Candidate validation, promotion and deployment ID
  are pending release record below.

## Device

Physical installation, normal launch and five-account UI verification are pending
record below. Pending states are not counted as delivered.
