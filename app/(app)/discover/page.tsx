import { ClassmatePostStatus, ConnectionStatus } from "@prisma/client";

import { GuestAppCta } from "@/components/app/guest-app-cta";
import { DiscoverList } from "@/components/discover/discover-list";
import {
  classmatePostForDiscoverInclude,
  prismaClassmatePostToDiscoverRow,
} from "@/lib/discover/prisma-classmate-post-for-discover";
import type { DiscoverPostRow } from "@/lib/discover/discover-post-row";
import { getDevExampleDiscoverPosts } from "@/lib/discover/dev-example-classmate-posts";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getServerDiscoverServedCity } from "@/lib/discover/discover-city-preference";
import { getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";

export default async function DiscoverPage() {
  const sessionUser = await getSessionUser();
  const locale = await getServerAppLocale();
  const ui = getMessages(locale);
  if (!sessionUser) {
    return (
      <div className="-mt-3 min-w-0 space-y-3">
        <DiscoverList posts={[]} />
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

  const savedCount = await prisma.savedCourse.count({ where: { userId: user.id } });

  const [activePosts, myEnrolledCourses, savedRows, activeConnections] = await Promise.all([
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
    prisma.connection.findMany({
      where: {
        status: ConnectionStatus.ACTIVE,
        OR: [{ userAId: user.id }, { userBId: user.id }],
      },
      select: { userAId: true, userBId: true },
    }),
  ]);

  const connectedUserIds = new Set<string>(
    activeConnections.map((c) => (c.userAId === user.id ? c.userBId : c.userAId)),
  );

  const freshPosts = activePosts.filter(
    (post) => post.userId === user.id || !connectedUserIds.has(post.userId),
  );

  const savedPostIdSet = new Set(savedRows.map((r) => r.classmatePostId));

  const postsFromDb: DiscoverPostRow[] = freshPosts.map((post) =>
    prismaClassmatePostToDiscoverRow(post, user.id, {
      savedByViewer: savedPostIdSet.has(post.id),
    }),
  );

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
      <DiscoverList
        posts={posts}
        savedCourseCount={savedCount}
        enrolledCourses={enrolledCourses}
        servedCity={servedCity}
      />
    </div>
  );
}
