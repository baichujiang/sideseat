import { getClassScheduleDateRange } from "@/lib/constants/vorlesungszeit";
import { buildSideSeatIcsExport } from "@/lib/calendar/ical-export";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  try {
    const user = await requireOnboardedUser();
    const now = new Date();
    const { start: semesterStart, end: semesterEnd } = getClassScheduleDateRange({
      school: user.school,
      now,
    });

    const [memberships, entries] = await Promise.all([
      prisma.userCourse.findMany({
        where: { userId: user.id },
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

    const classBlocks = memberships.flatMap((m) =>
      m.sessions.map((s) => ({
        courseId: m.course.id,
        courseName: m.course.name,
        courseCode: m.course.code,
        weekday: s.weekday,
        startMinute: s.startMinute,
        endMinute: s.endMinute,
        location: s.location,
      })),
    );

    const exportEntries = entries.map((e) => ({
      startAt: e.startAt,
      endAt: e.endAt,
      title: e.title,
      location: e.location,
      note: e.note,
    }));

    const ics = buildSideSeatIcsExport({
      semesterStart,
      semesterEnd,
      classBlocks,
      entries: exportEntries,
    });

    return new Response(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="sideseat-schedule.ics"',
        "Cache-Control": "no-store",
      },
    });
  } catch (cause) {
    if (
      typeof cause === "object" &&
      cause !== null &&
      "digest" in cause &&
      typeof (cause as { digest?: unknown }).digest === "string" &&
      String((cause as { digest: string }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw cause;
    }
    console.error(cause);
    return new Response("Could not export calendar.", { status: 500 });
  }
}
