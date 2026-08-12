import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";

import {
  isApnsConfigured,
  apnsCredentialsForEnvironment,
  apnsBundleId,
  apnsHostForEnvironment,
  apnsUseSandbox,
  nativeClientApnsFeatures,
  normalizeApnsEnvironment,
} from "../../lib/push/apns-env";
import { buildApnsPayload } from "../../lib/push/apns-payload";
import { isStoreKitAppleApiConfigured } from "../../lib/api/v1/storekit-apple-env";

function readRepoFile(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("isApnsConfigured", () => {
  const keys = [
    "APNS_KEY_ID",
    "APNS_KEY_P8",
    "APNS_SANDBOX_KEY_ID",
    "APNS_SANDBOX_KEY_P8",
    "APNS_PRODUCTION_KEY_ID",
    "APNS_PRODUCTION_KEY_P8",
    "APNS_TEAM_ID",
    "APNS_BUNDLE_ID",
    "APNS_USE_SANDBOX",
  ] as const;
  const previous = new Map<string, string | undefined>();

  before(() => {
    for (const key of keys) {
      previous.set(key, process.env[key]);
    }
  });

  beforeEach(() => {
    for (const key of keys) delete process.env[key];
  });

  after(() => {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("uses a legacy key only for its declared default environment", () => {
    assert.equal(isApnsConfigured(), false);
    process.env.APNS_KEY_ID = "ABC123";
    process.env.APNS_TEAM_ID = "TEAM123";
    process.env.APNS_KEY_P8 = "not-a-real-key";
    process.env.APNS_USE_SANDBOX = "1";
    assert.equal(isApnsConfigured(), true);
    assert.equal(isApnsConfigured("sandbox"), true);
    assert.equal(isApnsConfigured("production"), false);
    assert.equal(apnsBundleId(), "app.sideseat.mobile");
  });

  it("selects independent credentials for Sandbox and Production", () => {
    process.env.APNS_TEAM_ID = "TEAM123";
    process.env.APNS_SANDBOX_KEY_ID = "SANDBOX123";
    process.env.APNS_SANDBOX_KEY_P8 = "sandbox-key";

    assert.equal(isApnsConfigured("sandbox"), true);
    assert.equal(isApnsConfigured("production"), false);
    assert.equal(apnsCredentialsForEnvironment("sandbox")?.keyId, "SANDBOX123");

    process.env.APNS_PRODUCTION_KEY_ID = "PRODUCTION123";
    process.env.APNS_PRODUCTION_KEY_P8 = "production-key";
    assert.equal(isApnsConfigured("production"), true);
    assert.equal(
      apnsCredentialsForEnvironment("production")?.keyId,
      "PRODUCTION123",
    );
  });

  it("prefers environment-scoped credentials over the legacy key", () => {
    process.env.APNS_TEAM_ID = "TEAM123";
    process.env.APNS_KEY_ID = "LEGACY123";
    process.env.APNS_KEY_P8 = "legacy-key";
    process.env.APNS_USE_SANDBOX = "1";
    process.env.APNS_SANDBOX_KEY_ID = "SANDBOX123";
    process.env.APNS_SANDBOX_KEY_P8 = "sandbox-key";

    assert.equal(apnsCredentialsForEnvironment("sandbox")?.keyId, "SANDBOX123");
  });

  it("honors APNS_USE_SANDBOX override", () => {
    process.env.APNS_USE_SANDBOX = "0";
    assert.equal(apnsUseSandbox(), false);
    process.env.APNS_USE_SANDBOX = "1";
    assert.equal(apnsUseSandbox(), true);
  });

  it("routes each device token to its own APNs environment", () => {
    assert.equal(
      apnsHostForEnvironment("sandbox"),
      "api.sandbox.push.apple.com",
    );
    assert.equal(apnsHostForEnvironment("production"), "api.push.apple.com");
    assert.equal(normalizeApnsEnvironment("sandbox"), "sandbox");
    assert.equal(normalizeApnsEnvironment("unexpected"), "production");
  });
});

describe("APNs payload", () => {
  it("carries routing, grouping, event context, and an exact unread badge", () => {
    assert.deepEqual(
      buildApnsPayload({
        title: "Plan accepted",
        body: "Mina accepted Library study",
        url: "/connections/connection-1",
        badge: 7.9,
        threadId: "connection:connection-1",
        category: "PLAN_UPDATE",
        data: {
          kind: "plan_accepted",
          connectionId: "connection-1",
          planId: "plan-1",
        },
      }),
      {
        aps: {
          alert: {
            title: "Plan accepted",
            body: "Mina accepted Library study",
          },
          sound: "default",
          badge: 7,
          "thread-id": "connection:connection-1",
          category: "PLAN_UPDATE",
        },
        url: "/connections/connection-1",
        kind: "plan_accepted",
        connectionId: "connection-1",
        planId: "plan-1",
      },
    );
  });

  it("normalizes negative badge counts to zero", () => {
    const payload = buildApnsPayload({
      title: "SideSeat",
      body: "Hello",
      badge: -2,
    });
    assert.equal(payload.aps.badge, 0);
  });

  it("keeps discover comment routing context in the APNs payload", () => {
    const payload = buildApnsPayload({
      title: "New comment",
      body: "Mina commented on Library study",
      url: "/discover/posts/post-123",
      category: "DISCOVER_COMMENT",
      data: {
        kind: "discover_comment",
        resource: "post",
        resourceId: "post-123",
      },
    });

    assert.deepEqual(payload, {
      aps: {
        alert: {
          title: "New comment",
          body: "Mina commented on Library study",
        },
        sound: "default",
        category: "DISCOVER_COMMENT",
      },
      url: "/discover/posts/post-123",
      kind: "discover_comment",
      resource: "post",
      resourceId: "post-123",
    });
  });
});

describe("native client APNs capability", () => {
  const keys = [
    "APNS_KEY_ID",
    "APNS_KEY_P8",
    "APNS_SANDBOX_KEY_ID",
    "APNS_SANDBOX_KEY_P8",
    "APNS_PRODUCTION_KEY_ID",
    "APNS_PRODUCTION_KEY_P8",
    "APNS_TEAM_ID",
    "APNS_USE_SANDBOX",
  ] as const;
  const previous = new Map<string, string | undefined>();

  before(() => {
    for (const key of keys) previous.set(key, process.env[key]);
  });

  beforeEach(() => {
    for (const key of keys) delete process.env[key];
  });

  after(() => {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("does not advertise TestFlight delivery when only Sandbox is configured", async () => {
    process.env.APNS_TEAM_ID = "TEAM123";
    process.env.APNS_SANDBOX_KEY_ID = "SANDBOX123";
    process.env.APNS_SANDBOX_KEY_P8 = "sandbox-key";

    const features = nativeClientApnsFeatures();

    assert.equal(features.apnsDelivery, false);
    assert.equal(features.apnsSandboxDelivery, true);
    assert.equal(features.apnsProductionDelivery, false);
  });

  it("advertises TestFlight delivery only with Production credentials", async () => {
    process.env.APNS_TEAM_ID = "TEAM123";
    process.env.APNS_PRODUCTION_KEY_ID = "PRODUCTION123";
    process.env.APNS_PRODUCTION_KEY_P8 = "production-key";

    const features = nativeClientApnsFeatures();

    assert.equal(features.apnsDelivery, true);
    assert.equal(features.apnsSandboxDelivery, false);
    assert.equal(features.apnsProductionDelivery, true);
  });
});

describe("isStoreKitAppleApiConfigured", () => {
  const keys = [
    "STOREKIT_APPLE_ISSUER_ID",
    "STOREKIT_APPLE_KEY_ID",
    "STOREKIT_APPLE_PRIVATE_KEY",
  ] as const;
  const previous = new Map<string, string | undefined>();

  before(() => {
    for (const key of keys) {
      previous.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  after(() => {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("is false without Apple API credentials", () => {
    assert.equal(isStoreKitAppleApiConfigured(), false);
  });

  it("is true when issuer, key id and private key are set", () => {
    process.env.STOREKIT_APPLE_ISSUER_ID = "issuer";
    process.env.STOREKIT_APPLE_KEY_ID = "key";
    process.env.STOREKIT_APPLE_PRIVATE_KEY = "pem";
    assert.equal(isStoreKitAppleApiConfigured(), true);
  });
});

describe("native iOS release assets", () => {
  it("loads optional local signing values in every app configuration", () => {
    for (const configuration of ["Development", "Staging", "Production"]) {
      const source = readRepoFile(
        `ios-native/Configuration/${configuration}.xcconfig`,
      );

      assert.match(source, /#include\? "Local\.xcconfig"/);
    }
  });

  it("declares push and Universal Link entitlements", () => {
    const entitlements = readRepoFile(
      "ios-native/SideSeat/SideSeat.entitlements",
    );
    const project = readRepoFile("ios-native/project.yml");

    assert.match(entitlements, /<key>aps-environment<\/key>/);
    assert.match(entitlements, /\$\(APS_ENVIRONMENT\)/);
    assert.match(entitlements, /com\.apple\.developer\.associated-domains/);
    assert.match(entitlements, /applinks:\$\(SIDESEAT_ASSOCIATED_DOMAIN\)/);
    assert.match(project, /aps-environment: \$\(APS_ENVIRONMENT\)/);
    assert.match(project, /com\.apple\.developer\.associated-domains:/);
  });

  it("registers Debug and Release device tokens with explicit APNs environments", () => {
    const source = readRepoFile(
      "ios-native/SideSeat/Core/Push/PushRegistration.swift",
    );

    assert.match(
      source,
      /#if DEBUG[\s\S]*return \.sandbox[\s\S]*return \.production/,
    );
    assert.match(source, /environment: NativeAPNsEnvironment\.current/);
  });

  it("serves only the Universal Link paths understood by the native router", () => {
    const aasa = readRepoFile(
      "app/.well-known/apple-app-site-association/route.ts",
    );

    assert.match(aasa, /\/discover\/posts\/\*/);
    assert.match(aasa, /\/discover\/activities\/\*/);
    assert.match(aasa, /\/share\/view\/\*/);
    assert.doesNotMatch(aasa, /webcredentials:/);
  });

  it("declares linked product data without tracking", () => {
    const manifest = readRepoFile(
      "ios-native/SideSeat/Resources/PrivacyInfo.xcprivacy",
    );
    const requiredTypes = [
      "Name",
      "EmailAddress",
      "PhoneNumber",
      "OtherUserContactInfo",
      "PreciseLocation",
      "CoarseLocation",
      "PhotosorVideos",
      "OtherUserContent",
      "CustomerSupport",
      "UserID",
      "DeviceID",
      "PurchaseHistory",
      "CrashData",
      "PerformanceData",
    ];

    assert.match(manifest, /<key>NSPrivacyTracking<\/key>\s*<false\/>/);
    for (const type of requiredTypes) {
      assert.match(manifest, new RegExp(`NSPrivacyCollectedDataType${type}`));
    }
  });

  it("starts the native crash reporter without default PII", () => {
    const source = readRepoFile(
      "ios-native/SideSeat/Core/Monitoring/CrashReporting.swift",
    );
    const appDelegate = readRepoFile(
      "ios-native/SideSeat/Core/Push/SideSeatAppDelegate.swift",
    );
    const project = readRepoFile("ios-native/project.yml");

    assert.match(source, /import Sentry/);
    assert.match(source, /SentrySDK\.start/);
    assert.match(source, /sendDefaultPii = false/);
    assert.match(
      appDelegate,
      /didFinishLaunchingWithOptions[\s\S]*CrashReporting\.start\(\)/,
    );
    assert.match(project, /getsentry\/sentry-cocoa/);
  });

  it("declares that the app uses no non-exempt encryption", () => {
    const infoPlist = readRepoFile("ios-native/SideSeat/Resources/Info.plist");

    assert.match(
      infoPlist,
      /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/,
    );
  });

  it("uploads Production archive dSYMs through a guarded Sentry build phase", () => {
    const project = readRepoFile("ios-native/project.yml");
    const production = readRepoFile(
      "ios-native/Configuration/Production.xcconfig",
    );
    const uploader = readRepoFile("ios-native/scripts/upload-sentry-dsyms.sh");
    const validator = readRepoFile(
      "ios-native/scripts/validate-production-build.sh",
    );

    assert.match(project, /Upload Production dSYMs to Sentry/);
    assert.match(project, /upload-sentry-dsyms\.sh/);
    assert.match(production, /DEBUG_INFORMATION_FORMAT = dwarf-with-dsym/);
    assert.match(uploader, /CONFIGURATION:-.*Production/);
    assert.match(uploader, /ACTION:-.*install/);
    assert.match(uploader, /app\.sideseat\.mobile\.sentry-dsym/);
    assert.match(uploader, /security find-generic-password/);
    assert.match(uploader, /SENTRY_ORG is required/);
    assert.match(uploader, /SENTRY_PROJECT is required/);
    assert.match(uploader, /debug-files upload/);
    assert.match(uploader, /DWARF_DSYM_FOLDER_PATH/);
    assert.match(validator, /ACTION:-.*install/);
    assert.match(validator, /security find-generic-password/);
  });

  it("requires on-device speech recognition", () => {
    const source = readRepoFile(
      "ios-native/SideSeat/Features/Calendar/CalendarVoiceInput.swift",
    );

    assert.match(source, /supportsOnDeviceRecognition/);
    assert.match(source, /requiresOnDeviceRecognition = true/);
  });

  it("localizes sensitive permission prompts", () => {
    for (const locale of ["en", "de", "zh-Hans"]) {
      const strings = readRepoFile(
        `ios-native/SideSeat/Resources/${locale}.lproj/InfoPlist.strings`,
      );

      assert.match(strings, /NSLocationWhenInUseUsageDescription/);
      assert.match(strings, /NSMicrophoneUsageDescription/);
      assert.match(strings, /NSSpeechRecognitionUsageDescription/);
    }
  });

  it("rejects placeholder Associated Domains for Production", () => {
    const validator = readRepoFile(
      "ios-native/scripts/validate-production-build.sh",
    );

    assert.match(validator, /SIDESEAT_ASSOCIATED_DOMAIN/);
    assert.match(validator, /\.invalid/);
    assert.match(
      validator,
      /SIDESEAT_CRASH_DSN must be a public HTTPS Sentry DSN/,
    );
  });
});
