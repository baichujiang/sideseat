import { ClassmatePostStatus } from "@prisma/client";

import type { DiscoverPostRow } from "@/lib/discover/discover-post-row";
import { getDevExampleDiscoverPosts } from "@/lib/discover/dev-example-classmate-posts";
import {
  classmatePostForDiscoverInclude,
  prismaClassmatePostToDiscoverRow,
} from "@/lib/discover/prisma-classmate-post-for-discover";
import {
  buildViewerCourseMatchIndex,
  courseMatchesViewer,
  type ViewerCourseMatchIndex,
} from "@/lib/discover/viewer-course-match";
import { activeCourseMembershipWhere } from "@/lib/courses/active-membership";
import { getSchoolMatchValues } from "@/lib/constants/schools";
import { prisma } from "@/lib/db/prisma";

type DiscoverPostViewerScope = {
  id: string;
  school: string | null;
  verifiedStudent: boolean;
  courses: ViewerCourseMatchIndex;
} | null;

function canViewerSeePost(post: DiscoverPostRow, viewer: DiscoverPostViewerScope) {
  if (!viewer) {
    return post.visibility === "CITY_INTERNATIONALS";
  }
  if (post.isOwn) return true;

  switch (post.visibility) {
    case "CITY_INTERNATIONALS":
      return true;
    case "VERIFIED_ONLY":
      return viewer.verifiedStudent;
    case "COURSEMATES_ONLY":
      return (post.linkedCourses ?? []).some((course) =>
        courseMatchesViewer(course, viewer.courses),
      );
    case "SCHOOL_ONLY":
    default:
      return Boolean(viewer.school && post.school && viewer.school === post.school);
  }
}

/** Active Discover posts for a city — browse without signing in. */
export async function loadActiveDiscoverPostsForCity(
  servedCity: string,
  viewerUserId?: string | null,
): Promise<DiscoverPostRow[]> {
  const activePosts = await prisma.classmatePost.findMany({
    where: {
      status: ClassmatePostStatus.ACTIVE,
      expiresAt: { gt: new Date() },
      city: servedCity,
      user: {
        moderationBlocks: { none: { isActive: true } },
        ...(viewerUserId
          ? {
              blocksReceived: { none: { blockerId: viewerUserId } },
              blocksInitiated: { none: { blockedId: viewerUserId } },
            }
          : {}),
      },
    },
    include: classmatePostForDiscoverInclude,
    orderBy: { createdAt: "desc" },
    take: 120,
  });

  const [savedRows, viewerProfile] = viewerUserId
    ? await Promise.all([
        prisma.classmatePostSave.findMany({
          where: { userId: viewerUserId },
          select: { classmatePostId: true },
        }),
        prisma.user.findUnique({
          where: { id: viewerUserId },
          select: {
            id: true,
            school: true,
            verifiedStudent: true,
            courses: {
              where: activeCourseMembershipWhere(),
              select: {
                course: { select: { id: true, code: true, school: true } },
              },
            },
          },
        }),
      ])
    : [[], null] as const;

  const savedPostIdSet = new Set<string>();
  if (viewerUserId) {
    for (const row of savedRows) savedPostIdSet.add(row.classmatePostId);
  }
  const viewer: DiscoverPostViewerScope = viewerProfile
    ? {
        id: viewerProfile.id,
        school: viewerProfile.school,
        verifiedStudent: viewerProfile.verifiedStudent,
        courses: buildViewerCourseMatchIndex(
          viewerProfile.courses
            .map((row) => row.course)
            .filter((course) => getSchoolMatchValues(viewerProfile.school).includes(course.school)),
        ),
      }
    : null;

  const postsFromDb: DiscoverPostRow[] = activePosts.map((post) =>
    prismaClassmatePostToDiscoverRow(post, viewerUserId ?? null, {
      savedByViewer: viewerUserId ? savedPostIdSet.has(post.id) : false,
    }),
  ).filter((post) => canViewerSeePost(post, viewer));

  return process.env.NEXT_PUBLIC_DISCOVER_DEV_EXAMPLE_POSTS === "1"
    ? [...getDevExampleDiscoverPosts(), ...postsFromDb]
    : postsFromDb;
}
