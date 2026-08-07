import "server-only";

import type { CourseIntent, Prisma, PrismaClient, Weekday } from "@prisma/client";

import { DEFAULT_SCHOOL, getSchoolMatchValues, normalizeSchoolCode, schoolOptions } from "@/lib/constants/schools";
import { getCurrentSemesterLabel } from "@/lib/constants/semester";
import {
  activeCourseMembershipWhere,
  courseMembershipActiveUntil,
} from "@/lib/courses/active-membership";
import { archivedCourseRestoreBlockReason } from "@/lib/courses/archived-course";
import { courseIdentityKey, sameCourseIdentityWhere } from "@/lib/courses/course-identity";
import { inboxCourseUnreadCounts } from "@/lib/queries/inbox-unread-counts";

type CourseDb = PrismaClient | Prisma.TransactionClient;

export const COURSE_LIST_LIMIT_MAX = 50;

export type CourseListScope = "popular" | "enrolled" | "saved" | "archived";

export type NativeCourseSession = {
  weekday: Weekday;
  startMinute: number;
  endMinute: number;
  location: string | null;
};

export type NativeCourseSummary = {
  id: string;
  code: string | null;
  name: string;
  instructorSummary: string | null;
  school: string;
  semesterLabel: string;
  memberCount: number;
  viewer: {
    enrolled: boolean;
    saved: boolean;
    canRestore?: boolean;
    restoreBlockReason?: "SCHOOL_MISMATCH" | "ACTIVE_EQUIVALENT" | null;
  };
  sessions: NativeCourseSession[];
  communitySubmitted: boolean;
};

export type NativeCourseSemesterReview = {
  semesterLabel: string;
  required: boolean;
  courseCount: number;
  courses: Array<{
    id: string;
    code: string | null;
    name: string;
    school: string;
    previousSemesterLabel: string;
    activeUntil: string;
    sessions: NativeCourseSession[];
  }>;
};

export async function loadCourseSemesterReview(
  db: CourseDb,
  options: { userId: string; now?: Date },
): Promise<NativeCourseSemesterReview> {
  const now = options.now ?? new Date();
  const semesterLabel = getCurrentSemesterLabel(now);
  const user = await db.user.findUnique({
    where: { id: options.userId },
    select: { courseReviewSemesterLabel: true, school: true },
  });
  const schoolValues = getSchoolMatchValues(user?.school);
  const schoolScope = schoolValues.length
    ? { course: { school: { in: schoolValues } } }
    : {};
  const [expired, active] = await Promise.all([
    db.userCourse.findMany({
      where: {
        userId: options.userId,
        activeUntil: { lt: now },
        ...schoolScope,
      },
      include: {
        course: true,
        sessions: { orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] },
      },
      orderBy: [{ activeUntil: "desc" }, { createdAt: "desc" }],
    }),
    db.userCourse.findMany({
      where: {
        userId: options.userId,
        ...activeCourseMembershipWhere(now),
        ...schoolScope,
      },
      select: { course: { select: { id: true, school: true, code: true } } },
    }),
  ]);

  const activeIdentities = new Set(
    active.map((membership) => courseIdentityKey(membership.course)),
  );
  const candidates = new Map<string, (typeof expired)[number]>();
  for (const membership of expired) {
    const identity = courseIdentityKey(membership.course);
    if (activeIdentities.has(identity) || candidates.has(identity)) continue;
    candidates.set(identity, membership);
  }
  const courses = [...candidates.values()].map((membership) => ({
    id: membership.course.id,
    code: membership.course.code,
    name: membership.course.name,
    school: membership.course.school,
    previousSemesterLabel: membership.course.semesterLabel,
    activeUntil: membership.activeUntil!.toISOString(),
    sessions: membership.sessions.map(toSessionDto),
  }));

  return {
    semesterLabel,
    required:
      courses.length > 0 &&
      user?.courseReviewSemesterLabel !== semesterLabel,
    courseCount: courses.length,
    courses,
  };
}

export class CourseSemesterReviewError extends Error {
  constructor(readonly code: "INVALID_COURSE") {
    super(code);
    this.name = "CourseSemesterReviewError";
  }
}

