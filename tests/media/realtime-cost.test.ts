import assert from "node:assert/strict";
import test from "node:test";
import Module from "node:module";
import { fileURLToPath } from "node:url";
const resolver = Module as typeof Module & { _resolveFilename: (request: string, ...args: unknown[]) => string };
const original = resolver._resolveFilename;
resolver._resolveFilename = function(request, ...args) {
  return request === "server-only" ? fileURLToPath(new URL("../v2/server-only-test-stub.cjs", import.meta.url)) : original.call(this, request, ...args);
};
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test("idle SSE slows empty polling and stops database work immediately on cancellation", async () => {
  const { chatRealtimeSseResponse } = await import("../../lib/api/v1/chat-realtime");
  const abort = new AbortController();
  let polls = 0;
  const response = await chatRealtimeSseResponse(new Request("http://localhost/events", { signal: abort.signal }), {
    conversation: { kind: "DIRECT", id: "test" }, currentSequence: async () => 0n,
    retentionFloor: async () => 0n, isAuthorized: async () => true,
    loadDeliveries: async () => { polls++; return []; },
  });
  try {
    const reader = response.body!.getReader();
    assert.match(new TextDecoder().decode((await reader.read()).value), /stream.ready/);
    await delay(1_700);
    assert(polls <= 3, `Idle stream ran ${polls} polls in 1.7 seconds.`);
    await reader.cancel();
    const atCancel = polls;
    await delay(2_200);
    assert.equal(polls, atCancel, "Cancelled stream continued querying the database.");
  } finally { abort.abort(); }
});
