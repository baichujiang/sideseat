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

- Development defaults to `http://127.0.0.1:3000` for Simulator use.
- Staging and Production intentionally use `.invalid` hosts until their public
  HTTPS API domains are approved.
- Optional local overrides: copy `Configuration/Local.xcconfig.example` to
  `Configuration/Local.xcconfig` (gitignored) and set `SIDESEAT_API_BASE_URL`.
- A temporary local API can also be supplied at build time with
  `SIDESEAT_API_BASE_URL=http://127.0.0.1:3104`.

The Production runtime rejects non-HTTPS, loopback and `.invalid` API URLs.

## Release scaffolding already in-repo

- `PrivacyInfo.xcprivacy` privacy manifest
- `AppIcon.appiconset` uses the brand mark from `public/icons/app-icon.png`
  (coral → magenta gradient wordmark). In-app logo asset: `BrandMark`.
- Brand colors live in `SideSeat/Core/Design/SideSeatTheme.swift` and the
  `AccentColor` asset (#FB4185 rose).
- `SideSeat.entitlements` with `aps-environment` + `applinks:sideseat.de`
- `public/.well-known/apple-app-site-association` (replace `TEAMID` with Apple Team ID)
- Push token register via `POST /api/v1/push/devices` after sign-in
- Settings Privacy / Help center links + StoreKit entry gated by `storeKitSupport`
- Crash reporting entry point (`CrashReporting.start`) waits for `SIDESEAT_CRASH_DSN`

Still external (not local): Apple signing/TestFlight, APNs `.p8` secrets, ASC
consumable products, production API DNS, crash project DSN.

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

## Current scope

The native target currently provides the authenticated app shell, Keychain-backed
refresh sessions, API client foundation, independent tab navigation, deep-link
parsing, localization, and deterministic unit/UI launch states. Feature screens
are being migrated incrementally according to
`docs/ios-native/IOS_NATIVE_MIGRATION_MASTER.md`; the shell is not yet an
App Store-complete client.
