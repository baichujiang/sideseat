import { ClassmatePostStatus, ConnectionStatus } from "@prisma/client";

import { GuestAppCta } from "@/components/app/guest-app-cta";
import { OnboardingContinueCta } from "@/components/app/onboarding-continue-cta";
import { DiscoverList, type DiscoverRow } from "@/components/discover/discover-list";
import {
  classmatePostForDiscoverInclude,
  prismaClassmatePostToDiscoverRow,
} from "@/lib/discover/prisma-classmate-post-for-discover";
import type { DiscoverPostRow } from "@/lib/discover/discover-post-row";
import { getDevExampleDiscoverPosts } from "@/lib/discover/dev-example-classmate-posts";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getDiscoverPeople } from "@/lib/queries/discovery";
import { getServerDiscoverServedCity } from "@/lib/discover/discover-city-preference";
import { getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";

/**
 * Classmates is the people-first surface: everyone here already shares at
 * least one course with you, and the list stays simple by ranking strongest
 * shared-course overlap first. Existing active chats are filtered out so the
 * page remains focused on new introductions.
 */
export default async function DiscoverPage() {
  const sessionUser = await getSessionUser();
  const locale = await getServerAppLocale();
  const ui = getMessages(locale);
  if (!sessionUser) {
    return (
      <div className="-mt-3 min-w-0 space-y-3">
        <DiscoverList rows={[]} posts={[]} />
        <GuestAppCta
          returnTo="/discover"
          headline={ui.guest.discoverHeadline}
          body={ui.guest.discoverBody}
        />
      </div>
    );
  }
  const user = sessionUser;
  const servedCity = await getServerDiscoverServedCity();

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

  const [activePosts, myEnrolledCourses, savedRows] = await Promise.all([
    prisma.classmatePost.findMany({
      where: {
        status: ClassmatePostStatus.ACTIVE,
        expiresAt: { gt: new Date() },
        city: servedCity,
        user: {
          moderationBlocks: { none: { isActive: true } },
          blocksReceived: { none: { blockerId: user.id } },
          blocksInitiated: { none: { blockedId: user.id } },
        },
      },
      include: classmatePostForDiscoverInclude,
      orderBy: { createdAt: "desc" },
      take: 120,
    }),
    prisma.userCourse.findMany({
      where: { userId: user.id },
      select: { courseId: true, course: { select: { id: true, code: true, name: true } } },
    }),
    prisma.classmatePostSave.findMany({
      where: { userId: user.id },
      select: { classmatePostId: true },
    }),
  ]);

  const freshHits = freshHitsBase.filter((h) => !connectedUserIds.has(h.userId));
  const freshPosts = activePosts.filter(
    (post) => post.userId === user.id || !connectedUserIds.has(post.userId),
  );

  const savedPostIdSet = new Set(savedRows.map((r) => r.classmatePostId));

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

  const postsFromDb: DiscoverPostRow[] = freshPosts.map((post) =>
    prismaClassmatePostToDiscoverRow(post, user.id, {
      savedByViewer: savedPostIdSet.has(post.id),
    }),
  );

  /**
   * When `NEXT_PUBLIC_DISCOVER_DEV_EXAMPLE_POSTS=1`, prepend UI-only example cards (with images)
   * for layout testing — no DB rows; cards are non-navigating (`isDevExample` on each row).
   * Default off in production builds unless the env is set.
   */
  const posts: DiscoverPostRow[] =
    process.env.NEXT_PUBLIC_DISCOVER_DEV_EXAMPLE_POSTS === "1"
      ? [...getDevExampleDiscoverPosts(), ...postsFromDb]
      : postsFromDb;

  const enrolledCourses = myEnrolledCourses.map((uc) => ({
    id: uc.course.id,
    code: uc.course.code,
    name: uc.course.name,
  }));

  return (
    <div className="-mt-3 min-w-0 space-y-3">
      {!user.onboardingComplete ? (
        <OnboardingContinueCta title={ui.onboarding.discoverTitle} body={ui.onboarding.discoverBody} />
      ) : null}
      <DiscoverList
        rows={rows}
        posts={posts}
        savedCourseCount={savedCount}
        enrolledCourses={enrolledCourses}
        servedCity={servedCity}
      />
    </div>
  );
}
