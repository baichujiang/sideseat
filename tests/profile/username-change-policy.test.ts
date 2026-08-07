import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  nextUsernameChangeWindow,
  usernameChangePolicy,
} from "../../lib/profile/username-change-policy";

const now = new Date("2026-08-07T12:00:00.000Z");

describe("username change policy", () => {
  it("allows three changes during a seven-day window", () => {
    const startedAt = new Date("2026-08-05T12:00:00.000Z");

    assert.deepEqual(
      usernameChangePolicy(
        { usernameChangeWindowStartedAt: startedAt, usernameChangeCount: 2 },
        now,
      ),
      {
        limit: 3,
        windowDays: 7,
        changesUsed: 2,
        changesRemaining: 1,
        nextAllowedAt: null,
      },
    );
  });

  it("blocks a fourth change until seven days after the window began", () => {
    const startedAt = new Date("2026-08-05T12:00:00.000Z");
    const policy = usernameChangePolicy(
      { usernameChangeWindowStartedAt: startedAt, usernameChangeCount: 3 },
      now,
    );

    assert.equal(policy.changesRemaining, 0);
    assert.equal(policy.nextAllowedAt?.toISOString(), "2026-08-12T12:00:00.000Z");
  });

  it("resets the allowance after the seven-day window", () => {
    const expired = {
      usernameChangeWindowStartedAt: new Date("2026-07-30T12:00:00.000Z"),
      usernameChangeCount: 3,
    };

    assert.equal(usernameChangePolicy(expired, now).changesRemaining, 3);
    assert.deepEqual(nextUsernameChangeWindow(expired, now), {
      usernameChangeWindowStartedAt: now,
      usernameChangeCount: 1,
    });
  });
});
