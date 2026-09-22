import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createClassmatePostSchema,
  extractClassmatePostHashtags,
} from "../../lib/validators/classmate-posts";

describe("plan creation defaults", () => {
  it("defaults to everyone and direct messaging", () => {
    const result = createClassmatePostSchema.parse({
      title: "Study together #Library",
      body: "Bring your notes #自习 #library",
      expiresAt: "2099-12-31T23:59:59.000Z",
    });

    assert.equal(result.visibility, "CITY_INTERNATIONALS");
    assert.equal(result.replyPreference, "DIRECT_MESSAGE");
    assert.deepEqual(result.tags, ["library", "自习"]);
  });

  it("merges explicit tags with hashtags without duplicates", () => {
    const result = createClassmatePostSchema.parse({
      title: "Coffee after class #Coffee",
      body: "#Garching #coffee",
      tags: ["new-friends"],
      expiresAt: "2099-12-31T23:59:59.000Z",
    });

    assert.deepEqual(result.tags, ["new-friends", "coffee", "garching"]);
  });
});

describe("plan hashtag extraction", () => {
  it("supports Unicode and stops tags at punctuation", () => {
    assert.deepEqual(
      extractClassmatePostHashtags("#Study #自习 #coffee-time #not@included #study"),
      ["study", "自习", "coffee-time", "not"],
    );
  });
});
