# SideSeat Release

**Status:** Current release procedure and go/no-go gate

**Last updated:** 2026-09-02

**Scope:** Shared database migrations, Vercel Production, native signing, TestFlight, App Store and recovery

Per-build facts belong in `docs/releases/`. This document contains reusable
procedure only. A previous successful build never certifies a new build.

## 1. Authority and evidence

Production migration, Vercel Production deployment, signing/Keychain access,
Sentry dSYM upload and TestFlight/App Store upload require explicit authority for
the current operation.

Create one release record containing:

- version/build and date;
- source revision/workspace state;
- exact database migration batch;
- Vercel production deployment ID and health-check time;
- archive/export/upload result;
- app dSYM UUID and Sentry result;
- physical-device/TestFlight smoke-test result;
- outstanding gates.

Never store credentials, database URLs, `.p8`, DSNs with secrets or tokens in Git.

## 2. Database and Vercel

Before deploying:

1. inspect the target and take/review an appropriate backup or restore point;
2. run `prisma migrate status` against the reviewed target;
3. apply forward migrations once from the controlled release environment;
4. deploy the complete reviewed workspace to Vercel Production;
5. record the exact migration and deployment IDs;
6. verify API health, AASA, Privacy, Support and approved public share routes;
7. run an authenticated two-account smoke test for changed product flows.

Preview and ordinary CI builds do not receive remote migration authority.
`ALLOW_REMOTE_DATABASE_MIGRATIONS=1` is a one-shot reviewed authorization, not a
persistent project variable.

Required stable production configuration includes the API/app origins, database,
Blob, email, APNs, support contact, Apple Team/bundle identity, feature flags and
monitoring values appropriate to the release. Sensitive provider values may be
verified by presence without printing plaintext.

## 3. Native configuration and signing

- bundle ID: `app.sideseat.mobile`;
- Production API and Associated Domain must be HTTPS and non-placeholder;
- Distribution profile must include Push Notifications and Associated Domains;
- `ITSAppUsesNonExemptEncryption` must match the actual build; currently the app
  declares that it does not include non-exempt encryption;
- generate OpenAPI client and Xcode project before archive;
- archive the Production scheme with a unique build number;
- validate the signed app's API URL, bundle ID, device family, entitlements and
  embedded provisioning profile.

If encryption behavior changes, re-evaluate export compliance before another
submission.

## 4. APNs

Production keeps separate Sandbox and Production APNs credentials plus Team and
bundle identity. `APNS_USE_SANDBOX=0` selects production delivery for TestFlight,
while signed Development devices still register their sandbox environment.

Pass evidence on a physical/TestFlight device:

- token registers as the correct environment;
- foreground, background and cold-launch delivery work;
- badge count is correct;
- tapping opens the intended Conversation/Plan destination;
- lock-screen payload contains no sensitive message or Plan content.

## 5. Sentry and dSYM

Production archives require the configured DSN, organization, project and scoped
upload token. Store the local token in macOS Keychain or release CI secrets. The
guarded archive phase uploads the exact SideSeat app dSYM and fails if required app
symbols or credentials are unavailable.

Record the app binary/dSYM UUID and confirm one real non-PII event is symbolicated
with the correct version/build. A warning for a prebuilt vendor framework dSYM is
tracked separately and does not replace verification of the SideSeat app dSYM.

## 6. Privacy, safety and review

Before distribution, verify:

- App Store Connect answers match [Privacy](./PRIVACY.md), the production build
  and enabled providers;
- account deletion is available in app;
- report and Block flows close the moderation/safety loop;
- camera, photo, microphone, speech, location and notification prompts follow a
  related user action and explain purpose;
- student verification and UGC behavior are covered in review notes;
- support/privacy URLs are public and the support inbox is monitored;
- StoreKit stays hidden when `STOREKIT_SUPPORT_ENABLED=0`; if enabled later,
  products and strict server verification receive a separate review.

## 7. Automated gates

Run relevant current checks from the repository root in a secure environment:

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
```

Then run current Swift/unit/API/UI suites and attach artifacts. Required native
coverage includes the changed end-to-end path, accessibility, largest Dynamic
Type, Light/Dark and an actual signed-device smoke test. Build-specific failures
cannot be waived by historical counts.

## 8. TestFlight and App Store gate

TestFlight upload is allowed only after archive validation and symbol upload. App
Store submission additionally requires:

- current metadata, category, age rating, URLs and reviewer contact;
- screenshots from the current production UI with no internal fixtures;
- complete privacy and export-compliance answers;
- internal smoke test on the oldest supported iOS and a current device;
- tester acceptance of the core flow;
- named rollout, rollback, monitoring and first-response owner.

## 9. Recovery and monitoring

- Neon must provide a verified restore history appropriate to the release; perform
  an isolated restore drill at least every 90 days and record provider, retention
  and timestamp.
- Cron jobs need independent success/failure monitoring and missed-run alerts.
- Monitor logs, APNs, email, API latency, database capacity and Sentry after rollout.
- Rollback must not reverse destructive migrations. Use forward repair, feature
  kill switches and compatible older clients where appropriate.

Current recorded build: [TestFlight 1.0.0 (32)](./releases/2026-09-07-testflight-32.md).
