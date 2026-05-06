import "server-only";

import {
  CourseIntent,
  Prisma,
  type LanguageProficiency,
  type LanguageTag,
  type UserGender,
  type Weekday,
} from "@prisma/client";

import { getSchoolMatchValues } from "@/lib/constants/schools";
import { prisma } from "@/lib/db/prisma";
import { weeklyOverlapMinutes, type SessionBlock } from "@/lib/queries/schedule-overlap";

/**
 * MVP discover rule:
 *   - only show people who already share at least one course with you
 *   - rank primarily by how many courses you share
 *   - use verification and recency only as tie-breakers
 *
 * This keeps the page easy to understand: more shared classes means stronger
 * context, full stop.
 */

const INTENT_LABEL: Record<CourseIntent, string> = {
  STUDY_TOGETHER: "study together",
  EXAM_PREP: "prep for exams",
  GO_TO_CLASS_TOGETHER: "go to class together",
  EAT_AFTER_CLASS: "eat after class",
};

export type DiscoverCourseRef = {
  id: string;
  code: string | null;
  name: string;
};

export type DiscoverSharedCourse = DiscoverCourseRef & {
  overlapMinutes: number;
  intentions: CourseIntent[];
};

export type DiscoverWeeklySlot = {
  weekday: Weekday;
  startMinute: number;
  endMinute: number;
  courseCode: string | null;
  courseName: string;
  shared: boolean;
};

export type DiscoverHit = {
  userId: string;
  nickname: string;
  gender: UserGender;
  avatarUrl: string | null;
  major: string | null;
  semester: number | null;
  bio: string | null;
  school: string | null;
  languages: Array<{ tag: LanguageTag; proficiency: LanguageProficiency }>;
  verifiedStudent: boolean;
  studentVerificationStatus:
    | "UNVERIFIED"
    | "EMAIL_PENDING"
    | "VERIFIED"
    | "MANUAL_REVIEW_REQUIRED"
    | "REJECTED";
  lastActiveAt: Date | null;
  score: number;
  primaryReason: string;
  primaryCourse: DiscoverCourseRef;
  sharedCourseCount: number;
  overlapMinutes: number;
  intentHits: number;
  sharedCourses: DiscoverSharedCourse[];
  otherCourses: DiscoverCourseRef[];
  weeklySlots: DiscoverWeeklySlot[];
};

type MembershipLite = {
  courseId: string;
  intentions: CourseIntent[];
  sessions: { weekday: SessionBlock["weekday"]; startMinute: number; endMinute: number }[];
};

export type DiscoverQueryOptions = {
  /** Only people who share at least one course with you whose name/code matches. */
  courseQuery?: string;
};

