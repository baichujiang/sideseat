# SideSeat Native iOS

**Status:** Current platform guide

**Last updated:** 2026-10-15

**Governing product:** [Product](./PRODUCT.md)

**Scope:** Native architecture, project generation, environments, build, Calendar sync and platform integration

## 1. Architecture

`ios-native/` is the production SwiftUI iPhone client. The legacy Capacitor
project is [archived and frozen](../archive/2026-10-15-retired/README.md).
Check [deployed state](./DEPLOYED_STATE.md) before using a dated build record.

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

Development, Preview, Staging and Production configuration live in
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

Set `DEVICE_UDID` to choose a paired hardware iPhone. Local migration/integration tests must use an isolated database. Explicitly
owner-authorized release smoke/phone QA may use fresh disposable production
accounts, with no shared seed fixtures or real-user mutations.

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

- Messages offers native SwiftUI time polls through `TimePollSheet`,
  `TimePollStore` and Sideseat's authenticated `/api/v1/time-polls` service.
  Sideseat stores responses and calculates common/highest-attendance windows.
  The drag/erase grid uses 30-minute display/edit cells with automatic save,
  preserving existing 15-minute IDs and partial responses. There is no
  provider webview, advertising or When2meet save service in the current client.
  See the [time poll contract](./TIME_POLLS.md) and
  [native delivery QA](./qa/2026-10-15-native-time-polls.md).
- Opt-in native five-account physical QA is at
  `ios-native/phone-qa/native-time-poll99/run.sh`; use isolated temporary accounts
  and explicit task authority. Preview 98's provider code and runner are
  [archived](../archive/2026-10-15-retired/README.md) and must not be executed.
- The Plan editor's Chinese entry is **智能约时间**. It uses
  `SmartTimeSuggestionSheet` to recommend the current user's calendar windows.
  The Messages entry **一起定时间** opens the separate multi-person time poll.
  There is no conversion from a poll result to a confirmed Plan yet.
- `PrivacyInfo.xcprivacy` describes required manifest APIs.
- Associated Domains and AASA provide approved Universal Links.
- APNs device registration uses `/api/v1/push/devices` after sign-in.
- Sentry starts only when a crash DSN is configured and default PII is disabled.
- Production archives upload the exact app dSYM through guarded release tooling.
- StoreKit support remains hidden while the server feature is disabled.

Credentials for signing, APNs and Sentry live in Keychain, CI or deployment
secrets—not Git.

## 7. Current release state

Preview `1.0.0 (99)` is installed with native time polls and Sideseat-owned
storage. The native source is `02300a46027c8f0a1952561098f0169d98cbe9be`.
The production API deployment is `dpl_7osq5AhK8d7Bsxh3hs2tQUHE4vRi`.
Installation, ordinary launch and five-account phone verification are recorded in
the [Preview 99 delivery](./releases/2026-10-15-preview99-native-time-polls.md).
The [deployment audit](./qa/2026-10-15-deployment-and-retirement.md) independently
rechecked installed versions, live configuration and the actual entry locations.

Ordinary SideSeat `1.0.0 (97)` is independently installed on the same phone.
Its upload/processing/internal distribution was recorded on 2026-10-08 in the
[TestFlight 97 record](./releases/2026-10-08-testflight97.md). This audit did not
re-query Apple distribution status. Preview 98 is superseded and archived.
TestFlight distribution does not establish App Store approval or replace current
physical-device, privacy, APNs or tester acceptance gates.

## Unified planning delivery — Preview 100

Plans → + offers availability collection and direct-time creation. Both use the
same manual invitation/confirmation view and persisted shared plan. Calendar
projections are read-only and Manage Plan returns to that root. Existing chat
plans remain visible under their existing consent rules. See
[Unified plans](./UNIFIED_PLANS.md), [QA](./qa/2026-10-15-unified-plans.md) and
[release receipt](./releases/2026-10-15-preview100-unified-plans.md).
