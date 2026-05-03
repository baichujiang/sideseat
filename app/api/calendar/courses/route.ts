import { CourseIntent, Weekday } from "@prisma/client";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { DEFAULT_SCHOOL, normalizeSchoolCode } from "@/lib/constants/schools";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { calendarCourseAddSchema } from "@/lib/validators/calendar";
import { parseTimeToMinutes } from "@/lib/validators/course";

export async function POST(request: Request) {
  try {
    const user = await requireOnboardedUser();
    const values = await parseJson(request, calendarCourseAddSchema);
    const school = normalizeSchoolCode(user.school) ?? DEFAULT_SCHOOL;

    const course = await prisma.course.findFirst({
      where: { id: values.courseId, school },
      select: { id: true },
    });

    if (!course) {
      return error("Course not found.", 404);
    }

    const sessionRecords = values.sessions
      .map((session) => ({
        weekday: session.weekday,
        startMinute: parseTimeToMinutes(session.start),
        endMinute: parseTimeToMinutes(session.end),
        location: session.location?.trim() || null,
      }))
      .filter(
        (s): s is { weekday: Weekday; startMinute: number; endMinute: number; location: string | null } =>
          s.startMinute !== null && s.endMinute !== null,
      );

    const membership = await prisma.userCourse.upsert({
      where: {
        userId_courseId: {
          userId: user.id,
          courseId: course.id,
        },
      },
      create: {
        userId: user.id,
        courseId: course.id,
        intentions: [CourseIntent.STUDY_TOGETHER],
      },
      update: {},
      select: {
        id: true,
      },
    });

    await prisma.$transaction([
      prisma.savedCourse.deleteMany({
        where: { userId: user.id, courseId: course.id },
      }),
      prisma.courseSession.deleteMany({
        where: { userCourseId: membership.id },
      }),
      prisma.courseSession.createMany({
        data: sessionRecords.map((record) => ({
          userCourseId: membership.id,
          weekday: record.weekday,
          startMinute: record.startMinute,
          endMinute: record.endMinute,
          location: record.location,
        })),
      }),
    ]);

    return ok({ courseId: course.id }, { status: 201 });
  } catch (cause) {
    console.error(cause);
    return error("Unable to add course to calendar.");
  }
}
