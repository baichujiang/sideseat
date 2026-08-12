# SideSeat App Store Release Checklist

This checklist is a release gate. Do not upload an archive until every required
item is complete and the evidence is attached to the release ticket.
Use `PRODUCTION_CONFIGURATION_RUNBOOK.md` for the exact external setup and
acceptance steps; this file remains the final go/no-go checklist.

## 1. Public infrastructure

- [x] Production web/API origin is public HTTPS and `NEXT_PUBLIC_APP_URL` matches it.
- [x] `Configuration/Local.xcconfig` sets a real `SIDESEAT_API_BASE_URL` and
  host-only `SIDESEAT_ASSOCIATED_DOMAIN`; no `.invalid`, localhost or IP address.
- [x] `https://<associated-domain>/.well-known/apple-app-site-association` returns
  JSON without a redirect and contains the production Team ID plus
  `app.sideseat.mobile`.
- [x] Privacy URL and support URL are public, stable and accessible without login.
- [ ] Resend sending domain is verified; signup, verification and account recovery
  emails were received outside the development network.
- [ ] `NEXT_PUBLIC_SUPPORT_EMAIL` points to a real, monitored inbox; direct mail,
  in-app feedback and an outbound reply all pass. The owner accepts that this
  address is publicly visible until a domain mailbox replaces it.

## 2. Apple account and signing

- [ ] The App ID `app.sideseat.mobile` exists and enables Push Notifications and
  Associated Domains.
- [ ] Distribution certificate/profile includes both entitlements.
- [ ] `DEVELOPMENT_TEAM` is set locally or in CI; secrets are not committed.
- [x] Environment-scoped APNs keys are deployed: `APNS_SANDBOX_KEY_ID/P8` for
  signed Debug builds and `APNS_PRODUCTION_KEY_ID/P8` for TestFlight/App Store,
  plus `APNS_TEAM_ID`, `APNS_BUNDLE_ID=app.sideseat.mobile` and
  `APNS_USE_SANDBOX=0`.
- [ ] The native push-device environment migration is deployed. A Debug device
  registers as `sandbox`, and a Release/TestFlight device registers as `production`.
- [ ] Signed Debug and TestFlight physical-device builds receive foreground,
  background and cold-launch notifications through their matching APNs endpoints.
- [ ] Export-compliance answers match the app's actual encryption use; attach any
  documentation App Store Connect requests.

## 3. StoreKit and commercial settings

- [ ] The release explicitly sets `STOREKIT_SUPPORT_ENABLED=0` when optional
  support purchases are not included; the native entry remains hidden.
- [ ] If support purchases are enabled, consumable products exist in App Store
  Connect with names, prices and localizations matching
  `Configuration/SideSeat.storekit`.
- [ ] If enabled, `STOREKIT_VERIFICATION_MODE=strict` and the App Store Server API
  issuer, key ID and private key are deployed.
- [ ] If enabled, sandbox purchase, pending/cancel/error handling and server
  verification pass on a real device before the entry is exposed.

## 4. Privacy, safety and review

- [ ] App Store Connect privacy answers match `APP_STORE_PRIVACY_MATRIX.md` and
  `PrivacyInfo.xcprivacy`, including all enabled third-party SDK behavior.
- [ ] The public privacy policy has been reviewed for the launch markets and names
  the real data controller, contact/address, lawful bases, user rights, retention,
  international transfers and complaint route. Do not publish invented placeholders.
- [ ] App Store Connect uses Apple's standard EULA or an approved custom EULA, and
  the in-app community rules/UGC policy has completed legal review.
- [ ] Account deletion is discoverable in the app and removes the account without
  requiring an external support request.
- [ ] Block and report flows work for users, posts, messages and feedback content;
  administrator moderation can complete the review loop.
- [ ] Student verification, graduate status and visible school labels are covered
  in App Review notes with a usable reviewer account.
- [ ] Camera/photo, location, microphone, speech and notification prompts appear
  only from the related user action and explain the purpose.
- [ ] `SIDESEAT_CRASH_DSN` points to the production Sentry project; a test issue is
  received, symbolicated and contains no default PII.
- [x] Sentry dSYM upload is configured through the guarded Production archive
  phase, with its scoped token in the local macOS Keychain or release CI secret
  store and outside the repository.

## 5. Reliability and operations

- [ ] Production migrations run only as a reviewed release step. Preview and CI
  builds skip remote migrations by default; any remote-database migration requires
  the explicit one-shot `ALLOW_REMOTE_DATABASE_MIGRATIONS=1` approval.
- [ ] Native calendar reminders are reconciled as iOS local notifications after
  schedule sync; they do not depend on a minute-level server cron.
