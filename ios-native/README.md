# SideSeat Native iOS

This directory contains the native SwiftUI iPhone client. The existing Capacitor
client under `ios/` remains available as a rollback path during migration.

## Requirements

- macOS with Xcode 26 or newer
- An installed iPhone Simulator runtime
- Network access the first time XcodeGen is bootstrapped

The project generator is pinned to XcodeGen 2.45.4 and its release archive is
verified with SHA-256 before execution. No global XcodeGen installation is used.

## Generate the project

From the repository root:

```sh
ios-native/scripts/generate-openapi-client.sh
ios-native/scripts/generate-project.sh
```

`ios-native/project.yml` is the source of truth. Commit both the specification
and the generated `SideSeat.xcodeproj`; CI rejects generator drift.

`openapi/v1.json` is the sole native API contract source. The OpenAPI script uses
Apple Swift OpenAPI Generator 1.13.0 to replace
`SideSeat/Generated/OpenAPI`; generated files must not be edited manually. The
generated client compiles against an exact Swift OpenAPI Runtime 1.12.0 package.

## Environments

The app has Development, Staging and Production configurations in
`ios-native/Configuration/`.

- Development defaults to the deployed `https://api.sideseat.de` backend so
  Simulator and signed-device builds work without a LAN server.
- Staging intentionally uses an `.invalid` host until its public HTTPS API
  domain is approved. Production uses `https://api.sideseat.de`; its DNS and
  Vercel certificate must be verified before distributing an archive.
- Optional local overrides: copy `Configuration/Local.xcconfig.example` to
  `Configuration/Local.xcconfig` (gitignored) and set the API URL, Associated
  Domains host, Apple team and crash DSN.
- A temporary local API can be supplied at build time with
  `SIDESEAT_API_BASE_URL=http://127.0.0.1:3104`.

The Production runtime rejects non-HTTPS, loopback and `.invalid` API URLs.

## Release scaffolding already in-repo

- `PrivacyInfo.xcprivacy` privacy manifest
- `AppIcon.appiconset` uses the brand mark from `public/icons/app-icon.png`
  (coral → magenta gradient wordmark). In-app logo asset: `BrandMark`.
- Brand colors live in `SideSeat/Core/Design/SideSeatTheme.swift` and the
  `AccentColor` asset (#FB4185 rose).
- `SideSeat.entitlements`: generated from `project.yml` with
  `aps-environment` (`$(APS_ENVIRONMENT)` - development in Development.xcconfig,
  production in Staging/Production) and
  `applinks:$(SIDESEAT_ASSOCIATED_DOMAIN)`
- `/.well-known/apple-app-site-association` served by Next.js using
  `APPLE_TEAM_ID` or `APNS_TEAM_ID` (set in production env; see `.env.example`)
- Push token register via `POST /api/v1/push/devices` after sign-in
- Settings Privacy / Help center links + StoreKit entry gated by `storeKitSupport`
- Sentry Cocoa crash reporting starts only when `SIDESEAT_CRASH_DSN` is set and
  disables default PII collection

Still external (not local): Apple signing/TestFlight (`DEVELOPMENT_TEAM` in
`Configuration/Local.xcconfig`), APNs `.p8` secrets, ASC consumable products,
production API DNS, crash project DSN, production `APPLE_TEAM_ID` for Universal Links.

Before an archive is distributed, complete
[`docs/ios-native/APP_STORE_RELEASE_CHECKLIST.md`](../docs/ios-native/APP_STORE_RELEASE_CHECKLIST.md)
and keep App Store Connect answers aligned with
[`docs/ios-native/APP_STORE_PRIVACY_MATRIX.md`](../docs/ios-native/APP_STORE_PRIVACY_MATRIX.md).

## Build and test

List available Simulator devices:

```sh
xcrun simctl list devices available
```

Replace `<SIMULATOR_ID>` below with an available iPhone UDID:

```sh
xcodebuild build \
  -project ios-native/SideSeat.xcodeproj \
  -scheme SideSeat-Development \
  -configuration Development \
  -destination "platform=iOS Simulator,id=<SIMULATOR_ID>" \
  -derivedDataPath ios-native/DerivedData \
  CODE_SIGNING_ALLOWED=NO

xcodebuild test \
  -project ios-native/SideSeat.xcodeproj \
  -scheme SideSeat-Development \
  -configuration Development \
  -destination "platform=iOS Simulator,id=<SIMULATOR_ID>" \
  -derivedDataPath ios-native/DerivedData \
  CODE_SIGNING_ALLOWED=NO
```

To exercise real login locally, run the Next.js API with the isolated test
database and build the Development scheme against that server. Do not run native
migration tests against a shared or production database.

## Release state

The native target now contains the main authentication, profile, student
verification, calendar, course, discovery, chat, schedule sharing, reporting,
feedback and account deletion flows. It is a release candidate, not a submitted
App Store build: public infrastructure, Apple credentials, StoreKit products,
privacy answers, signed-device validation and TestFlight review remain explicit
release gates in the checklist above.
