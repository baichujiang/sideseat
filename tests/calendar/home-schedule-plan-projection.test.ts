import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { homeSchedulePlanProjectionFields } from "../../lib/home/home-schedule-dto";

describe("home schedule Plan projection identity", () => {
  it("exposes stable commitment, connection, and revision identifiers", () => {
    assert.deepEqual(
      homeSchedulePlanProjectionFields({
        planCommitmentId: "commitment-1",
        planRequestId: "revision-1",
        planCommitment: { connectionId: "connection-1" },
        planRequest: { connectionId: "connection-1" },
      }),
      {
        planCommitmentId: "commitment-1",
        planConnectionId: "connection-1",
        planRevisionId: "revision-1",
      },
    );
  });

  it("keeps legacy revision-only Plan projections explicit", () => {
    assert.deepEqual(
      homeSchedulePlanProjectionFields({
        planCommitmentId: null,
        planRequestId: "legacy-revision",
        planCommitment: null,
        planRequest: { connectionId: "connection-legacy" },
      }),
      {
        planCommitmentId: null,
        planConnectionId: "connection-legacy",
        planRevisionId: "legacy-revision",
      },
    );
  });

  it("does not invent Plan identity for ordinary calendar entries", () => {
    assert.deepEqual(
      homeSchedulePlanProjectionFields({
        planCommitmentId: null,
        planRequestId: null,
        planCommitment: null,
        planRequest: null,
      }),
      {
        planCommitmentId: null,
        planConnectionId: null,
        planRevisionId: null,
      },
    );
  });
});
