import { ClassmatePostStatus, ConnectionStatus } from "@prisma/client";
import { ChevronDown, MapPin } from "lucide-react";

import { cn } from "@/lib/utils";

import { GuestAppCta } from "@/components/app/guest-app-cta";
import { OnboardingContinueCta } from "@/components/app/onboarding-continue-cta";
import {
  DiscoverList,
  type DiscoverPostRow,
  type DiscoverRow,
} from "@/components/discover/discover-list";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getDiscoverPeople } from "@/lib/queries/discovery";

/**
 * Classmates is the people-first surface: everyone here already shares at
 * least one course with you, and the list stays simple by ranking strongest
 * shared-course overlap first. Existing active chats are filtered out so the
 * page remains focused on new introductions.
 */
export default async function DiscoverPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return (
      <div className="space-y-3">
        <PageHeader />
        <DiscoverList rows={[]} posts={[]} allowSearch={false} />
        <GuestAppCta
          returnTo="/discover"
          headline="Sign in to find classmates"
          body="Search people at your school and see who shares your courses."
        />
      </div>
    );
  }
  const user = sessionUser;

  const hits = await getDiscoverPeople(user.id);
  const freshHitsBase = hits;
  const savedCount = await prisma.savedCourse.count({ where: { userId: user.id } });

  // Filter out people we're already chatting with. Once connected, Inbox is
  // the right surface; Discover should only offer net-new introductions.
  const otherIds = freshHitsBase.map((h) => h.userId);
  const activeConnections = await prisma.connection.findMany({
    where: {
      status: ConnectionStatus.ACTIVE,
      OR: [
        { userAId: user.id, userBId: { in: otherIds } },
        { userAId: { in: otherIds }, userBId: user.id },
      ],
    },
    select: { userAId: true, userBId: true },
  });
  const connectedUserIds = new Set<string>(
    activeConnections.map((c) => (c.userAId === user.id ? c.userBId : c.userAId)),
  );

  const [activePosts, myEnrolledCourses] = await Promise.all([
    prisma.classmatePost.findMany({
      where: {
        status: ClassmatePostStatus.ACTIVE,
        expiresAt: { gt: new Date() },
        city: "Munich",
        user: {
          moderationBlocks: { none: { isActive: true } },
          blocksReceived: { none: { blockerId: user.id } },
          blocksInitiated: { none: { blockedId: user.id } },
        },
      },
      include: {
        user: { include: { userLanguages: true } },
        courses: { include: { course: { select: { id: true, code: true, name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 120,
    }),
    prisma.userCourse.findMany({
      where: { userId: user.id },
      select: { courseId: true, course: { select: { id: true, code: true, name: true } } },
    }),
  ]);

  const freshHits = freshHitsBase.filter((h) => !connectedUserIds.has(h.userId));
  const freshPosts = activePosts.filter(
    (post) => post.userId === user.id || !connectedUserIds.has(post.userId),
  );

  const rows: DiscoverRow[] = freshHits.map((h) => ({
    userId: h.userId,
    nickname: h.nickname,
    gender: h.gender,
    avatarUrl: h.avatarUrl,
    major: h.major,
    semester: h.semester,
    bio: h.bio,
    school: h.school,
    languages: h.languages,
    verifiedStudent: h.verifiedStudent,
    studentVerificationStatus: h.studentVerificationStatus,
    primaryReason: h.primaryReason,
    primaryCourse: h.primaryCourse,
    sharedCourses: h.sharedCourses,
    otherCourses: h.otherCourses,
    connectionId: null,
  }));

  const posts: DiscoverPostRow[] = freshPosts.map((post) => ({
    id: post.id,
    category: post.category,
    city: post.city,
    title: post.title,
    body: post.body,
    expiresAt: post.expiresAt,
    isOwn: post.user.id === user.id,
    userId: post.user.id,
    nickname: post.user.nickname ?? post.user.username,
    gender: post.user.gender,
    avatarUrl: post.user.avatarUrl,
    major: post.user.major,
    semester: post.user.semester,
    school: post.user.school,
    languages: post.user.userLanguages.map((r) => ({
      tag: r.tag,
      proficiency: r.proficiency,
    })),
    verifiedStudent: post.user.verifiedStudent,
    studentVerificationStatus: post.user.studentVerificationStatus,
    linkedCourses: post.courses.map((pc) => ({
      id: pc.course.id,
      code: pc.course.code,
      name: pc.course.name,
    })),
  }));

  const enrolledCourses = myEnrolledCourses.map((uc) => ({
    id: uc.course.id,
    code: uc.course.code,
    name: uc.course.name,
  }));

  return (
    <div className="space-y-3">
      <PageHeader />
      {!user.onboardingComplete ? (
        <OnboardingContinueCta
          title="Finish setup for better classmate matches"
          body="You can browse people now. Completing your profile sharpens course overlap, language, and program suggestions."
        />
      ) : null}
      <DiscoverList rows={rows} posts={posts} savedCourseCount={savedCount} enrolledCourses={enrolledCourses} />
    </div>
  );
}

function PageHeader() {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 space-y-0.5">
        <h1 className="page-screen-title">Classmates</h1>
        <p className="page-screen-subtitle mt-0.5">
          Find classmates through shared courses and social plans.
        </p>
      </div>
      <details className="group/details relative shrink-0">
        <summary
          aria-label="Area filter: Munich. Open to see options."
          className={cn(
            "inline-flex h-10 cursor-pointer list-none select-none items-center gap-1.5 rounded-full border border-[#E7E0D6] bg-white px-3 pr-2.5 text-[13px] font-medium text-foreground shadow-[0_2px_12px_-4px_rgba(15,23,42,0.06)] transition-colors",
            "hover:border-border hover:bg-muted/35 active:bg-muted/50",
            "[&::-webkit-details-marker]:hidden",
          )}
        >
          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2.25} aria-hidden />
          <span className="shrink-0">Munich</span>
          <ChevronDown
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-open/details:rotate-180"
            strokeWidth={2.25}
            aria-hidden
          />
        </summary>
        <div className="absolute right-0 z-20 mt-1.5 min-w-[13rem] rounded-xl border border-[#E7E0D6] bg-white py-1 shadow-lg">
          <div
            className="px-3 py-2 text-[13px] font-medium text-foreground"
            role="status"
          >
            <span className="text-muted-foreground">Area · </span>
            Munich
          </div>
          <p className="border-t border-border px-3 py-2 text-[11px] leading-snug text-muted-foreground">
            More cities and radius filters are on the way. Everything here is scoped to Munich for now.
          </p>
        </div>
      </details>
    </div>
  );
}