export async function getDiscoverPeople(
  userId: string,
  opts?: DiscoverQueryOptions,
): Promise<DiscoverHit[]> {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      courses: {
        include: { course: true, sessions: true },
      },
      savedCourses: {
        include: { course: true },
      },
    },
  });

  const enrolledIds = me?.courses.map((m) => m.courseId) ?? [];
  const savedIds = me?.savedCourses.map((s) => s.courseId) ?? [];
  const myCourseIds = [...new Set([...enrolledIds, ...savedIds])];

  if (!me || myCourseIds.length === 0) {
    return [];
  }

  const myByCourse = new Map<string, MembershipLite>(
    me.courses.map((m) => [
      m.courseId,
      {
        courseId: m.courseId,
        intentions: m.intentions,
        sessions: m.sessions.map((s) => ({
          weekday: s.weekday,
          startMinute: s.startMinute,
          endMinute: s.endMinute,
        })),
      },
    ]),
  );
  const mySessions: SessionBlock[] = me.courses.flatMap((m) =>
    m.sessions.map((s) => ({
      weekday: s.weekday,
      startMinute: s.startMinute,
      endMinute: s.endMinute,
    })),
  );

  const schoolValues = getSchoolMatchValues(me.school);

  const where: Prisma.UserWhereInput = {
    id: { not: userId },
    school: schoolValues.length ? { in: schoolValues } : undefined,
    moderationBlocks: { none: { isActive: true } },
    blocksReceived: { none: { blockerId: userId } },
    blocksInitiated: { none: { blockedId: userId } },
    // M3 eligibility: must share at least one course with me.
    courses: { some: { courseId: { in: myCourseIds } } },
  };

  const myCourseIdsSet = new Set(myCourseIds);

  // Pull a generous window; we'll rescore and slice after. Note: we include
  // ALL of each candidate's courses (not just the ones shared with me) so we
  // can surface their full weekly context in the row ("also in MA0001",
  // weekly schedule preview, etc.).
  const candidates = await prisma.user.findMany({
    where,
    include: {
      courses: {
        include: { course: true, sessions: true },
      },
      userLanguages: true,
    },
    take: 200,
  });

  const hits: DiscoverHit[] = [];

  for (const person of candidates) {
    const sharedMemberships = person.courses.filter((c) =>
      myCourseIdsSet.has(c.courseId),
    );
    const otherMemberships = person.courses.filter(
      (c) => !myCourseIdsSet.has(c.courseId),
    );

    if (sharedMemberships.length === 0) continue; // where-clause guarantees this

    // Per-course intent matching. We only count intents the *other* person
    // explicitly marked alongside me on the SAME shared course — that's the
    // "both want to X in Y" signal.
    let totalIntentHits = 0;
    let bestIntentCourseIdx = -1;
    let bestIntentScore = -1;
    let bestIntentLabel: CourseIntent | null = null;

    let bestOverlapCourseIdx = -1;
    let bestOverlapCourseMinutes = -1;

    const sharedCourses: DiscoverSharedCourse[] = sharedMemberships.map(
      (theirMembership, idx) => {
        const mine = myByCourse.get(theirMembership.courseId) ?? {
          courseId: theirMembership.courseId,
          intentions: [] as CourseIntent[],
          sessions: [] as MembershipLite["sessions"],
        };

        const mineIntents = new Set(mine.intentions);
        const sharedIntents = theirMembership.intentions.filter((i) =>
          mineIntents.has(i),
        );
        totalIntentHits += sharedIntents.length;

        if (sharedIntents.length > bestIntentScore) {
          bestIntentScore = sharedIntents.length;
          bestIntentCourseIdx = idx;
          bestIntentLabel = sharedIntents[0] ?? null;
        }

        const theirSessionsThisCourse = theirMembership.sessions.map((s) => ({
          weekday: s.weekday,
          startMinute: s.startMinute,
          endMinute: s.endMinute,
        }));
        const courseOverlap = weeklyOverlapMinutes(
          mine.sessions,
          theirSessionsThisCourse,
        );
        if (courseOverlap > bestOverlapCourseMinutes) {
          bestOverlapCourseMinutes = courseOverlap;
          bestOverlapCourseIdx = idx;
        }

        return {
          id: theirMembership.course.id,
          code: theirMembership.course.code,
          name: theirMembership.course.name,
          overlapMinutes: courseOverlap,
          intentions: theirMembership.intentions,
        };
      },
    );

    // Global overlap (across all of my courses × all of theirs) — strongest
    // behavioural signal for "we're on campus together."
    const theirSessions: SessionBlock[] = person.courses.flatMap((m) =>
      m.sessions.map((s) => ({
        weekday: s.weekday,
        startMinute: s.startMinute,
        endMinute: s.endMinute,
      })),
    );
    const overlapMinutes = weeklyOverlapMinutes(mySessions, theirSessions);

    const score = sharedMemberships.length;

    // Pick the course that Invite should default to: the one driving the
    // biggest signal. Intent match > overlap contribution > first shared.
    const primaryCourseIdx =
      bestIntentScore > 0
        ? bestIntentCourseIdx
        : bestOverlapCourseMinutes > 0
          ? bestOverlapCourseIdx
          : 0;
    const primaryMembership = sharedMemberships[primaryCourseIdx];
    const primaryCourse: DiscoverCourseRef = {
      id: primaryMembership.course.id,
      code: primaryMembership.course.code,
      name: primaryMembership.course.name,
    };
    const courseRef = primaryCourse.code ?? primaryCourse.name;

    // primaryReason — single-line explanation for the row.
    let primaryReason: string;
    if (sharedMemberships.length >= 2) {
      primaryReason = `${sharedMemberships.length} shared courses`;
    } else if (bestIntentScore > 0 && bestIntentLabel) {
      primaryReason = `Both want to ${INTENT_LABEL[bestIntentLabel]} in ${courseRef}`;
    } else if (overlapMinutes >= 180) {
      primaryReason = `${formatOverlapShort(overlapMinutes)} weekly overlap · via ${courseRef}`;
    } else {
      primaryReason = `In ${courseRef} with you`;
    }

    const otherCourses: DiscoverCourseRef[] = otherMemberships.map((m) => ({
      id: m.course.id,
      code: m.course.code,
      name: m.course.name,
    }));

    const weeklySlots: DiscoverWeeklySlot[] = person.courses
      .flatMap((m) =>
        m.sessions.map((s) => ({
          weekday: s.weekday,
          startMinute: s.startMinute,
          endMinute: s.endMinute,
          courseCode: m.course.code,
          courseName: m.course.name,
          shared: myCourseIdsSet.has(m.courseId),
        })),
      )
      .sort(weeklySlotSort);

    // Keep sharedCourses sorted by strongest-signal-first so the UI can show
    // them in order without re-sorting on the client.
    sharedCourses.sort((a, b) => {
      if (b.intentions.length !== a.intentions.length) {
        return b.intentions.length - a.intentions.length;
      }
      return b.overlapMinutes - a.overlapMinutes;
    });

    hits.push({
      userId: person.id,
      nickname: person.nickname ?? "Student",
      gender: person.gender,
      avatarUrl: person.avatarUrl,
      major: person.major,
      semester: person.semester,
      bio: person.bio,
      school: person.school,
      languages: person.userLanguages.map((r) => ({
        tag: r.tag,
        proficiency: r.proficiency,
      })),
      verifiedStudent: person.verifiedStudent,
      studentVerificationStatus: person.studentVerificationStatus,
      lastActiveAt: person.lastActiveAt,
      score,
      primaryReason,
      primaryCourse,
      sharedCourseCount: sharedMemberships.length,
      overlapMinutes,
      intentHits: totalIntentHits,
      sharedCourses,
      otherCourses,
      weeklySlots,
    });
  }

  hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // tie 1: verified first
    if (a.verifiedStudent !== b.verifiedStudent) return a.verifiedStudent ? -1 : 1;
    // tie 2: most recently active first (null falls back to epoch = oldest)
    const aAt = a.lastActiveAt?.getTime() ?? 0;
    const bAt = b.lastActiveAt?.getTime() ?? 0;
    if (aAt !== bAt) return bAt - aAt;
    return 0;
  });

  return hits.slice(0, 40);
}

function formatOverlapShort(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h${m}m` : `${h}h`;
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

function weeklySlotSort(a: DiscoverWeeklySlot, b: DiscoverWeeklySlot): number {
  const dayDiff = WEEKDAY_ORDER[a.weekday] - WEEKDAY_ORDER[b.weekday];
  if (dayDiff !== 0) return dayDiff;
  return a.startMinute - b.startMinute;
}
