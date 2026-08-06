import "server-only";

import type { User } from "@prisma/client";

import { buildSideSeatIcsExport } from "@/lib/calendar/ical-export";
import { getClassScheduleDateRange } from "@/lib/constants/vorlesungszeit";
import { activeCourseMembershipWhere } from "@/lib/courses/active-membership";
import { prisma } from "@/lib/db/prisma";

export async function loadCalendarIcsExport(
  user: Pick<User, "id" | "school">,
  options: { now?: Date } = {},
) {
  const now = options.now ?? new Date();
  const { start: semesterStart, end: semesterEnd } = getClassScheduleDateRange({
    school: user.school,
    now,
  });

  const [memberships, entries] = await Promise.all([
    prisma.userCourse.findMany({
      where: { userId: user.id, ...activeCourseMembershipWhere(now) },
      include: { course: true, sessions: true },
    }),
    prisma.calendarEntry.findMany({
      where: {
        userId: user.id,
        startAt: { lte: semesterEnd },
        endAt: { gte: semesterStart },
      },
      orderBy: { startAt: "asc" },
    }),
  ]);

  return buildSideSeatIcsExport({
    semesterStart,
    semesterEnd,
    classBlocks: memberships.flatMap((membership) =>
      membership.sessions.map((session) => ({
        courseId: membership.course.id,
        courseName: membership.course.name,
        courseCode: membership.course.code,
        weekday: session.weekday,
        startMinute: session.startMinute,
        endMinute: session.endMinute,
        location: session.location,
      })),
    ),
    entries: entries.map((entry) => ({
      startAt: entry.startAt,
      endAt: entry.endAt,
      title: entry.title,
      location: entry.location,
      note: entry.note,
    })),
  });
}