export async function confirmCourseSemesterReview(
  db: Prisma.TransactionClient,
  options: { userId: string; courseIds: string[]; now?: Date },
) {
  const now = options.now ?? new Date();
  const review = await loadCourseSemesterReview(db, {
    userId: options.userId,
    now,
  });
  const candidateIds = new Set(review.courses.map((course) => course.id));
  const selectedIds = [...new Set(options.courseIds)];
  if (selectedIds.some((courseId) => !candidateIds.has(courseId))) {
    throw new CourseSemesterReviewError("INVALID_COURSE");
  }

  if (selectedIds.length > 0) {
    await db.userCourse.updateMany({
      where: { userId: options.userId, courseId: { in: selectedIds } },
      data: { activeUntil: courseMembershipActiveUntil(now) },
    });
  }
  await db.user.update({
    where: { id: options.userId },
    data: { courseReviewSemesterLabel: review.semesterLabel },
  });

  return {
    semesterLabel: review.semesterLabel,
    renewedCount: selectedIds.length,
    archivedCount: review.courses.length - selectedIds.length,
  };
}

function decodeOffset(cursor: string | null) {
  if (!cursor) return 0;
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const match = /^courses:(\d+)$/.exec(decoded);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

function encodeOffset(offset: number) {
  return Buffer.from(`courses:${offset}`, "utf8").toString("base64url");
}

function normalizeCourseSchool(value: string | null | undefined, userSchool: string | null) {
  const requested = value?.trim();
  const profile = userSchool?.trim();
  return normalizeSchoolCode(requested)
    ?? (requested && requested.length <= 80 ? requested : null)
    ?? normalizeSchoolCode(profile)
    ?? (profile && profile.length <= 80 ? profile : null)
    ?? DEFAULT_SCHOOL;
}

function courseSchoolOptions(school: string) {
  const options: Array<{ code: string; shortLabel: string; name: string }> = schoolOptions.map(({ value, shortLabel, label }) => ({
    code: value,
    shortLabel,
    name: label,
  }));
  if (!options.some((option) => option.code === school)) {
    options.push({ code: school, shortLabel: school, name: school });
  }
  return options;
}

function courseSearchWhere(query: string): Prisma.CourseWhereInput {
  if (!query) return {};
  return {
    OR: [
      { code: { contains: query.toUpperCase() } },
      { name: { contains: query, mode: "insensitive" } },
      { instructorSummary: { contains: query, mode: "insensitive" } },
    ],
  };
}

export async function listCoursesForNative(
  db: CourseDb,
  options: {
    userId: string;
    userSchool: string | null;
    scope: CourseListScope;
    school?: string | null;
    query?: string | null;
    cursor?: string | null;
    limit: number;
  },
) {
  const now = new Date();
  const activeMembership = activeCourseMembershipWhere(now);
  const school = normalizeCourseSchool(options.school, options.userSchool);
  const semesterLabel = getCurrentSemesterLabel();
  const query = options.query?.trim().slice(0, 120) ?? "";
  const offset = decodeOffset(options.cursor ?? null);
  if (offset === null) return null;
  const take = Math.min(COURSE_LIST_LIMIT_MAX, Math.max(1, options.limit));

  let rows: NativeCourseSummary[];
  if (options.scope === "archived") {
    const archivedSchoolFilter = options.school?.trim()
      ? { school }
      : {};
    const [memberships, activeMemberships] = await Promise.all([
      db.userCourse.findMany({
        where: {
          userId: options.userId,
          activeUntil: { lt: now },
          course: { ...archivedSchoolFilter, ...courseSearchWhere(query) },
        },
        include: {
          course: {
            include: {
              _count: { select: { members: { where: activeMembership } } },
            },
          },
          sessions: { orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] },
        },
        orderBy: [{ activeUntil: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        skip: offset,
        take: take + 1,
      }),
      db.userCourse.findMany({
        where: { userId: options.userId, ...activeMembership },
        select: { course: { select: { id: true, school: true, code: true } } },
      }),
    ]);
    const saved = await db.savedCourse.findMany({
      where: {
        userId: options.userId,
        courseId: { in: memberships.map((membership) => membership.courseId) },
      },
      select: { courseId: true },
    });
    const savedIds = new Set(saved.map((row) => row.courseId));
    const activeCourseIdentities = new Set(
      activeMemberships.map((membership) => courseIdentityKey(membership.course)),
    );
    rows = memberships.map((membership) => {
      const restoreBlockReason = archivedCourseRestoreBlockReason({
        userSchool: options.userSchool,
        course: membership.course,
        activeCourseIdentities,
      });
      return {
        id: membership.course.id,
        code: membership.course.code,
        name: membership.course.name,
        instructorSummary: membership.course.instructorSummary,
        school: membership.course.school,
        semesterLabel: membership.course.semesterLabel,
        memberCount: membership.course._count.members,
        viewer: {
          enrolled: false,
          saved: savedIds.has(membership.course.id),
          canRestore: restoreBlockReason === null,
          restoreBlockReason,
        },
        sessions: membership.sessions.map(toSessionDto),
        communitySubmitted: Boolean(membership.course.submittedById),
      };
    });
  } else if (options.scope === "enrolled") {
    const memberships = await db.userCourse.findMany({
      where: {
        userId: options.userId,
        ...activeMembership,
        course: { school, ...courseSearchWhere(query) },
      },
      include: {
        course: {
          include: {
            _count: { select: { members: { where: activeMembership } } },
          },
        },
        sessions: { orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: offset,
      take: take + 1,
    });
    rows = memberships.map((membership) => ({
      id: membership.course.id,
      code: membership.course.code,
      name: membership.course.name,
      instructorSummary: membership.course.instructorSummary,
      school: membership.course.school,
      semesterLabel: membership.course.semesterLabel,
      memberCount: membership.course._count.members,
      viewer: { enrolled: true, saved: false },
      sessions: membership.sessions.map(toSessionDto),
      communitySubmitted: Boolean(membership.course.submittedById),
    }));
  } else if (options.scope === "saved") {
    const saved = await db.savedCourse.findMany({
      where: {
        userId: options.userId,
        course: { school, semesterLabel, ...courseSearchWhere(query) },
      },
      include: {
        course: {
          include: {
            _count: { select: { members: { where: activeMembership } } },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: offset,
      take: take + 1,
    });
    rows = saved.map(({ course }) => ({
      id: course.id,
      code: course.code,
      name: course.name,
      instructorSummary: course.instructorSummary,
      school: course.school,
      semesterLabel: course.semesterLabel,
      memberCount: course._count.members,
      viewer: { enrolled: false, saved: true },
      sessions: [],
      communitySubmitted: Boolean(course.submittedById),
    }));
  } else {
    const courses = await db.course.findMany({
      where: { school, semesterLabel, ...courseSearchWhere(query) },
      include: {
        _count: { select: { members: { where: activeMembership } } },
      },
      orderBy: [{ members: { _count: "desc" } }, { name: "asc" }, { id: "asc" }],
      skip: offset,
      take: take + 1,
    });
    const courseIds = courses.map((course) => course.id);
    const [memberships, saved] = await Promise.all([
      db.userCourse.findMany({
        where: {
          userId: options.userId,
          courseId: { in: courseIds },
          ...activeMembership,
        },
        include: { sessions: { orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] } },
      }),
      db.savedCourse.findMany({
        where: { userId: options.userId, courseId: { in: courseIds } },
        select: { courseId: true },
      }),
    ]);
    const membershipByCourse = new Map(memberships.map((row) => [row.courseId, row]));
    const savedIds = new Set(saved.map((row) => row.courseId));
    rows = courses.map((course) => {
      const membership = membershipByCourse.get(course.id);
      return {
        id: course.id,
        code: course.code,
        name: course.name,
        instructorSummary: course.instructorSummary,
        school: course.school,
        semesterLabel: course.semesterLabel,
        memberCount: course._count.members,
        viewer: { enrolled: Boolean(membership), saved: savedIds.has(course.id) },
        sessions: membership?.sessions.map(toSessionDto) ?? [],
        communitySubmitted: Boolean(course.submittedById),
      };
    });
  }

  const hasMore = rows.length > take;
  const courses = hasMore ? rows.slice(0, take) : rows;
  const semesterReview = await loadCourseSemesterReview(db, {
    userId: options.userId,
  });
  return {
    school,
    semesterLabel,
    scope: options.scope,
    query,
    schools: courseSchoolOptions(school),
    courses,
    semesterReview: {
      semesterLabel: semesterReview.semesterLabel,
      required: semesterReview.required,
      courseCount: semesterReview.courseCount,
    },
    nextCursor: hasMore ? encodeOffset(offset + take) : null,
  };
}

export async function matchCoursesForNative(
  db: CourseDb,
  options: {
    userId: string;
    userSchool: string | null;
    school?: string | null;
    terms: string[];
  },
) {
  const activeMembership = activeCourseMembershipWhere();
  const school = normalizeCourseSchool(options.school, options.userSchool);
  const semesterLabel = getCurrentSemesterLabel();
  const terms = [...new Set(options.terms.map((term) => term.trim()).filter(Boolean))].slice(0, 16);
  const courses = await db.course.findMany({
    where: {
      school,
      semesterLabel,
      OR: terms.map(courseSearchWhere),
    },
    include: {
      _count: { select: { members: { where: activeMembership } } },
    },
    orderBy: [{ members: { _count: "desc" } }, { name: "asc" }, { id: "asc" }],
    take: 60,
  });
  const courseIds = courses.map((course) => course.id);
  const [memberships, saved] = await Promise.all([
    db.userCourse.findMany({
      where: { userId: options.userId, courseId: { in: courseIds }, ...activeMembership },
      include: { sessions: { orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] } },
    }),
    db.savedCourse.findMany({
      where: { userId: options.userId, courseId: { in: courseIds } },
      select: { courseId: true },
    }),
  ]);
  const membershipByCourse = new Map(memberships.map((row) => [row.courseId, row]));
  const savedIds = new Set(saved.map((row) => row.courseId));
  return {
    school,
    semesterLabel,
    courses: courses.map((course): NativeCourseSummary => {
      const membership = membershipByCourse.get(course.id);
      return {
        id: course.id,
        code: course.code,
        name: course.name,
        instructorSummary: course.instructorSummary,
        school: course.school,
        semesterLabel: course.semesterLabel,
        memberCount: course._count.members,
        viewer: { enrolled: Boolean(membership), saved: savedIds.has(course.id) },
        sessions: membership?.sessions.map(toSessionDto) ?? [],
        communitySubmitted: Boolean(course.submittedById),
      };
    }),
  };
}

export async function loadCourseDetailForNative(
  db: CourseDb,
  options: { userId: string; courseId: string },
) {
  const activeMembership = activeCourseMembershipWhere();
  const course = await db.course.findUnique({
    where: { id: options.courseId },
    include: {
      officialScheduleVariants: {
        include: { sessions: true },
        orderBy: [{ label: "asc" }, { id: "asc" }],
      },
    },
  });
  if (!course) return null;

  const [membership, saved] = await Promise.all([
    db.userCourse.findFirst({
      where: {
        userId: options.userId,
        courseId: course.id,
        ...activeMembership,
      },
      include: { sessions: { orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] } },
    }),
    db.savedCourse.findUnique({
      where: { userId_courseId: { userId: options.userId, courseId: course.id } },
      select: { id: true },
    }),
  ]);

  const identityCourse = sameCourseIdentityWhere(course);
  const identityMemberships = await db.userCourse.findMany({
    where: {
      ...activeMembership,
      course: identityCourse,
    },
    select: { userId: true },
  });
  const memberCount = new Set(identityMemberships.map((row) => row.userId)).size;

  const members = membership
    ? await db.userCourse.findMany({
        where: {
          ...activeMembership,
          course: identityCourse,
          userId: { not: options.userId },
          user: {
            hideFromCourseMembers: false,
            moderationBlocks: { none: { isActive: true } },
            blocksInitiated: { none: { blockedId: options.userId } },
            blocksReceived: { none: { blockerId: options.userId } },
          },
        },
        include: { user: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 100,
      })
    : [];

  const unreadCount = membership
    ? (await inboxCourseUnreadCounts(options.userId, [course.id])).get(course.id) ?? 0
    : 0;

  return {
    course: {
      id: course.id,
      code: course.code,
      name: course.name,
      instructorSummary: course.instructorSummary,
      school: course.school,
      semesterLabel: course.semesterLabel,
      memberCount,
      officialScheduleSyncedAt: course.officialScheduleSyncedAt?.toISOString() ?? null,
      viewer: { enrolled: Boolean(membership), saved: Boolean(saved) },
      sessions: membership?.sessions.map(toSessionDto) ?? [],
      communitySubmitted: Boolean(course.submittedById),
    },
    membership: membership
      ? {
          id: membership.id,
          intentions: membership.intentions,
          sessions: membership.sessions.map(toSessionDto),
        }
      : null,
    officialScheduleVariants: course.officialScheduleVariants.map((variant) => ({
      fingerprint: variant.fingerprint,
      label: variant.label,
      sessions: [...variant.sessions]
        .sort(compareSessions)
        .map(toSessionDto),
    })),
    members: Array.from(
      new Map(members.map((member) => [member.userId, member])).values(),
    ).map((member) => ({
      userId: member.userId,
      username: member.user.username,
      nickname: member.user.nickname,
      avatarUrl: member.user.avatarUrl,
      tagline: member.user.bio,
      major: member.user.major,
      semester: member.user.semester,
      verifiedStudent: member.user.verifiedStudent,
      intentions: member.intentions,
    })),
    chat: { available: Boolean(membership), unreadCount },
  };
}

export function validCourseIntentions(value: CourseIntent[]) {
  return Array.from(new Set(value));
}

function compareSessions(a: { weekday: Weekday; startMinute: number }, b: { weekday: Weekday; startMinute: number }) {
  const order: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  return order.indexOf(a.weekday) - order.indexOf(b.weekday) || a.startMinute - b.startMinute;
}

function toSessionDto(session: {
  weekday: Weekday;
  startMinute: number;
  endMinute: number;
  location: string | null;
}): NativeCourseSession {
  return {
    weekday: session.weekday,
    startMinute: session.startMinute,
    endMinute: session.endMinute,
    location: session.location,
  };
}
