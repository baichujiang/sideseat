import type { Weekday } from "@prisma/client";
import { CalendarRepeatRule } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { ensureUserCalendarCategories } from "@/lib/calendar/default-user-calendar-categories";
import { courseScheduleMirrorKey, materializeWeeklyCourseSlot } from "@/lib/calendar/course-schedule-mirror";
import { getCurrentSemesterDateRange } from "@/lib/constants/semester";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { courseSessionInput, parseTimeToMinutes } from "@/lib/validators/course";

const bodySchema = z.object({
  courseId: z.string().min(1),
  enabled: z.boolean(),
  sessions: z.array(courseSessionInput).max(8).default([]),
});

export async function POST(request: Request) {
  try {
    const user = await requireOnboardedUser();
    const values = await parseJson(request, bodySchema);

    const membership = await prisma.userCourse.findFirst({
      where: { userId: user.id, courseId: values.courseId },
      include: { course: { select: { id: true, name: true, code: true } } },
    });

    if (!membership) {
      return error("You are not enrolled in this course.", 404);
    }

    const prefix = `${values.courseId}_`;

    const sessions = values.sessions ?? [];

    if (!values.enabled || sessions.length === 0) {
      await prisma.calendarEntry.deleteMany({
        where: {
          userId: user.id,
          courseScheduleMirrorKey: { startsWith: prefix },
        },
      });
      revalidatePath("/home");
      revalidatePath(`/courses/${values.courseId}`);
      return ok({ cleared: true });
    }

    const sessionRecords = sessions
      .map((session) => ({
        weekday: session.weekday,
        startMinute: parseTimeToMinutes(session.start),
        endMinute: parseTimeToMinutes(session.end),
        location: session.location?.trim() || null,
      }))
      .filter(
        (s): s is { weekday: Weekday; startMinute: number; endMinute: number; location: string | null } =>
          s.startMinute !== null && s.endMinute !== null && s.endMinute > s.startMinute,
      );

    if (sessionRecords.length === 0) {
      await prisma.calendarEntry.deleteMany({
        where: {
          userId: user.id,
          courseScheduleMirrorKey: { startsWith: prefix },
        },
      });
      revalidatePath("/home");
      revalidatePath(`/courses/${values.courseId}`);
      return ok({ cleared: true });
    }

    await ensureUserCalendarCategories(prisma, user.id);
    const courseCategory = await prisma.userCalendarCategory.findFirst({
      where: { userId: user.id, presetKey: "course" },
      select: { id: true },
    });

    const now = new Date();
    const { start: semesterStart, end: semesterEnd } = getCurrentSemesterDateRange(now);
    const title =
      membership.course.code && membership.course.code.trim().length > 0
        ? `${membership.course.code.trim()} · ${membership.course.name}`
        : membership.course.name;

    const rows: Array<{
      userId: string;
      title: string;
      location: string | null;
      note: string | null;
      startAt: Date;
      endAt: Date;
      categoryId: string | null;
      source: string;
      courseScheduleMirrorKey: string;
      repeatRule: typeof CalendarRepeatRule.NONE;
      repeatUntil: null;
    }> = [];

    for (const s of sessionRecords) {
      const key = courseScheduleMirrorKey(membership.course.id, s.weekday, s.startMinute);
      const slots = materializeWeeklyCourseSlot({
        semesterStart,
        semesterEnd,
        // Mirror the full semester timeline (not just future from "today").
        notBefore: semesterStart,
        weekday: s.weekday,
        startMinute: s.startMinute,
        endMinute: s.endMinute,
      });
      for (const slot of slots) {
        rows.push({
          userId: user.id,
          title,
          location: s.location,
          note: null,
          startAt: slot.startAt,
          endAt: slot.endAt,
          categoryId: courseCategory?.id ?? null,
          source: "course_mirror",
          courseScheduleMirrorKey: key,
          repeatRule: CalendarRepeatRule.NONE,
          repeatUntil: null,
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.calendarEntry.deleteMany({
        where: {
          userId: user.id,
          courseScheduleMirrorKey: { startsWith: prefix },
        },
      });
      for (const row of rows) {
        await tx.calendarEntry.create({ data: row });
      }
    });

    revalidatePath("/home");
    revalidatePath(`/courses/${values.courseId}`);

    return ok({ created: rows.length });
  } catch (cause) {
    console.error(cause);
    return error("Unable to sync course times to calendar.");
  }
}
