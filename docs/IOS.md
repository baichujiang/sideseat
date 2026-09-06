# SideSeat Native iOS

**Status:** Current platform guide

**Last updated:** 2026-09-02

**Governing product:** [Product](./PRODUCT.md)

**Scope:** Native architecture, project generation, environments, build, Calendar sync and platform integration

## 1. Architecture

`ios-native/` is the production SwiftUI iPhone client. The legacy Capacitor
project is rollback/regression material only.

- minimum platform: iOS 17;
- project source: `ios-native/project.yml`;
- generated Xcode project: `ios-native/SideSeat.xcodeproj`;
- API source: `openapi/v1.json`;
- generated Swift API: `ios-native/SideSeat/Generated/OpenAPI`;
- design rules: [Design System](./DESIGN_SYSTEM.md);
- release procedure: [Release](./RELEASE.md).

Generated API and Xcode project files are committed and checked for drift. Never
edit generated OpenAPI files manually.

## 2. Generate

Requirements: macOS, Xcode 26+, an iPhone Simulator runtime, Node dependencies and
network access for first-time pinned tooling bootstrap.

```sh
ios-native/scripts/generate-openapi-client.sh
ios-native/scripts/generate-project.sh
```

The project generator is pinned to XcodeGen 2.45.4. Swift OpenAPI Generator and
runtime versions are pinned by the workspace.

## 3. Environments

Development, Staging and Production configuration live in
`ios-native/Configuration/`.

- Development defaults to `https://api.sideseat.de` for Simulator/device use.
- Staging remains `.invalid` until a public staging origin is approved.
- Production requires HTTPS and rejects loopback, IP and `.invalid` API hosts.
- Local overrides use ignored `Configuration/Local.xcconfig`, copied from its
  example; secrets never enter committed xcconfig files.
- A temporary local server may be selected with
  `SIDESEAT_API_BASE_URL=http://127.0.0.1:3104`.

## 4. Build and test

Generate first, then select an available iPhone Simulator:

```sh
xcrun simctl list devices available

xcodebuild test \
  -project ios-native/SideSeat.xcodeproj \
  -scheme SideSeat-Development \
  -configuration Development \
  -destination "platform=iOS Simulator,id=<SIMULATOR_ID>" \
  -derivedDataPath ios-native/DerivedData \
  CODE_SIGNING_ALLOWED=NO
```

Physical-device compile/signing preflight:

```sh
npm run ios:device-preflight
```

Set `DEVICE_UDID` to choose a paired hardware iPhone. Native migration/integration
tests must use an isolated database, never a shared production database.

## 5. Calendar synchronization

The server is the schedule source of truth. iOS caches the last successful
per-user schedule and schedules exact local reminders for synchronized entries.

```text
Calendar mutation / foreground refresh
→ GET /api/v1/home/schedule
→ per-user device cache
→ reconcile pending local notifications
→ iOS delivers reminder
```

Current policy:

- first render may use the last successful cache and then revalidate;
- pull-to-refresh always requests the server;
- event create/edit/move/duplicate/delete reloads immediately;
- foreground refreshes when last successful sync is at least 60 seconds old;
- loaded window is approximately 14 days back and 45 days forward;
- failed refresh preserves cached schedule with a soft warning;
- sign-out clears cache and all SideSeat calendar reminders.

Local reminder defaults:

- 15-minute lead;
- SideSeat events, subscribed entries and course occurrences;
- 45-day horizon and nearest 48 pending reminders;
- stable occurrence-aware identifiers under `sideseat.calendar.`;
- notification tap routes to Calendar.

Remote participant changes use event-driven APNs. Exact ordinary reminders do not
depend on a minute-level server cron because iOS controls background execution.

## 6. Platform integrations

- `PrivacyInfo.xcprivacy` describes required manifest APIs.
- Associated Domains and AASA provide approved Universal Links.
- APNs device registration uses `/api/v1/push/devices` after sign-in.
- Sentry starts only when a crash DSN is configured and default PII is disabled.
- Production archives upload the exact app dSYM through guarded release tooling.
- StoreKit support remains hidden while the server feature is disabled.

Credentials for signing, APNs and Sentry live in Keychain, CI or deployment
secrets—not Git.

## 7. Current release state

Version `1.0.0` build `29` was uploaded to TestFlight on 2026-09-02. See its
[release record](./releases/2026-09-02-testflight-29.md). TestFlight upload is not
App Store approval and does not replace current physical-device, privacy, APNs or
tester acceptance gates.
