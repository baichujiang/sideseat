import { ConnectionStatus } from "@prisma/client";

import { DiscoverList } from "@/components/discover/discover-list";
import { TabKeepAliveSnapshot } from "@/components/layout/tab-keep-alive";
import { loadActiveDiscoverActivitiesForCity } from "@/lib/discover/load-active-discover-activities-for-city";
import { loadActiveDiscoverPostsForCity } from "@/lib/discover/load-active-discover-posts";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getServerDiscoverServedCity } from "@/lib/discover/discover-city-preference";
import { toPublicDiscoverPostRow } from "@/lib/discover/public-discover-post-row";
import { getServerAppLocale } from "@/lib/i18n/server-locale";

export default async function DiscoverPage() {
  const sessionUser = await getSessionUser();
  await getServerAppLocale();
  const servedCity = await getServerDiscoverServedCity();

  if (!sessionUser) {
    const posts = (await loadActiveDiscoverPostsForCity(servedCity, null)).map(
      toPublicDiscoverPostRow,
    );
    return (
      <TabKeepAliveSnapshot tab="discover">
        <div className="min-w-0 space-y-3">
          <DiscoverList
            posts={posts}
            servedCity={servedCity}
            viewerSession={{ signedIn: false, isGuest: true }}
          />
        </div>
      </TabKeepAliveSnapshot>
    );
  }
  const user = sessionUser;

  const savedCount = await prisma.savedCourse.count({ where: { userId: user.id } });

  const [loadedPosts, loadedActivities, myEnrolledCourses, activeConnections] = await Promise.all([
    loadActiveDiscoverPostsForCity(servedCity, user.id),
    loadActiveDiscoverActivitiesForCity(servedCity, user.id),
    prisma.userCourse.findMany({
      where: { userId: user.id },
      select: { courseId: true, course: { select: { id: true, code: true, name: true } } },
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
  const posts = loadedPosts
    .filter(
      (post) => post.userId === user.id || !connectedUserIds.has(post.userId),
    )
    .map(toPublicDiscoverPostRow);

  const enrolledCourses = myEnrolledCourses.map((uc) => ({
    id: uc.course.id,
    code: uc.course.code,
    name: uc.course.name,
  }));

  return (
    <TabKeepAliveSnapshot tab="discover">
      <div className="min-w-0 space-y-3">
        <DiscoverList
          posts={posts}
          activities={loadedActivities}
          savedCourseCount={savedCount}
          enrolledCourses={enrolledCourses}
          servedCity={servedCity}
          viewerSession={{ signedIn: true, isGuest: user.isGuest }}
        />
      </div>
    </TabKeepAliveSnapshot>
  );
}
