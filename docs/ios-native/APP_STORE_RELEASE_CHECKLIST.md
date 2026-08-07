# SideSeat App Store Release Checklist

This checklist is a release gate. Do not upload an archive until every required
item is complete and the evidence is attached to the release ticket.

## 1. Public infrastructure

- [ ] Production web/API origin is public HTTPS and `NEXT_PUBLIC_APP_URL` matches it.
- [ ] `Configuration/Local.xcconfig` sets a real `SIDESEAT_API_BASE_URL` and
  host-only `SIDESEAT_ASSOCIATED_DOMAIN`; no `.invalid`, localhost or IP address.
- [ ] `https://<associated-domain>/.well-known/apple-app-site-association` returns
  JSON without a redirect and contains the production Team ID plus
  `app.sideseat.mobile`.
- [ ] Privacy URL and support URL are public, stable and accessible without login.
- [ ] Resend sending domain is verified; signup, verification and account recovery
  emails were received outside the development network.

## 2. Apple account and signing

- [ ] The App ID `app.sideseat.mobile` exists and enables Push Notifications and
  Associated Domains.
- [ ] Distribution certificate/profile includes both entitlements.
- [ ] `DEVELOPMENT_TEAM` is set locally or in CI; secrets are not committed.
- [ ] APNs production key values are deployed: `APNS_KEY_ID`, `APNS_TEAM_ID`,
  `APNS_KEY_P8`, `APNS_BUNDLE_ID=app.sideseat.mobile`, `APNS_USE_SANDBOX=0`.
- [ ] The native push-device environment migration is deployed. A Debug device
  registers as `sandbox`, and a Release/TestFlight device registers as `production`.
- [ ] Signed Debug and TestFlight physical-device builds receive foreground,
  background and cold-launch notifications through their matching APNs endpoints.
- [ ] Export-compliance answers match the app's actual encryption use; attach any
  documentation App Store Connect requests.

## 3. StoreKit and commercial settings

- [ ] Consumable support products exist in App Store Connect with approved names,
  prices and localizations matching `Configuration/SideSeat.storekit`.
- [ ] `STOREKIT_SUPPORT_ENABLED=1` and `STOREKIT_VERIFICATION_MODE=strict`.
- [ ] App Store Server API issuer, key ID and private key are deployed.
- [ ] Sandbox purchase, restore/error handling and server verification pass on a
  real device. The app never grants a successful state before verification.

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
- [ ] Sentry dSYM upload is configured through the release CI or App Store Connect
  integration, with scoped credentials kept outside the repository.

## 5. Reliability and operations

- [ ] Production migrations run only in the controlled deployment pipeline. Local
  remote-database migration requires the explicit one-shot
  `ALLOW_REMOTE_DATABASE_MIGRATIONS=1` approval.
- [ ] Native calendar reminders are reconciled as iOS local notifications after
  schedule sync; they do not depend on a minute-level server cron.
- [ ] Remote plan/activity changes send event-driven APNs updates. Daily Hobby
  cron is reserved for retention, catalog maintenance and browser recovery work.
- [ ] `CRON_MONITOR_URL` alerts on both failed runs and missing expected runs for
  reminders, realtime retention and course catalog jobs.
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
```

For a compile-only local build, set `SKIP_DATABASE_MIGRATIONS=1`. Do not use
`ALLOW_REMOTE_DATABASE_MIGRATIONS=1` unless the remote migration target has been
reviewed and backed up for that release.

- [ ] CI is green and generated OpenAPI/Xcode project drift checks are clean.
- [ ] Production configuration validator passes with the actual release values.
- [ ] Unit, API integration and iOS UI tests have attached result artifacts.

## 7. TestFlight and App Store Connect

- [ ] Version/build number is unique; archive uses `SideSeat-Production`.
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
