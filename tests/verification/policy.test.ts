import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  manualReviewProofCutoff,
} from "../../lib/verification/policy";

describe("school verification policy", () => {
  test("manual proof retention is thirty days", () => {
    assert.equal(
      manualReviewProofCutoff(new Date("2026-08-05T12:00:00.000Z")).toISOString(),
      "2026-07-06T12:00:00.000Z",
    );
  });
});