- [ ] Remote plan/activity changes send event-driven APNs updates. Daily Hobby
  cron is reserved for retention, catalog maintenance and browser recovery work.
- [ ] `CRON_MONITOR_URLS` contains distinct success/failure heartbeat URLs for
  every job in `vercel.json`; each monitor alerts on failures and missed runs.
- [ ] Database provider, retention and last restore drill are recorded in
  `DATABASE_BACKUP_PROVIDER`, `DATABASE_BACKUP_RETENTION_DAYS` and
  `DATABASE_RESTORE_TESTED_AT`.
- [ ] Backups or snapshots retain at least seven days. A production copy was
  restored into an isolated database within the last 90 days and key counts/login
  were verified without writing to production.
- [ ] Logs, APNs failures, email failures, API latency and database capacity have
  an owner and an alert destination.

## 6. Automated release checks

Run from the repository root with production secrets exported only in the secure
release environment:

```sh
npm ci
npm run lint
npx tsc --noEmit --incremental false
npm run test:release:config
npm run check:openapi:v1
npm run check:production
npm run build
ios-native/scripts/generate-openapi-client.sh
ios-native/scripts/generate-project.sh
xcodebuild test -project ios-native/SideSeat.xcodeproj -scheme SideSeat-Development -destination "platform=iOS Simulator,id=<SIMULATOR_ID>" CODE_SIGNING_ALLOWED=NO
SIDESEAT_RUN_REAL_PHOTO_TEST=1 xcodebuild test -project ios-native/SideSeat.xcodeproj -scheme SideSeat-Development -destination "platform=iOS Simulator,id=<SIMULATOR_ID>" -only-testing:SideSeatUITests/AuthenticationUITests/testCalendarSavesScheduleImageUsingRealPhotoLibrary CODE_SIGNING_ALLOWED=NO
SIM_DEVICE_ID=<SIMULATOR_ID> npm run ios:test-performance
```

For a compile-only local build, set `SKIP_DATABASE_MIGRATIONS=1`. Do not use
`ALLOW_REMOTE_DATABASE_MIGRATIONS=1` unless the remote migration target has been
reviewed and backed up for that release. Vercel Preview and ordinary CI builds do
not receive remote migration authority automatically.

- [ ] CI is green, generated OpenAPI/Xcode project drift checks are clean, and
  the isolated 10-test performance gate artifacts are attached.
- [ ] Production configuration validator passes with the actual release values.
- [ ] Unit, API integration and iOS UI tests have attached result artifacts.
- [ ] `AccessibilityAuditUITests` passes all seven system audits, including the
  largest Dynamic Type checks for Discover, Create Plan, Courses, Chats and Me.
- [ ] Real schedule-image generation writes successfully to the simulator photo
  library with `SIDESEAT_RUN_REAL_PHOTO_TEST=1`; the result artifact is attached.

## 7. TestFlight and App Store Connect

Current device evidence (2026-08-11): a signed `SideSeat-Development` arm64 build
was installed and launched on a paired iPhone 16 Pro Max. Device preflight verifies
the production API, iPhone-only family, bundle ID, Development APNs and Associated
Domain from the final signed app. Production logs confirm authenticated refresh,
Inbox, Home Schedule and sandbox push-token registration from the device. The
physical-device Swift suite passed 181/181. UI Automation is enabled and all 13
critical direct-chat journeys have a passing physical-device result. The contiguous
run passed 12/13; its only failure was a dense-scroll wall-clock assertion after an
iOS notification banner interrupted XCUI, while the app still recorded zero hitches.
The clean isolated rerun passed three rounds at 20.319 seconds average with zero
hitches. Chat input main-loop latency measured 8.153 ms on first focus, 2.364 ms
continuously and 2.219 ms after refocus. This Development-device evidence does not
satisfy the Production APNs or TestFlight checks below.

Upload evidence (2026-08-11): `SideSeat-Production` version `1.0.0 (1)` passed
App Store Connect analysis and uploaded successfully. Apple accepted the package
and started TestFlight processing. The remaining checks begin after the build is
available to internal testers.

- [x] Version/build number is unique; archive uses `SideSeat-Production` and the
  package was accepted for TestFlight processing.
- [ ] App name, subtitle, description, keywords, category, age rating, copyright,
  support/privacy URLs and reviewer contact are complete.
- [ ] Required iPhone screenshots show current production UI and contain no test
  accounts, internal labels or placeholder content.
- [ ] Review notes explain student verification, location sharing, notifications,
  user-generated content moderation and optional StoreKit support purchases.
- [ ] Internal TestFlight smoke test passes on the oldest supported iOS version and
  at least one current iPhone. External testers complete the core journey.
- [ ] The release owner records rollout, rollback, monitoring and first-response
  plans before submitting for review.
