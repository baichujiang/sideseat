import { Weekday } from "@prisma/client";

import { applyOfficialScheduleToUserCourse } from "@/lib/courses/official-schedule";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { DEFAULT_SCHOOL, normalizeSchoolCode } from "@/lib/constants/schools";
import { getCurrentSemesterLabel } from "@/lib/constants/semester";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { courseSchema, parseTimeToMinutes } from "@/lib/validators/course";

export async function GET() {
  const user = await requireOnboardedUser();
  const memberships = await prisma.userCourse.findMany({
    where: { userId: user.id },
    include: { course: true, sessions: true },
  });

  return ok(memberships);
}

export async function POST(request: Request) {
  try {
    const user = await requireOnboardedUser();
    const values = await parseJson(request, courseSchema);
    const school = normalizeSchoolCode(user.school) ?? DEFAULT_SCHOOL;
    const code = values.code.trim().toUpperCase();
    const semesterLabel = getCurrentSemesterLabel();
    const defaultLocation = values.location?.trim() || null;

    const sessionRecords = (values.sessions ?? [])
      .map((session) => ({
        weekday: session.weekday,
        startMinute: parseTimeToMinutes(session.start),
        endMinute: parseTimeToMinutes(session.end),
        location: session.location ? session.location.trim() || null : defaultLocation,
      }))
      .filter(
        (s): s is { weekday: Weekday; startMinute: number; endMinute: number; location: string | null } =>
          s.startMinute !== null && s.endMinute !== null,
      );

    // Course is the shared identity. Match by code first (codes are unique
    // within a semester), then by name. If an existing record already has a
    // name, keep it — we don't let one user's typo overwrite the community value.
    const existingByCode = await prisma.course.findFirst({
      where: { code, school, semesterLabel },
    });

    const course = existingByCode
      ? existingByCode
      : await prisma.course.upsert({
          where: {
            name_school_semesterLabel: {
              name: values.name,
              school,
              semesterLabel,
            },
          },
          create: {
            name: values.name,
            code,
            school,
            semesterLabel,
          },
          update: { code },
        });

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
        intentions: values.intentions,
      },
      update: {
        intentions: values.intentions,
      },
    });

    await prisma.$transaction([
      prisma.savedCourse.deleteMany({
        where: { userId: user.id, courseId: course.id },
      }),
      prisma.courseSession.deleteMany({ where: { userCourseId: membership.id } }),
      ...(sessionRecords.length
        ? [
            prisma.courseSession.createMany({
              data: sessionRecords.map((record) => ({
                userCourseId: membership.id,
                weekday: record.weekday,
                startMinute: record.startMinute,
                endMinute: record.endMinute,
                location: record.location,
              })),
            }),
          ]
        : []),
    ]);

    if (sessionRecords.length === 0) {
      const applied = await applyOfficialScheduleToUserCourse({
        userCourseId: membership.id,
        courseId: course.id,
        variantFingerprint: values.variantFingerprint ?? null,
      }).catch(() => false);
      if (!applied) {
        return error(
          "No official timetable is available for this course yet. Please add your class times below.",
          422,
        );
      }
    }

    return ok({ courseId: membership.courseId }, { status: 201 });
  } catch (cause) {
    console.error(cause);
    return error("Unable to save course.");
  }
}
