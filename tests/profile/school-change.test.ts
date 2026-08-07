import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  archivePreviousSchoolSocialState,
  schoolIdentityChanged,
} from "../../lib/profile/school-change";

describe("school change social state", () => {
  it("treats canonical and full school names as the same school", () => {
    assert.equal(schoolIdentityChanged("TUM", "Technical University of Munich"), false);
    assert.equal(schoolIdentityChanged("TUM", "LMU"), true);
  });

  it("archives old-school social state without deleting its history", async () => {
    const now = new Date("2026-08-07T12:00:00.000Z");
    const calls: Record<string, unknown> = {};
    const tx = {
      userCourse: {
        findMany: async (args: unknown) => {
          calls.findMemberships = args;
          return [{ id: "membership-tum", courseId: "course-tum" }];
        },
        updateMany: async (args: unknown) => {
          calls.archiveMemberships = args;
          return { count: 1 };
        },
      },
      calendarEntry: {
        deleteMany: async (args: unknown) => {
          calls.deleteCalendarEntries = args;
          return { count: 4 };
        },
      },
      classmatePost: {
        updateMany: async (args: unknown) => {
          calls.closePosts = args;
          return { count: 2 };
        },
      },
      invitation: {
        updateMany: async (args: unknown) => {
          calls.expireInvitations = args;
          return { count: 1 };
        },
      },
    } as unknown as Parameters<typeof archivePreviousSchoolSocialState>[0];

    const result = await archivePreviousSchoolSocialState(tx, {
      userId: "user-1",
      previousSchool: "TUM",
      nextSchool: "LMU",
      now,
    });

    assert.deepEqual(result, {
      archivedCourseCount: 1,
      removedCalendarEntryCount: 4,
      closedPostCount: 2,
      expiredInvitationCount: 1,
    });
    assert.deepEqual(calls.archiveMemberships, {
      where: { id: { in: ["membership-tum"] } },
      data: { activeUntil: new Date("2026-08-07T11:59:59.999Z") },
    });
    assert.deepEqual(calls.deleteCalendarEntries, {
      where: {
        userId: "user-1",
        OR: [{ courseScheduleMirrorKey: { startsWith: "course-tum_" } }],
      },
    });
    assert.deepEqual(calls.closePosts, {
      where: {
        userId: "user-1",
        status: "ACTIVE",
        OR: [
          { visibility: "SCHOOL_ONLY" },
          {
            courses: {
              some: {
                course: {
                  school: {
                    notIn: ["LMU", "Ludwig Maximilian University of Munich"],
                  },
                },
              },
            },
          },
        ],
      },
      data: {
        status: "CLOSED",
        closureReason: "SCHOOL_CHANGED",
        closedAt: now,
      },
    });
    assert.deepEqual(calls.expireInvitations, {
      where: {
        status: "PENDING",
        OR: [{ senderId: "user-1" }, { receiverId: "user-1" }],
        course: {
          school: {
            notIn: ["LMU", "Ludwig Maximilian University of Munich"],
          },
        },
      },
      data: { status: "EXPIRED" },
    });
  });
});
