# SideSeat Production Configuration Runbook

Use this runbook before TestFlight or an App Store archive. Never commit API
keys, `.p8` files, DSNs with credentials, database URLs, or heartbeat tokens.
Mark Vercel credentials and heartbeat URLs as Sensitive.

## Current external status (2026-08-11)

| Area | Current evidence | Gate |
| --- | --- | --- |
| Public API and links | Production deployment `dpl_5a1KVDS9YvmEHp8NquCn4XkEUchd` is Ready on `api.sideseat.de`, `www.sideseat.de` and `sideseat.de`. AASA returns HTTP 200 JSON with Team/App ID `V4238R5R53.app.sideseat.mobile` and the reviewed exact 13 native paths; client config and public Privacy, Support and iOS pages return HTTP 200. | Ready |
| Neon and Vercel Blob | Production integrations exist in Vercel. `DATABASE_BACKUP_PROVIDER`, `DATABASE_BACKUP_RETENTION_DAYS` and `DATABASE_RESTORE_TESTED_AT` are not present in the Production environment-name audit. | Restore drill and proof variables pending |
| Resend sending | `sideseat.de` is verified in `eu-west-1`; sending is enabled | Ready |
| Support inbox | `valeridium@gmail.com` is selected; `NEXT_PUBLIC_SUPPORT_EMAIL` and `FEEDBACK_TO_EMAIL` are deployed in Vercel Production. Resend accepted a live `verify@sideseat.de` delivery test on 2026-08-10. | Recipient delivery/reply acceptance pending |
| APNs | The existing Team-scoped APNs key is authorized for Sandbox and Production. It is deployed through separate Sensitive `APNS_SANDBOX_*` and `APNS_PRODUCTION_*` variables with `APNS_USE_SANDBOX=0`; Production reports `apnsSandboxDelivery: true` and `apnsProductionDelivery: true`. A signed Development build registered/updated a sandbox token from the physical iPhone through Production API with HTTP 201. | TestFlight production-token registration and foreground/background/cold-launch delivery pending |
| Apple signing | Production archive `1.0.0 (1)` passed validation and uploaded successfully to App Store Connect at 2026-08-11 21:28 CEST; Apple accepted the package and began processing it. A signed Development arm64 build was installed and launched on a wired iPhone 16 Pro Max on 2026-08-11; it uses the production API, Development APNs and `applinks:www.sideseat.de`. A Universal Link payload launch also succeeded. Physical-device Swift tests passed 181/181. UI Automation is enabled and all 13 critical direct-chat journeys passed on the device across the 12/13 contiguous run plus a clean rerun of the sole system-notification-interrupted scroll case. | Wait for TestFlight processing, then complete Production APNs and TestFlight acceptance |
| Sentry | Production DSN and scoped `org:ci` token are configured. A signed Production archive uploaded its real dSYM to `sideseat/apple-ios`; the final Keychain-authenticated app/dSYM UUID is `07aabd70-b915-33a3-95bb-0e631aea0e67`. The token is stored in the local macOS Keychain and is absent from Git/Xcode configuration. App Store upload emitted a non-blocking warning because Sentry's prebuilt framework artifact does not contain a matching vendor dSYM; the SideSeat app dSYM is present and uploaded. | One real symbolicated non-PII event pending; monitor vendor SDK frames separately |
| Cron monitoring | Per-job monitoring is implemented; `CRON_MONITOR_URLS` and external heartbeat URLs are absent | Pending |
| StoreKit support tips | Production feature is disabled | Deliberately deferred for v1 |
| Automated regression | Swift unit 181/181, Node/TypeScript 99/99, API 92/92, release configuration 57/57, system accessibility audit 7/7, AppShell deep-link UI 3/3 across 9 native destinations, explicit performance gates 10/10, Live social 7/7, Live calendar 2/2 and Live course 1/1 pass. The complete fixture iPhone UI suite passed 103/103 and the real-photo case passed separately 1/1. The same 181 Swift tests pass on the physical iPhone. Production account-switch/auth precedence and authenticated reads for Me, Inbox, Discover, Courses, Plans and Home Schedule pass; post-deploy logs show successful refresh, schedule, inbox and push registration with no 5xx. Physical chat input main-loop latency was 8.153 ms on first focus, 2.364 ms continuously and 2.219 ms after refocus. A clean three-round dense-scroll run averaged 20.319 seconds for six synthesized drags per round with zero hitches; one later suite round was invalidated when an iOS notification banner added XCUI idle time. | Automated and physical Development UI gates ready; Production push delivery/TestFlight pending |

