import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isVisibleToSchoolInFeed } from "../../lib/discover/discover-activity-state";

const now = new Date("2026-08-07T12:00:00.000Z");
const activity = {
  id: "activity-1",
  organizerId: "organizer-1",
  school: "TUM",
  status: "OPEN" as const,
  startAt: new Date("2026-08-08T12:00:00.000Z"),
  capacity: 20,
};

describe("Discover activity school visibility", () => {
  it("shows a current activity to guests and students from its school", () => {
    assert.equal(isVisibleToSchoolInFeed(activity, undefined, now), true);
    assert.equal(isVisibleToSchoolInFeed(activity, "TUM", now), true);
    assert.equal(
      isVisibleToSchoolInFeed(activity, "Technical University of Munich", now),
      true,
    );
  });

  it("hides it from another school and after it starts", () => {
    assert.equal(isVisibleToSchoolInFeed(activity, "LMU", now), false);
    assert.equal(
      isVisibleToSchoolInFeed(activity, "TUM", new Date("2026-08-08T12:00:00.000Z")),
      false,
    );
  });
});
