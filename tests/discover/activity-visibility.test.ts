import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toNativeDiscoverActivity } from "../../lib/api/v1/native-discover-serializer";
import { isVisibleToSchoolInFeed } from "../../lib/discover/discover-activity-state";
import type { DiscoverActivityRow } from "../../lib/discover/discover-activity-row";

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

describe("Discover activity identity serialization", () => {
  it("exposes the organizer's verified student state to native clients", () => {
    const row: DiscoverActivityRow = {
      id: "activity-1",
      organizerId: "organizer-1",
      organizerNickname: "Mina",
      organizerAvatarUrl: null,
      organizerVerifiedStudent: true,
      city: "Munich",
      school: "TUM",
      title: "Library meetup",
      description: null,
      category: null,
      startAtISO: "2026-08-08T12:00:00.000Z",
      endAtISO: "2026-08-08T14:00:00.000Z",
      location: "Main Library",
      capacity: 8,
      status: "OPEN",
      phase: "bookable",
      goingCount: 3,
      commentCount: 2,
      viewerSignupStatus: null,
      isOrganizer: false,
    };

    assert.deepEqual(toNativeDiscoverActivity(row).organizer, {
      id: "organizer-1",
      displayName: "Mina",
      avatarUrl: null,
      verifiedStudent: true,
    });
    assert.equal(toNativeDiscoverActivity(row).commentCount, 2);
  });
});
