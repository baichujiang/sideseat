import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { cronMonitorUrlFor, parseCronMonitorUrls } from "../../lib/ops/cron-monitor-config";

const deployedCronJobs = (
  JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")) as {
    crons?: Array<{ path: string }>;
  }
).crons?.map(({ path }) => path.split("/").filter(Boolean).at(-1)!) ?? [];

const monitors = JSON.stringify(
  Object.fromEntries(
    deployedCronJobs.map((job) => [
      job,
      {
        successUrl: `https://monitor.example/${job}/success`,
        failureUrl: `https://monitor.example/${job}/failure`,
      },
    ]),
  ),
);

describe("cron monitor configuration", () => {
  it("routes success and failure to the matching job endpoints", () => {
    const environment = { CRON_MONITOR_URLS: monitors };
    assert.ok(deployedCronJobs.length > 0, "vercel.json must schedule at least one cron job");
    for (const job of deployedCronJobs) {
      assert.equal(
        cronMonitorUrlFor(job, "succeeded", environment),
        `https://monitor.example/${job}/success`,
      );
      assert.equal(
        cronMonitorUrlFor(job, "failed", environment),
        `https://monitor.example/${job}/failure`,
      );
    }
  });

  it("does not let one configured job mask a missing job", () => {
    const configured = parseCronMonitorUrls(monitors);
    const missingJob = deployedCronJobs.at(-1)!;
    delete configured[missingJob];

    assert.equal(
      cronMonitorUrlFor(missingJob, "succeeded", {
        CRON_MONITOR_URLS: JSON.stringify(configured),
      }),
      null,
    );
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
