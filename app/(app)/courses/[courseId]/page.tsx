import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight, MessageCircle } from "lucide-react";
import { ConnectionStatus } from "@prisma/client";

import { CourseClassmatesCountChip } from "@/components/courses/course-classmates-count-chip";
import { CourseUnenrollFooter } from "@/components/courses/course-unenroll-footer";
import {
  CourseMemberList,
  type CourseMember,
} from "@/components/courses/course-member-list";
import { CourseCalendarPanel } from "@/components/courses/course-setup-panel";
import { CourseShareLinkAction } from "@/components/courses/course-share-link-action";
import { QuickEnrollButton } from "@/components/courses/quick-enroll-button";
import { SaveBookmarkButton } from "@/components/courses/save-bookmark-button";
import { BackLink } from "@/components/nav/back-link";
import { getSessionUser } from "@/lib/auth/session";
import {
  DEFAULT_SCHOOL,
  getSchoolByCode,
  getSchoolLabel,
  getSchoolMatchValues,
  normalizeSchoolCode,
} from "@/lib/constants/schools";
import { prisma } from "@/lib/db/prisma";
import { formatShortRelativeTime } from "@/lib/format/short-relative-time";
import { safeReturnPath } from "@/lib/nav/back";
import { inboxCourseUnreadCounts } from "@/lib/queries/inbox-unread-counts";
import { profileSectionLabelClassName } from "@/lib/ui/profile-section-label";
import { weeklyOverlapMinutes, type SessionBlock } from "@/lib/queries/schedule-overlap";
import { cn } from "@/lib/utils";

