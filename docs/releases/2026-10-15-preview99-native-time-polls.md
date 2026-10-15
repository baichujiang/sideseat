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
Native source `5cbba4df77b2683bd4cd3a528125f158a9278310` and feature source
`05307e46983f5050c47037ff5dd0eda0874c8fec` are committed and pushed to the same
GitHub branch. The final QA/evidence commit is recorded separately.

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
  were completed with the same final candidate build: `dpl_7osq5AhK8d7Bsxh3hs2tQUHE4vRi`,
  `https://sideseat-g0yhl8r7e-baichus-projects.vercel.app`. Candidate and production
  each passed five-account API/storage/reopen checks plus config, AASA, Privacy
  and Support. Both `api.sideseat.de` and `www.sideseat.de` resolve to this ID.
  Two earlier candidates were not promoted; the final candidate includes native
  browser handoff allowlists and updated privacy text.

## Device

Installed on iPhone 16 Pro Max / iOS 26.0.1 at 01:46:59. Device app inventory
returns `SideSeat Preview / 1.0.0 / 99`; signature verification passed. Normal
foreground launch with no test arguments succeeded (initial PID 29994).
Five-account physical UI flow passed in 191.232 seconds; five-date rectangle,
scrolling and Chinese dark appearance passed in 31.201 seconds. Normal startup
was restored after QA, with empty launch arguments, Build 99 and PID 30057
confirmed from device inventory/processes. Five temporary QA accounts were
removed; no QA polls remained before cleanup. No TestFlight or App Store upload.

QA harness source: `de0f312ac1638e88fb3852864f6f6bd19d331770`, committed and pushed. Dated evidence is saved
in the final verification commit on the same branch.

[Delivery receipt](../qa/evidence/2026-10-15-native-time-polls/delivery.json) and
[real phone screenshots](../qa/evidence/2026-10-15-native-time-polls/phone/chinese-dark-multiple-dates.png).

## Final client after account-scope repair

Native source `02300a46027c8f0a1952561098f0169d98cbe9be` supersedes the initial
client source above and is committed/pushed. It binds autosave queues and JSON
retry to the original account/login generation. All 16 targeted native/auth tests
passed, including account switches after both HTTP success and 401.

This final signed Preview 99 was installed and the full physical suite rerun:
five-person flow passed in 194.015 seconds; multi-date/scroll/Chinese dark flow
passed in 31.213 seconds, 0 failures. Result:
`/tmp/sideseat-native-poll-phone99-final.xcresult`. Backend deployment is unchanged.
Normal launch was restored with empty arguments; Build 99 and PID 30126
were verified from the phone. The second five-account QA set was deleted, with
0 remaining QA polls. In total ten temporary accounts from both delivery passes
were cleaned. The delivery receipt and screenshots describe this final client.
