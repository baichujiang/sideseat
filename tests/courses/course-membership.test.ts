import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  courseMembershipActiveUntilForSemester,
  isCourseMembershipActive,
} from "../../lib/courses/active-membership";
import {
  courseIdentityKey,
  normalizeCourseIdentityCode,
} from "../../lib/courses/course-identity";

describe("course social identity", () => {
  it("normalizes code formatting without merging different schools", () => {
    assert.equal(normalizeCourseIdentityCode(" in  0001 "), "IN0001");
    assert.equal(
      courseIdentityKey({ id: "summer", school: "TUM", code: "IN 0001" }),
      courseIdentityKey({ id: "winter", school: "tum", code: "in0001" }),
    );
    assert.notEqual(
      courseIdentityKey({ id: "tum", school: "TUM", code: "IN0001" }),
      courseIdentityKey({ id: "lmu", school: "LMU", code: "IN0001" }),
    );
  });

  it("keeps a membership current through the end of its academic term", () => {
    const now = new Date(2026, 7, 4, 12, 0, 0, 0);
    const summer = courseMembershipActiveUntilForSemester("SS 2026", now);
    assert.deepEqual(
      [summer.getFullYear(), summer.getMonth(), summer.getDate()],
      [2026, 8, 30],
    );

    const winter = courseMembershipActiveUntilForSemester("WS 2026/27", now);
    assert.deepEqual(
      [winter.getFullYear(), winter.getMonth(), winter.getDate()],
      [2027, 2, 31],
    );

    const historical = courseMembershipActiveUntilForSemester("SS 2025", now);
    assert.deepEqual(
      [historical.getFullYear(), historical.getMonth(), historical.getDate()],
      [2026, 8, 30],
    );
  });

  it("treats expired memberships as inactive", () => {
    const now = new Date("2026-08-04T12:00:00.000Z");
    assert.equal(
      isCourseMembershipActive(
        { activeUntil: new Date("2026-08-05T12:00:00.000Z") },
        now,
      ),
      true,
    );
    assert.equal(
      isCourseMembershipActive(
        { activeUntil: new Date("2026-08-03T12:00:00.000Z") },
        now,
      ),
      false,
    );
  });
});
