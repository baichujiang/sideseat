import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deriveContactExchangeState } from "../../lib/queries/contact-exchange";

const now = new Date();

describe("contact exchange state", () => {
  it("treats a requester cancellation as immediately available", () => {
    assert.deepEqual(
      deriveContactExchangeState(
        [
          {
            id: "canceled-request",
            status: "CANCELED",
            requesterId: "viewer",
            responderId: "peer",
            updatedAt: now,
          },
        ],
        "viewer",
      ),
      { kind: "none" },
    );
  });

  it("keeps a recent recipient decline in cooldown", () => {
    const state = deriveContactExchangeState(
      [
        {
          id: "declined-request",
          status: "DECLINED",
          requesterId: "viewer",
          responderId: "peer",
          updatedAt: now,
        },
      ],
      "viewer",
    );

    assert.equal(state.kind, "cooldown");
    if (state.kind === "cooldown") {
      assert.ok(state.until.getTime() > now.getTime());
    }
  });

  it("preserves pending direction for requester and recipient", () => {
    const request = {
      id: "pending-request",
      status: "PENDING" as const,
      requesterId: "viewer",
      responderId: "peer",
      updatedAt: now,
    };

    assert.deepEqual(deriveContactExchangeState([request], "viewer"), {
      kind: "outgoing_pending",
      requestId: request.id,
    });
    assert.deepEqual(deriveContactExchangeState([request], "peer"), {
      kind: "incoming_pending",
      requestId: request.id,
    });
  });
});
