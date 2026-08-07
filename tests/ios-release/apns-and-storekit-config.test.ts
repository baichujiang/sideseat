import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it, before, after } from "node:test";

import {
  isApnsConfigured,
  apnsBundleId,
  apnsHostForEnvironment,
  apnsUseSandbox,
  normalizeApnsEnvironment,
} from "../../lib/push/apns-env";
import { buildApnsPayload } from "../../lib/push/apns-payload";
import { isStoreKitAppleApiConfigured } from "../../lib/api/v1/storekit-apple-env";

function readRepoFile(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("isApnsConfigured", () => {
  const keys = ["APNS_KEY_ID", "APNS_TEAM_ID", "APNS_KEY_P8", "APNS_BUNDLE_ID", "APNS_USE_SANDBOX"] as const;
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

  it("is false until required secrets are present", () => {
    assert.equal(isApnsConfigured(), false);
    process.env.APNS_KEY_ID = "ABC123";
    process.env.APNS_TEAM_ID = "TEAM123";
    process.env.APNS_KEY_P8 = "not-a-real-key";
    assert.equal(isApnsConfigured(), true);
    assert.equal(apnsBundleId(), "app.sideseat.mobile");
  });

  it("honors APNS_USE_SANDBOX override", () => {
    process.env.APNS_USE_SANDBOX = "0";
    assert.equal(apnsUseSandbox(), false);
    process.env.APNS_USE_SANDBOX = "1";
    assert.equal(apnsUseSandbox(), true);
  });

  it("routes each device token to its own APNs environment", () => {
    assert.equal(apnsHostForEnvironment("sandbox"), "api.sandbox.push.apple.com");
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
    const payload = buildApnsPayload({ title: "SideSeat", body: "Hello", badge: -2 });
    assert.equal(payload.aps.badge, 0);
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
  it("declares push and Universal Link entitlements", () => {
    const entitlements = readRepoFile("ios-native/SideSeat/SideSeat.entitlements");
    const project = readRepoFile("ios-native/project.yml");

    assert.match(entitlements, /<key>aps-environment<\/key>/);
    assert.match(entitlements, /\$\(APS_ENVIRONMENT\)/);
    assert.match(entitlements, /com\.apple\.developer\.associated-domains/);
    assert.match(entitlements, /applinks:\$\(SIDESEAT_ASSOCIATED_DOMAIN\)/);
    assert.match(project, /aps-environment: \$\(APS_ENVIRONMENT\)/);
    assert.match(project, /com\.apple\.developer\.associated-domains:/);
  });

  it("registers Debug and Release device tokens with explicit APNs environments", () => {
    const source = readRepoFile("ios-native/SideSeat/Core/Push/PushRegistration.swift");

    assert.match(source, /#if DEBUG[\s\S]*return \.sandbox[\s\S]*return \.production/);
    assert.match(source, /environment: NativeAPNsEnvironment\.current/);
  });

  it("serves only the Universal Link paths understood by the native router", () => {
    const aasa = readRepoFile("app/.well-known/apple-app-site-association/route.ts");

    assert.match(aasa, /\/discover\/posts\/\*/);
    assert.match(aasa, /\/discover\/activities\/\*/);
    assert.match(aasa, /\/share\/view\/\*/);
    assert.doesNotMatch(aasa, /webcredentials:/);
  });

  it("declares linked product data without tracking", () => {
    const manifest = readRepoFile("ios-native/SideSeat/Resources/PrivacyInfo.xcprivacy");
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
    const source = readRepoFile("ios-native/SideSeat/Core/Monitoring/CrashReporting.swift");
    const appDelegate = readRepoFile("ios-native/SideSeat/Core/Push/SideSeatAppDelegate.swift");
    const project = readRepoFile("ios-native/project.yml");

    assert.match(source, /import Sentry/);
    assert.match(source, /SentrySDK\.start/);
    assert.match(source, /sendDefaultPii = false/);
    assert.match(appDelegate, /didFinishLaunchingWithOptions[\s\S]*CrashReporting\.start\(\)/);
    assert.match(project, /getsentry\/sentry-cocoa/);
  });

  it("requires on-device speech recognition", () => {
    const source = readRepoFile("ios-native/SideSeat/Features/Calendar/CalendarVoiceInput.swift");

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
    const validator = readRepoFile("ios-native/scripts/validate-production-build.sh");

    assert.match(validator, /SIDESEAT_ASSOCIATED_DOMAIN/);
    assert.match(validator, /\.invalid/);
    assert.match(validator, /SIDESEAT_CRASH_DSN must be a public HTTPS Sentry DSN/);
  });
});
