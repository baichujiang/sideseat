import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cronMonitorUrlFor, parseCronMonitorUrls } from "../../lib/ops/cron-monitor-config";

const monitors = JSON.stringify({
  "chat-realtime-retention": {
    successUrl: "https://monitor.example/chat",
    failureUrl: "https://monitor.example/chat/fail",
  },
  "tum-course-catalog": {
    successUrl: "https://monitor.example/tum",
    failureUrl: "https://monitor.example/tum/fail",
  },
});

describe("cron monitor configuration", () => {
  it("routes success and failure to the matching job endpoints", () => {
    const environment = { CRON_MONITOR_URLS: monitors };
    assert.equal(
      cronMonitorUrlFor("chat-realtime-retention", "succeeded", environment),
      "https://monitor.example/chat",
    );
    assert.equal(
      cronMonitorUrlFor("chat-realtime-retention", "failed", environment),
      "https://monitor.example/chat/fail",
    );
    assert.equal(
      cronMonitorUrlFor("tum-course-catalog", "succeeded", environment),
      "https://monitor.example/tum",
    );
  });

  it("does not let one configured job mask a missing job", () => {
    assert.equal(cronMonitorUrlFor("lmu-course-catalog", "succeeded", { CRON_MONITOR_URLS: monitors }), null);
  });

  it("rejects malformed and private endpoints", () => {
    assert.throws(() => parseCronMonitorUrls("[]"), /JSON object/);
    assert.throws(
      () =>
        parseCronMonitorUrls(
          JSON.stringify({ job: { successUrl: "http://127.0.0.1/ping", failureUrl: "https://monitor.example/fail" } }),
        ),
      /public HTTPS/,
    );
  });

  it("keeps the legacy single endpoint only as a compatibility fallback", () => {
    assert.equal(
      cronMonitorUrlFor("chat-realtime-retention", "succeeded", {
        CRON_MONITOR_URL: "https://legacy-monitor.example/ping",
      }),
      "https://legacy-monitor.example/ping",
    );
  });
});