## 1. Support mailbox

Use a monitored personal mailbox for v1 support. Keep Namecheap on `Custom MX`
so the existing Resend sending records remain intact; do not enable Namecheap
Email Forwarding or Resend Receiving for this release.

1. Keep the selected personal inbox monitored. This address is public on the
   Support and Privacy pages, so replace it before release if it should not stay
   public.
2. In Namecheap, keep `Mail Settings` set to `Custom MX`. Preserve the
   `send.sideseat.de` MX, SPF and `resend._domainkey.sideseat.de` DKIM records.
3. In Resend, keep sending enabled and receiving disabled.
4. `NEXT_PUBLIC_SUPPORT_EMAIL` and `FEEDBACK_TO_EMAIL` are already present in
   Vercel Production. Change them together if the support inbox changes.
5. Redeploy and open the production Support and Privacy pages. Confirm their
   mail links open a message addressed to the configured inbox.
6. Submit one in-app feedback item and send one ordinary external test message.
   Confirm both arrive, then send a reply from the personal inbox.
7. Use the same monitored address for the initial App Store Connect support
   contact. Migrate to `support@sideseat.de` later without changing application
   code by updating the environment variables.

Pass evidence: direct email and in-app feedback arrive, replies work, and the
production Support and Privacy pages expose the configured address.

## 2. Production APNs

1. Confirm the Apple App ID `app.sideseat.mobile` has Push Notifications and
   Associated Domains enabled.
2. In Apple Developer, create a new APNs key with Environment `Production`.
3. Prefer a topic-specific restriction for `app.sideseat.mobile` when offered;
   otherwise use the team-scoped option.
4. Download the `.p8` file once and store it in the password manager or encrypted
   release vault. Do not place it in the repository.
5. Add these Vercel Production variables:
   - `APNS_PRODUCTION_KEY_ID`
   - `APNS_PRODUCTION_KEY_P8`
   - `APNS_TEAM_ID`
   - `APNS_BUNDLE_ID=app.sideseat.mobile`
   - `APNS_USE_SANDBOX=0`
6. Keep `APNS_SANDBOX_KEY_ID/P8`; signed Debug devices still use the sandbox
   endpoint through their stored device environment.
7. Redeploy, install a `SideSeat-Production` or TestFlight build on an iPhone,
   grant notifications, and trigger a direct-message notification.

Pass evidence: foreground, background and terminated-app delivery all succeed;
the badge count is exact and tapping the notification opens the conversation.

## 3. Sentry

1. Create a Sentry iOS project for bundle ID `app.sideseat.mobile`.
2. Put its DSN in untracked `ios-native/Configuration/Local.xcconfig`:

   ```xcconfig
   SIDESEAT_CRASH_DSN = https:/$()/public-key@ingest-host/project-id
   ```

3. Create a scoped Sentry `org:ci` token for dSYM upload. Store a local release
   token in the macOS Keychain (or use the release CI secret store):

   ```sh
   security add-generic-password \
     -a "$USER" \
     -s app.sideseat.mobile.sentry-dsym \
     -w '<SENTRY_AUTH_TOKEN>' \
     -U
   ```

   Keep non-secret `SENTRY_ORG` and `SENTRY_PROJECT` values in the ignored local
   configuration. The upload script accepts `SENTRY_AUTH_TOKEN` from CI and
   otherwise reads the Keychain item. Never put the token in an `.xcconfig` file.
4. Run `npm ci` before archiving. The `Upload Production dSYMs to Sentry` build
   phase runs only for a Production archive, uploads its exact dSYM with the
   pinned local CLI and fails the archive if credentials, CLI or symbols are
   unavailable. Development and ordinary build actions do not upload anything.
5. Send one intentional non-PII test event and confirm it is symbolicated.

Pass evidence: the event contains the release/build, resolves native symbols and
does not attach default personal data.

