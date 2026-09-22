import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { serveCalendarSubscriptionFeed } from "../../lib/calendar/calendar-subscription-feed";

type TestLink = {
  id: string;
  lastAccessedAt: Date | null;
  owner: { id: string };
};

const link: TestLink = {
  id: "subscription-1",
  lastAccessedAt: null,
  owner: { id: "owner-1" },
};

function request() {
  return new Request("https://www.sideseat.de/api/public/calendar-subscriptions/token.ics");
}

function assertRetryableUnavailable(response: Response) {
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("retry-after"), "60");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
}

describe("calendar subscription feed", () => {
  it("returns a retryable 503 when resolving the subscription fails", async () => {
    const databaseError = new Error("database unavailable");
    const reported: unknown[] = [];
    let loaded = false;

    const response = await serveCalendarSubscriptionFeed<{ id: string }>(
      request(),
      "private-token.ics",
      {
        resolve: async () => {
          throw databaseError;
        },
        loadIcs: async () => {
          loaded = true;
          return "";
        },
        touch: async () => {},
        reportError: (cause) => reported.push(cause),
      },
    );

    assertRetryableUnavailable(response);
    assert.equal(loaded, false);
    assert.deepEqual(reported, [databaseError]);
  });

  it("returns the same retryable 503 when ICS generation fails", async () => {
    const exportError = new Error("ICS export unavailable");
    const reported: unknown[] = [];
    let touched = false;

    const response = await serveCalendarSubscriptionFeed<TestLink["owner"]>(
      request(),
      "private-token.ics",
      {
        resolve: async () => link,
        loadIcs: async () => {
          throw exportError;
        },
        touch: async () => {
          touched = true;
        },
        reportError: (cause) => reported.push(cause),
      },
    );

    assertRetryableUnavailable(response);
    assert.equal(touched, false);
    assert.deepEqual(reported, [exportError]);
  });

  it("keeps an unknown or revoked token as a non-retryable 404", async () => {
    const response = await serveCalendarSubscriptionFeed<TestLink["owner"]>(
      request(),
      "missing-token.ics",
      {
        resolve: async () => null,
        loadIcs: async () => "",
        touch: async () => {},
        reportError: () => assert.fail("404 must not be reported as a server error"),
      },
    );

    assert.equal(response.status, 404);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("retry-after"), null);
  });
});
