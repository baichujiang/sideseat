import assert from "node:assert/strict";
import test from "node:test";

import { GET as getAppleAppSiteAssociation } from "../../app/.well-known/apple-app-site-association/route";
import { isLegacyWebFrozen, isNativeWebPath } from "../../lib/nav/legacy-web-freeze";
import { publicScheduleShareOrigin } from "../../lib/schedule-share/public-share-origin";

test("production share links use the canonical Universal Link host", () => {
  assert.equal(
    publicScheduleShareOrigin({
      requestOrigin: "https://api.sideseat.de",
      nodeEnv: "production",
    }),
    "https://www.sideseat.de",
  );
});

test("production share origin rejects insecure configuration", () => {
  assert.equal(
    publicScheduleShareOrigin({
      requestOrigin: "https://api.sideseat.de",
      configuredOrigin: "http://www.sideseat.de",
      nodeEnv: "production",
    }),
    "https://www.sideseat.de",
  );
});

test("AASA advertises the signed iPhone app and schedule links", async () => {
  const response = getAppleAppSiteAssociation();
  const body = await response.json();
  const details = body.applinks.details[0];

  assert.ok(details.appIDs.includes("V4238R5R53.app.sideseat.mobile"));
  assert.ok(details.components.some((entry: { "/": string }) => entry["/"] === "/share/view/*"));
});

test("legacy web is frozen in production while native and admin routes remain", () => {
  assert.equal(isLegacyWebFrozen("production"), true);
  assert.equal(isLegacyWebFrozen("development"), false);
  assert.equal(isLegacyWebFrozen("production", "true"), false);

  assert.equal(isNativeWebPath("/"), true);
  assert.equal(isNativeWebPath("/ios"), true);
  assert.equal(isNativeWebPath("/share/view/token"), true);
  assert.equal(isNativeWebPath("/privacy"), true);
  assert.equal(isNativeWebPath("/support"), true);
  assert.equal(isNativeWebPath("/admin/verifications"), true);
  assert.equal(isNativeWebPath("/admin/users/user-1"), true);
  assert.equal(isNativeWebPath("/login"), true);
  assert.equal(isNativeWebPath("/login/callback"), true);
  assert.equal(isNativeWebPath("/forgot-password"), true);
  assert.equal(isNativeWebPath("/discover"), false);
  assert.equal(isNativeWebPath("/profile"), false);
  assert.equal(isNativeWebPath("/signup"), false);
});