Local implementation evidence (2026-08-11): the upload script's Development,
ordinary-build, missing-credential, environment-token and Keychain-token branches
pass executable tests. A complete signed Production archive uploaded one real dSYM
to `sideseat/apple-ios`; Sentry reported `UPLOADED` and `dwarfdump` reported the
same arm64 UUID for the app binary and dSYM. This does not replace the real
symbolicated event check above.

## 4. Neon recovery

1. In Neon, confirm the production plan retains at least seven days of restore
   history. Upgrade before release if the current plan cannot provide this.
2. Create an isolated branch from a recent production restore point.
3. Connect only the local recovery test process to that branch. Never replace the
   production Vercel database variables during the drill.
4. Verify Prisma migration status, user count, conversation count, calendar event
   count and a read-only login flow.
5. Delete the isolated branch after evidence is captured.
6. Set Vercel Production values:
   - `DATABASE_BACKUP_PROVIDER=neon`
   - `DATABASE_BACKUP_RETENTION_DAYS=<actual retention>`
   - `DATABASE_RESTORE_TESTED_AT=<ISO timestamp of the completed drill>`

Pass evidence: a restore made within the last 90 days opens successfully and key
counts match the selected restore point.

## 5. Cron heartbeats

Create four independent checks in the monitoring provider. Vercel schedules are
UTC; allow a generous grace window on Hobby deployments.

| Job | Schedule | Suggested grace |
| --- | --- | --- |
| `chat-realtime-retention` | Daily 03:15 UTC | 2 hours |
| `student-verification-retention` | Daily 03:45 UTC | 2 hours |
| `tum-course-catalog` | Sunday 02:30 UTC | 4 hours |
| `lmu-course-catalog` | Sunday 03:30 UTC | 4 hours |

Add one Vercel Sensitive variable named `CRON_MONITOR_URLS`. Its one-line JSON
must contain a distinct success and failure URL for every job:

```json
{"chat-realtime-retention":{"successUrl":"https://monitor.example/a","failureUrl":"https://monitor.example/a/fail"},"student-verification-retention":{"successUrl":"https://monitor.example/b","failureUrl":"https://monitor.example/b/fail"},"tum-course-catalog":{"successUrl":"https://monitor.example/c","failureUrl":"https://monitor.example/c/fail"},"lmu-course-catalog":{"successUrl":"https://monitor.example/d","failureUrl":"https://monitor.example/d/fail"}}
```

Pass evidence: a manual success marks only its own job healthy, a forced failure
alerts, and a missed-run test alerts after the configured grace period.

## 6. StoreKit decision for v1

Set `STOREKIT_SUPPORT_ENABLED=0` in Vercel Production. The optional support entry
stays hidden and no StoreKit product or transaction credential is required for
the first release.

Before enabling it in a later release, create all products in App Store Connect,
set strict server verification and complete sandbox purchase, pending, cancel,
failure and idempotent transaction tests. The production validator rejects a
partially configured enabled state.

## 7. Final configuration gate

Vercel Sensitive variables and Marketplace-provisioned database/Blob values are
not downloadable in plaintext through the CLI. A local `check:production` may
therefore report those existing protected values as missing. Run the final
validator inside the Vercel Production build/CI environment; use
`vercel env ls production` locally only to confirm key presence, never to
expose values.

Vercel Preview and ordinary CI builds intentionally skip Prisma migrations against
remote databases. Before promoting a reviewed release, back up the target, inspect
`prisma migrate status`, and run `prisma migrate deploy` once from the controlled
release environment. `ALLOW_REMOTE_DATABASE_MIGRATIONS=1` is a one-shot approval
for a reviewed remote target; it must not remain enabled as a project-wide Preview
or Production variable.

Deployment audit on 2026-08-11 found that the previous policy allowed a Preview
build to apply `20260808210000_calendar_category_templates` to the shared Neon
database. The migration completed successfully. The policy was then changed and
covered by regression tests; reviewed Preview `dpl_GKneBJeQA6VEnd8fiZDLhHDizPn4`
logs an explicit migration skip and completes READY without schema writes.

After all manual values are deployed, run in the secure release environment:

```sh
npm run test:release:config
npm run check:production
ios-native/scripts/validate-production-build.sh
```

Then complete the automated and real-device gates in
`APP_STORE_RELEASE_CHECKLIST.md`.
