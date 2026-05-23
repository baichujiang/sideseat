import { CourseIntent } from "@prisma/client";

import { applyOfficialScheduleToUserCourse } from "@/lib/courses/official-schedule";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/http";

/**
 * One-tap enrollment into an existing course (from Saved or Search results).
 *
 * Why a separate endpoint from the full `POST /api/courses`:
 *   - The full endpoint is the "fill out everything at once" flow — it
 *     requires a name, code, at least one intention, and optionally a list
 *     of sessions. It's used by the `/courses/add` form.
 *   - Quick enroll captures a completely different intent: "I take this
 *     course, I'll figure out the details later." The user has already
 *     identified the course (they saved it, or they tapped Enroll on a
 *     search result) — forcing them through a page-long form is friction.
 *
 * Defaults applied on quick enroll:
 *   - intentions = [STUDY_TOGETHER]  (most common, safe for matching)
 *   - sessions   = official TUM/LMU timetable when synced, else []
 *
 * Side effects mirror the full path:
 *   - any matching SavedCourse row is removed (the course has graduated
 *     from "bookmark" to "on my schedule")
 *   - idempotent: re-tapping on an already-enrolled course is a no-op
 *     (upsert with no-op update), and still returns 200 so the UI can
 *     just refresh without flashing an error.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  try {
    const user = await requireOnboardedUser();
    const { courseId } = await params;

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, code: true, school: true, semesterLabel: true },
    });
    if (!course) {
      return error("Course not found.", 404);
    }

    // Upsert the membership. If the user is already enrolled we don't touch
    // their existing intentions — they might have refined them from the
    // default. This keeps quick-enroll safely idempotent.
    const existing = await prisma.userCourse.findUnique({
      where: {
        userId_courseId: { userId: user.id, courseId: course.id },
      },
      select: { id: true },
    });

    let membershipId = existing?.id;

    await prisma.$transaction([
      ...(existing
        ? []
        : [
            prisma.userCourse.create({
              data: {
                userId: user.id,
                courseId: course.id,
                intentions: [CourseIntent.STUDY_TOGETHER],
              },
            }),
          ]),
      prisma.savedCourse.deleteMany({
        where: { userId: user.id, courseId: course.id },
      }),
    ]);

    if (!membershipId) {
      const created = await prisma.userCourse.findUnique({
        where: { userId_courseId: { userId: user.id, courseId: course.id } },
        select: { id: true },
      });
      membershipId = created?.id;
    }

    let scheduleApplied = false;
    if (membershipId && !existing) {
      scheduleApplied = await applyOfficialScheduleToUserCourse({
        userCourseId: membershipId,
        courseId: course.id,
      }).catch(() => false);
    }

    return ok({
      courseId: course.id,
      alreadyEnrolled: Boolean(existing),
      scheduleApplied,
    });
  } catch (cause) {
    console.error(cause);
    return error("Unable to enroll in course.");
  }
}
