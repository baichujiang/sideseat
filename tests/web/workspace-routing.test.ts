import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isLegacyWebFrozen,
  isNativeWebPath,
} from "../../lib/nav/legacy-web-freeze";
import { isPublicAppPath } from "../../lib/nav/public-app-path";
import { shouldAutoGuestSession } from "../../lib/nav/auto-guest-path";
import { sharedPlanFromMessage } from "../../lib/web/plan-message";
test("new web workspace is reachable while retired app routes remain frozen", () => {
  assert.equal(isLegacyWebFrozen("production", undefined), true);
  for (const path of [
    "/web",
    "/web/login",
    "/web/signup",
    "/web/together",
    "/web/calendar",
    "/web/messages",
    "/web/plans/plan-token",
    "/web/me",
  ]) {
    assert.equal(isNativeWebPath(path), true, path);
    assert.equal(isPublicAppPath(path), true, path);
    assert.equal(shouldAutoGuestSession(path), false, path);
  }
  for (const path of ["/home", "/discover", "/inbox", "/profile"]) {
    assert.equal(isNativeWebPath(path), false, path);
  }
  assert.equal(isNativeWebPath("/web-untrusted"), false);
});
test("guest sharing and administrator access remain available", () => {
  for (const path of [
    "/time-polls/token",
    "/time-poll-recovery/token",
    "/share/intent/token",
    "/share/event/token",
    "/admin",
    "/login",
    "/ios",
    "/privacy",
    "/support",
  ]) {
    assert.equal(isNativeWebPath(path), true, path);
  }
});
test("native shared-plan messages open the authenticated web plan, with foreign links kept as text", () => {
  assert.deepEqual(
    sharedPlanFromMessage(
      "📅 一起学习\nhttps://www.sideseat.de/time-polls/abcdefgh_123",
      "127.0.0.1:3344",
    ),
    { token: "abcdefgh_123", title: "一起学习" },
  );
  assert.equal(
    sharedPlanFromMessage(
      "https://unrelated.example/time-polls/abcdefgh_123",
      "www.sideseat.de",
    ),
    null,
  );
});
