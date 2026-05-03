import type { Weekday } from "@prisma/client";
import { NextRequest } from "next/server";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { DEFAULT_SCHOOL, normalizeSchoolCode } from "@/lib/constants/schools";
import { getCurrentSemesterLabel } from "@/lib/constants/semester";
import { prisma } from "@/lib/db/prisma";
import { ok } from "@/lib/http";

type SessionShape = {
  weekday: Weekday;
  start: string;
  end: string;
};

type Variant = {
  fingerprint: string;
  userCount: number;
  sessions: SessionShape[];
};

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

const WEEKDAY_ORDER: Record<Weekday, number> = {
  MON: 0,
  TUE: 1,
  WED: 2,
  THU: 3,
  FRI: 4,
  SAT: 5,
  SUN: 6,
};

export async function GET(request: NextRequest) {
  const user = await requireOnboardedUser();
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim().toUpperCase();
  const courseId = url.searchParams.get("courseId")?.trim();
  const school = normalizeSchoolCode(user.school) ?? DEFAULT_SCHOOL;
  const semesterLabel = getCurrentSemesterLabel();

  if (!courseId && (!code || code.length < 2)) {
    return ok({ variants: [] as Variant[] });
  }

  const course = courseId
    ? await prisma.course.findUnique({
        where: { id: courseId },
        include: {
          members: {
            where: { userId: { not: user.id } },
            include: { sessions: true },
          },
        },
      })
    : await prisma.course.findFirst({
        where: { code: code!, school, semesterLabel },
        include: {
          members: {
            where: { userId: { not: user.id } },
            include: { sessions: true },
          },
        },
      });

  if (!course || course.members.length === 0) {
    return ok({ variants: [] as Variant[] });
  }

  const groups = new Map<string, { count: number; sessions: SessionShape[] }>();
  for (const membership of course.members) {
    if (membership.sessions.length === 0) continue;
    const sorted = [...membership.sessions].sort((a, b) => {
      const da = WEEKDAY_ORDER[a.weekday] - WEEKDAY_ORDER[b.weekday];
      if (da !== 0) return da;
      return a.startMinute - b.startMinute;
    });
    const shape: SessionShape[] = sorted.map((s) => ({
      weekday: s.weekday,
      start: formatMinutes(s.startMinute),
      end: formatMinutes(s.endMinute),
    }));
    const fingerprint = shape
      .map((s) => `${s.weekday} ${s.start}-${s.end}`)
      .join(" | ");
    const existing = groups.get(fingerprint);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(fingerprint, { count: 1, sessions: shape });
    }
  }

  const variants: Variant[] = [...groups.entries()]
    .map(([fingerprint, entry]) => ({
      fingerprint,
      userCount: entry.count,
      sessions: entry.sessions,
    }))
    .sort((a, b) => b.userCount - a.userCount)
    .slice(0, 3);

  return ok({ variants });
}
