import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import { generateKeyPairSync } from "node:crypto";
import http2 from "node:http2";
import Module from "node:module";
import { fileURLToPath } from "node:url";

test("APNs uses the Preview topic only after Apple's specific sandbox topic mismatch", async () => {
  const resolver = Module as typeof Module & { _resolveFilename: (request: string, ...args: unknown[]) => string };
  const originalResolve = resolver._resolveFilename;
  resolver._resolveFilename = function(request, ...args) {
    return request === "server-only" ? fileURLToPath(new URL("../v2/server-only-test-stub.cjs", import.meta.url)) : originalResolve.call(this, request, ...args);
  };
  const { sendApnsNotification } = await import("../../lib/push/apns-send");
  resolver._resolveFilename = originalResolve;
  const keys = ["APNS_BUNDLE_ID", "APNS_TEAM_ID", "APNS_SANDBOX_KEY_ID", "APNS_SANDBOX_KEY_P8", "APNS_PRODUCTION_KEY_ID", "APNS_PRODUCTION_KEY_P8"];
  const previous = keys.map(k => process.env[k]);
  const original = http2.connect;
  const key = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  Object.assign(process.env, { APNS_BUNDLE_ID: "app.sideseat.mobile", APNS_TEAM_ID: "TESTTEAM", APNS_SANDBOX_KEY_ID: "TESTSANDBOX", APNS_SANDBOX_KEY_P8: key, APNS_PRODUCTION_KEY_ID: "TESTPROD", APNS_PRODUCTION_KEY_P8: key });
  let responses: { status: number; reason?: string }[] = [], topics: string[] = [];
  // Exercise the actual HTTP/2 request headers and APNs response handling, with no network.
  http2.connect = (() => {
    const client = new EventEmitter() as EventEmitter & { close(): void; request(headers: Record<string, string>): EventEmitter };
    client.close = () => {};
    client.request = headers => {
      topics.push(headers["apns-topic"]);
      const response = responses.shift(); assert(response);
      const req = new EventEmitter() as EventEmitter & { setEncoding(): void; end(body: string): void };
      req.setEncoding = () => {};
      req.end = body => { assert.equal(JSON.parse(body).aps.alert.title, "Final plan"); queueMicrotask(() => {
        req.emit("response", { ":status": response.status });
        if (response.reason) req.emit("data", JSON.stringify({ reason: response.reason }));
        req.emit("end");
      }); };
      return req;
    };
    return client;
  }) as unknown as typeof http2.connect;
  try {
    responses = [{ status: 200 }];
    assert.deepEqual(await sendApnsNotification("test-token", { title: "Final plan", body: "Test" }, "production"), { ok: true });
    assert.deepEqual(topics, ["app.sideseat.mobile"]);
    topics = []; responses = [{ status: 400, reason: "DeviceTokenNotForTopic" }, { status: 200 }];
    assert.deepEqual(await sendApnsNotification("test-token", { title: "Final plan", body: "Test" }, "sandbox"), { ok: true });
    assert.deepEqual(topics, ["app.sideseat.mobile", "app.sideseat.mobile.preview"]);
    topics = []; responses = [{ status: 400, reason: "DeviceTokenNotForTopic" }];
    const prod = await sendApnsNotification("test-token", { title: "Final plan", body: "Test" }, "production");
    assert(!prod.ok && prod.reason === "DeviceTokenNotForTopic"); assert.equal(topics.length, 1);
    topics = []; responses = [{ status: 410, reason: "Unregistered" }];
    const gone = await sendApnsNotification("test-token", { title: "Final plan", body: "Test" }, "sandbox");
    assert(!gone.ok && gone.invalidateToken); assert.equal(topics.length, 1);
  } finally {
    http2.connect = original;
    keys.forEach((k, i) => { if (previous[i] === undefined) delete process.env[k]; else process.env[k] = previous[i]; });
  }
});
