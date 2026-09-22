import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  feedbackRankingScore,
  rankFeedbackPosts,
  type FeedbackRankingInput,
} from "../../lib/feedback/ranking";

const now = new Date("2026-08-10T12:00:00.000Z");

function post(
  id: string,
  overrides: Partial<FeedbackRankingInput> = {},
): FeedbackRankingInput {
  return {
    id,
    up: 0,
    down: 0,
    commentCount: 0,
    createdAt: "2026-08-10T10:00:00.000Z",
    updatedAt: "2026-08-10T10:00:00.000Z",
    ...overrides,
  };
}

describe("feedback comprehensive ranking", () => {
  it("rewards agreement and useful discussion", () => {
    const engaged = post("engaged", { up: 5, down: 1, commentCount: 4 });
    const untouched = post("untouched");

    assert.ok(
      feedbackRankingScore(engaged, now) > feedbackRankingScore(untouched, now),
    );
  });

  it("penalizes disagreement instead of treating all activity as positive", () => {
    const supported = post("supported", { up: 4, down: 0 });
    const rejected = post("rejected", { up: 1, down: 4 });

    assert.ok(
      feedbackRankingScore(supported, now) > feedbackRankingScore(rejected, now),
    );
  });

  it("lets established useful feedback outrank a fresh empty post", () => {
    const established = post("established", {
      up: 8,
      down: 1,
      commentCount: 6,
      updatedAt: "2026-07-25T10:00:00.000Z",
    });
    const fresh = post("fresh", { updatedAt: "2026-08-10T11:59:00.000Z" });

    assert.deepEqual(rankFeedbackPosts([fresh, established], now).map((row) => row.id), [
      "established",
      "fresh",
    ]);
  });

  it("uses recent activity and then id as deterministic tie breakers", () => {
    const older = post("older", { updatedAt: "2026-08-10T09:00:00.000Z" });
    const newerB = post("b", { updatedAt: "2026-08-10T11:00:00.000Z" });
    const newerA = post("a", { updatedAt: "2026-08-10T11:00:00.000Z" });

    assert.deepEqual(rankFeedbackPosts([newerB, older, newerA], now).map((row) => row.id), [
      "a",
      "b",
      "older",
    ]);
  });
});