/** Course hub — matches enrolled / popular course cards: blue pill + border. */
const courseCodeBadgeClassName =
  "inline-flex shrink-0 items-center rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-semibold tabular-nums tracking-wide text-[#2563EB] dark:border-blue-800/50 dark:bg-blue-950/40 dark:text-blue-300";

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
  const [sessionUser, course, totalMembers] = await Promise.all([
    getSessionUser(),
    prisma.course.findUnique({
      where: { id: courseId },
    }),
    prisma.userCourse.count({ where: { courseId } }),
  ]);

  if (!course) {
    notFound();
  }

  if (sessionUser && !sessionUser.onboardingComplete) {
    redirect("/onboarding");
  }

  const school = normalizeSchoolCode(course.school) ?? DEFAULT_SCHOOL;
  const schoolValues = getSchoolMatchValues(course.school);
  const schoolLabel = getSchoolLabel(course.school);

  if (!sessionUser) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-2">
          <BackLink href={backHref} label="Back to courses" className="-ml-2" />
          <CourseShareLinkAction courseId={course.id} memberCount={totalMembers} variant="icon" />
        </div>

        <header className="space-y-3">
          <div className="space-y-1.5">
            <h1 className="page-screen-title-ink flex flex-wrap items-center gap-x-2 gap-y-1 leading-tight">
              {course.code ? <span className={courseCodeBadgeClassName}>{course.code}</span> : null}
              <span className="min-w-0">{course.name}</span>
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-classmates-sub dark:text-zinc-400">
              <span>{schoolLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {totalMembers <= 0 ? (
              <CourseClassmatesCountChip
                label="No one yet"
                title="No students have enrolled in this course yet"
              />
            ) : totalMembers === 1 ? (
              <CourseClassmatesCountChip
                label="1 classmate"
                title="One student is enrolled in this course"
              />
            ) : (
              <CourseClassmatesCountChip
                label={`${totalMembers} classmates`}
                title={`${totalMembers} students are enrolled in this course`}
                compactHeadline={String(totalMembers)}
              />
            )}
          </div>

          <p className="text-[13px] leading-snug text-classmates-sub dark:text-zinc-400">
            Sign in to join this course, open chat, and view member details.
          </p>
        </header>
      </div>
    );
  }

  const user = sessionUser;

  const [membership, savedRow] = await Promise.all([
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
                  hideFromCourseMembers: false,
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
  ]);

  if (!membership) {
    const isSaved = Boolean(savedRow);
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-2">
          <BackLink href={backHref} label="Back to courses" className="-ml-2" />
          <CourseShareLinkAction courseId={course.id} memberCount={totalMembers} variant="icon" />
        </div>

        <header className="space-y-3">
          <div className="space-y-1.5">
            <h1 className="page-screen-title-ink flex flex-wrap items-center gap-x-2 gap-y-1 leading-tight">
              {course.code ? <span className={courseCodeBadgeClassName}>{course.code}</span> : null}
              <span className="min-w-0">{course.name}</span>
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-classmates-sub dark:text-zinc-400">
              <span>{schoolLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {totalMembers <= 0 ? (
              <CourseClassmatesCountChip
                label="No one yet"
                title="No students have enrolled in this course yet"
              />
            ) : totalMembers === 1 ? (
              <CourseClassmatesCountChip
                label="1 classmate"
                title="One student is enrolled in this course"
              />
            ) : (
              <CourseClassmatesCountChip
                label={`${totalMembers} classmates`}
                title={`${totalMembers} students are enrolled in this course`}
                compactHeadline={String(totalMembers)}
              />
            )}
          </div>

          <p className="text-[13px] leading-snug text-classmates-sub dark:text-zinc-400">
            {totalMembers <= 0
              ? "No one has enrolled yet \u2014 be the first or share the course link."
              : totalMembers === 1
                ? "One person is in this course \u2014 enroll to connect."
                : "Enroll to join the hub, group chat, and your weekly schedule for this class."}
          </p>
        </header>

        <div className="space-y-3 border-t border-classmates-hairline pt-5 dark:border-border/60">
          <QuickEnrollButton courseId={course.id} variant="block" />

          <SaveBookmarkButton
            courseId={course.id}
            initialSaved={isSaved}
            variant="block"
          />
        </div>
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
      gender: m.user.gender,
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
  const enrolledOthers = Math.max(0, enrolledTotal - 1);
  const myCourseSessions = [...membership.sessions].sort((a, b) => {
    const weekdayOrder = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
    const da = weekdayOrder.indexOf(a.weekday);
    const db = weekdayOrder.indexOf(b.weekday);
    if (da !== db) return da - db;
    return a.startMinute - b.startMinute;
  });

  const [courseChatUnreadMap, courseRoomLatest] = await Promise.all([
    inboxCourseUnreadCounts(user.id, [membership.course.id]),
    prisma.courseRoomMessage.aggregate({
      where: { courseId: membership.course.id, deletedAt: null },
      _max: { createdAt: true },
    }),
  ]);
  const courseChatUnread = courseChatUnreadMap.get(membership.course.id) ?? 0;
  const courseChatLastAt = courseRoomLatest._max.createdAt;
  const courseChatLastActiveLabel =
    courseChatLastAt &&
    (() => {
      const short = formatShortRelativeTime(courseChatLastAt);
      return short === "<1m" ? "Last active just now" : `Last active ${short} ago`;
    })();

  const courseChatMetaBase = `${enrolledTotal} member${enrolledTotal === 1 ? "" : "s"}`;
  const courseChatMetaDetail =
    courseChatUnread > 0
      ? `${courseChatUnread} unread message${courseChatUnread === 1 ? "" : "s"}`
      : courseChatLastActiveLabel;

  const classmatesSchoolShort = getSchoolByCode(membership.course.school)?.shortLabel;

  return (
    <div className="space-y-5">
      {membership.inboxHiddenAt ? (
        <div className="rounded-lg border border-amber-200/80 bg-amber-50/50 px-3 py-2.5 dark:border-amber-900/40 dark:bg-amber-950/25">
          <form
            action={`/api/courses/${membership.course.id}/inbox-restore`}
            method="post"
            className="flex flex-wrap items-center gap-2"
          >
            <input type="hidden" name="returnTo" value={`/courses/${membership.course.id}`} />
            <p className="min-w-0 flex-1 text-[12px] leading-snug text-foreground">
              This course chat is hidden from Chats. You can still open group chat below.
            </p>
            <button
              type="submit"
              className="shrink-0 rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-semibold text-foreground shadow-sm transition hover:bg-muted/60"
            >
              Show in Chats
            </button>
          </form>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <BackLink href={backHref} label="Back to courses" className="-ml-2" />
        <CourseShareLinkAction courseId={membership.course.id} memberCount={enrolledTotal} variant="icon" />
      </div>

      <header className="space-y-3">
        <div className="space-y-1.5">
          <h1 className="page-screen-title-ink flex flex-wrap items-center gap-x-2 gap-y-1 leading-tight">
            {membership.course.code ? (
              <span className={courseCodeBadgeClassName}>{membership.course.code}</span>
            ) : null}
            <span className="min-w-0">{membership.course.name}</span>
          </h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-classmates-sub dark:text-zinc-400">
            <span>{schoolLabel}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {enrolledOthers <= 0 ? (
            <CourseClassmatesCountChip
              label="Just you"
              title="You’re the only enrolled student in this course so far"
            />
          ) : (
            <CourseClassmatesCountChip
              label={`${enrolledOthers} classmate${enrolledOthers === 1 ? "" : "s"}`}
              title={`${enrolledOthers} other student${enrolledOthers === 1 ? "" : "s"} enrolled in this course with you`}
              compactHeadline={String(enrolledOthers)}
            />
          )}
        </div>

        {enrolledOthers === 0 ? (
          <p className="text-[13px] leading-snug text-classmates-sub dark:text-zinc-400">
            No classmates yet — share the link so people can join.
          </p>
        ) : null}
      </header>

      <section className="space-y-2 border-t border-classmates-hairline pt-5 dark:border-border/60">
        <p className={cn(profileSectionLabelClassName, "!mb-0")}>Your week</p>
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
          layout="inline"
        />
      </section>

      <Link
        href={`/courses/${membership.course.id}/chat`}
        className="group flex items-center gap-3 rounded-2xl border border-classmates-hairline bg-white/60 px-4 py-3.5 shadow-[0_2px_8px_rgba(15,23,42,0.04)] transition hover:bg-white/90 active:scale-[0.99] dark:border-border/60 dark:bg-card/60 dark:shadow-[0_2px_8px_rgba(0,0,0,0.1)] dark:hover:bg-card/90"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EFF6FF] dark:bg-blue-950/50">
          <MessageCircle
            className="h-5 w-5 text-[#2563EB] dark:text-blue-400"
            strokeWidth={2.25}
            aria-hidden
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold leading-tight text-classmates-ink dark:text-foreground">
            Group chat
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-classmates-sub dark:text-zinc-400">
            {courseChatMetaBase}
            {courseChatUnread > 0 ? (
              <>
                {" \u00b7 "}
                <span className="font-semibold text-[#2563EB] dark:text-blue-400">{courseChatMetaDetail}</span>
              </>
            ) : courseChatMetaDetail ? (
              <>
                {" \u00b7 "}
                <span>{courseChatMetaDetail}</span>
              </>
            ) : null}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-classmates-hint dark:text-zinc-500" strokeWidth={2.5} aria-hidden />
      </Link>

      <CourseMemberList
        courseId={membership.course.id}
        members={memberList}
        schoolShortLabel={classmatesSchoolShort}
      />

      <CourseUnenrollFooter courseId={membership.course.id} courseName={membership.course.name} />
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
