import Link from "next/link";
import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { ConnectionStatus } from "@prisma/client";

import {
  CourseMemberList,
  type CourseMember,
} from "@/components/courses/course-member-list";
import {
  CourseCalendarPanel,
  CourseTagsPanel,
} from "@/components/courses/course-setup-panel";
import { QuickEnrollButton } from "@/components/courses/quick-enroll-button";
import { SaveBookmarkButton } from "@/components/courses/save-bookmark-button";
import { CourseRemoveButton } from "@/components/forms/course-remove-button";
import { BackLink } from "@/components/nav/back-link";
import { requireOnboardedUser } from "@/lib/auth/guards";
import {
  DEFAULT_SCHOOL,
  getSchoolLabel,
  getSchoolMatchValues,
  normalizeSchoolCode,
} from "@/lib/constants/schools";
import { prisma } from "@/lib/db/prisma";
import { safeReturnPath } from "@/lib/nav/back";
import { weeklyOverlapMinutes, type SessionBlock } from "@/lib/queries/schedule-overlap";

export default async function CourseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const { courseId } = await params;
  const query = (await searchParams) ?? {};
  const backHref = safeReturnPath(query.returnTo, "/courses");
  const user = await requireOnboardedUser();

  const course = await prisma.course.findUnique({
    where: { id: courseId },
  });

  if (!course) {
    notFound();
  }

  const school = normalizeSchoolCode(course.school) ?? DEFAULT_SCHOOL;
  const schoolValues = getSchoolMatchValues(course.school);
  const schoolLabel = getSchoolLabel(course.school);

  const [membership, savedRow, totalMembers] = await Promise.all([
    prisma.userCourse.findFirst({
      where: { userId: user.id, courseId },
      include: {
        sessions: {
          orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
        },
        course: {
          include: {
            members: {
              where: {
                userId: { not: user.id },
                user: {
                  school: schoolValues.length ? { in: schoolValues } : undefined,
                  moderationBlocks: { none: { isActive: true } },
                  blocksInitiated: { none: { blockedId: user.id } },
                  blocksReceived: { none: { blockerId: user.id } },
                },
              },
              include: {
                user: true,
                sessions: true,
              },
            },
            _count: { select: { members: true } },
          },
        },
      },
    }),
    prisma.savedCourse.findUnique({
      where: {
        userId_courseId: { userId: user.id, courseId },
      },
    }),
    prisma.userCourse.count({ where: { courseId } }),
  ]);

  if (!membership) {
    const isSaved = Boolean(savedRow);
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-2">
          <BackLink href={backHref} label="Back to courses" className="-ml-2 mt-0.5" />
          <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {course.code ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                {course.code}
              </span>
            ) : null}
            <h2 className="truncate text-lg font-semibold">{course.name}</h2>
          </div>
          <p className="mt-1 text-[12px] text-muted-foreground">{schoolLabel}</p>
        </div>
      </div>

        <div className="rounded-2xl border border-border/60 bg-card px-4 py-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-2xl font-semibold leading-none tabular-nums">
                {totalMembers}
              </p>
              <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                classmate{totalMembers === 1 ? "" : "s"} enrolled
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              {isSaved ? "Saved · not on schedule" : "Not on schedule"}
            </span>
          </div>
          <p className="mt-2.5 text-[12px] leading-relaxed text-muted-foreground">
            Enroll to see classmates and join the course chat. After that, you
            can add this class to your calendar with your weekly time.
          </p>
        </div>

        <QuickEnrollButton courseId={course.id} variant="block" />

        <SaveBookmarkButton
          courseId={course.id}
          initialSaved={isSaved}
          variant="block"
        />
      </div>
    );
  }

  const mySessions: SessionBlock[] = await prisma.userCourse
    .findMany({
      where: { userId: user.id },
      include: { sessions: true },
    })
    .then((rows) =>
      rows.flatMap((row) =>
        row.sessions.map((s) => ({
          weekday: s.weekday,
          startMinute: s.startMinute,
          endMinute: s.endMinute,
        })),
      ),
    );

  const otherMemberIds = membership.course.members.map((m) => m.userId);
  const activeConnections = otherMemberIds.length
    ? await prisma.connection.findMany({
        where: {
          status: ConnectionStatus.ACTIVE,
          OR: [
            { userAId: user.id, userBId: { in: otherMemberIds } },
            { userAId: { in: otherMemberIds }, userBId: user.id },
          ],
        },
        select: {
          id: true,
          userAId: true,
          userBId: true,
        },
      })
    : [];

  const connectionIdByUserId = new Map<string, string>();
  for (const row of activeConnections) {
    const otherId = row.userAId === user.id ? row.userBId : row.userAId;
    connectionIdByUserId.set(otherId, row.id);
  }

  const memberList: CourseMember[] = membership.course.members.map((m) => {
    const theirSessions: SessionBlock[] = m.sessions.map((s) => ({
      weekday: s.weekday,
      startMinute: s.startMinute,
      endMinute: s.endMinute,
    }));

    const connectionId = connectionIdByUserId.get(m.userId);

    return {
      membershipId: m.id,
      userId: m.userId,
      nickname: m.user.nickname ?? "Student",
      avatarUrl: m.user.avatarUrl,
      major: m.user.major,
      semester: m.user.semester,
      school: m.user.school,
      bio: m.user.bio,
      verifiedStudent: m.user.verifiedStudent,
      studentVerificationStatus: m.user.studentVerificationStatus,
      intentions: m.intentions,
      overlapMinutes: weeklyOverlapMinutes(mySessions, theirSessions),
      threadState: connectionId
        ? { kind: "ACTIVE", connectionId }
        : { kind: "NONE" },
    };
  });

  memberList.sort((a, b) => b.overlapMinutes - a.overlapMinutes);

  const enrolledTotal = membership.course._count.members;
  const myCourseSessions = [...membership.sessions].sort((a, b) => {
    const weekdayOrder = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
    const da = weekdayOrder.indexOf(a.weekday);
    const db = weekdayOrder.indexOf(b.weekday);
    if (da !== db) return da - db;
    return a.startMinute - b.startMinute;
  });

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2">
        <BackLink href={backHref} label="Back to courses" className="-ml-2 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {membership.course.code ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                {membership.course.code}
              </span>
            ) : null}
            <h2 className="truncate text-lg font-semibold">{membership.course.name}</h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              <Users className="h-3 w-3" strokeWidth={2.25} />
              {enrolledTotal}
            </span>
          </div>
          <p className="mt-1 text-[12px] text-muted-foreground">{schoolLabel}</p>
          <div className="mt-2">
            <CourseRemoveButton
              courseId={membership.course.id}
              compact
              label="Unenroll"
            />
          </div>
        </div>
      </div>

      <CourseCalendarPanel
        course={{
          id: membership.course.id,
          code: membership.course.code,
          name: membership.course.name,
        }}
        intentions={[...membership.intentions]}
        initialSessions={myCourseSessions.map((session) => ({
          weekday: session.weekday,
          start: formatHM(session.startMinute),
          end: formatHM(session.endMinute),
          location: session.location ?? "",
        }))}
      />

      <CourseTagsPanel
        course={{
          id: membership.course.id,
          code: membership.course.code,
          name: membership.course.name,
        }}
        initialIntentions={[...membership.intentions]}
        sessions={myCourseSessions.map((session) => ({
          weekday: session.weekday,
          start: formatHM(session.startMinute),
          end: formatHM(session.endMinute),
          location: session.location ?? "",
        }))}
      />

      <Link
        href={`/courses/${membership.course.id}/chat`}
        className="flex items-center justify-between gap-3 rounded-[1.125rem] border border-border/60 bg-card px-4 py-3 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.06)] transition-colors active:bg-muted/40 [@media(hover:hover)]:hover:bg-muted/30"
      >
        <div className="min-w-0">
          <p className="text-[15px] font-semibold leading-tight text-foreground">Open group chat</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Talk with everyone in this course before starting 1:1 chats
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary">
          Chat
        </span>
      </Link>

      <CourseMemberList courseId={membership.course.id} members={memberList} />
    </div>
  );
}

function formatHM(minutes: number) {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}
