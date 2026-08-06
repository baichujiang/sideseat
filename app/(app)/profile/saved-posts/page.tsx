import type { Route } from "next";
import type { Prisma } from "@prisma/client";

import { GuestAppCta } from "@/components/app/guest-app-cta";
import { SavedPostsBuddyFeed } from "@/components/profile/saved-posts-buddy-feed";
import { BackLink } from "@/components/nav/back-link";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/link-button";
import { getSessionUser } from "@/lib/auth/session";
import {
  mapPrismaLanguageToDiscoverRow,
  mapPrismaMealsToDiscoverRow,
  mapPrismaSportToDiscoverRow,
  mapPrismaStudyToDiscoverRow,
  mapPrismaClassmatePostImagesToUrls,
  type DiscoverPostRow,
} from "@/lib/discover/discover-post-row";
import { prisma } from "@/lib/db/prisma";
import { getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";

const savedPostInclude = {
  courses: { include: { course: { select: { id: true, code: true, name: true } } } },
  user: { include: { userLanguages: true } },
  study: true,
  meals: true,
  language: true,
  sport: true,
  images: { select: { url: true, sortOrder: true } },
  _count: { select: { saves: true } },
} satisfies Prisma.ClassmatePostInclude;

type PostWithAuthorCourses = Prisma.ClassmatePostGetPayload<{ include: typeof savedPostInclude }>;

function toDiscoverPostRow(post: PostWithAuthorCourses, currentUserId: string): DiscoverPostRow {
  const imageUrls = mapPrismaClassmatePostImagesToUrls(post.images);
  return {
    id: post.id,
    category: post.category,
    city: post.city,
    title: post.title,
    body: post.body,
    status: post.status,
    tags: post.tags,
    visibility: post.visibility,
    replyPreference: post.replyPreference,
    startsAt: post.startsAt,
    endsAt: post.endsAt,
    location: post.location,
    capacity: post.capacity,
    createdAt: post.createdAt,
    expiresAt: post.expiresAt,
    isOwn: post.userId === currentUserId,
    userId: post.user.id,
    nickname: post.user.nickname ?? post.user.username,
    tagline: post.user.bio,
    gender: post.user.gender,
    avatarUrl: post.user.avatarUrl,
    major: post.user.major,
    semester: post.user.semester,
    studentStatus: post.user.studentStatus,
    graduationYear: post.user.graduationYear,
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
    studyMeta: mapPrismaStudyToDiscoverRow(post.study),
    mealsMeta: mapPrismaMealsToDiscoverRow(post.meals),
    languageMeta: mapPrismaLanguageToDiscoverRow(post.language),
    sportMeta: mapPrismaSportToDiscoverRow(post.sport),
    interestedCount: post._count.saves,
    ...(imageUrls?.length ? { imageUrls } : {}),
  };
}

export default async function ProfileSavedPostsPage() {
  const sessionUser = await getSessionUser();
  const ui = getMessages(await getServerAppLocale());
  const sc = ui.savedClassmatePosts;

  if (!sessionUser) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <BackLink fallback="/profile" label={ui.common.back} />
          <h1 className="page-screen-title">{sc.screenTitle}</h1>
        </div>
        <GuestAppCta returnTo="/profile/saved-posts" />
      </div>
    );
  }

  const user = sessionUser;

  const saves = await prisma.classmatePostSave.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 80,
    include: { classmatePost: { include: savedPostInclude } },
  });

  const rows = saves.map((s) => toDiscoverPostRow(s.classmatePost, user.id));

  return (
    <div className="space-y-5 px-0.5">
      <div className="flex items-start gap-2">
        <BackLink fallback="/profile" label={ui.common.back} className="mt-0.5" />
        <div className="min-w-0">
          <h1 className="page-screen-title">{sc.screenTitle}</h1>
          <p className="page-screen-subtitle mt-0.5">{sc.screenSubtitle}</p>
        </div>
      </div>

      {!rows.length ? (
        <EmptyState
          title={sc.emptyTitle}
          description={sc.emptyDescription}
          action={
            <LinkButton href={"/discover" as Route} size="sm">
              {sc.emptyCta}
            </LinkButton>
          }
        />
      ) : (
        <SavedPostsBuddyFeed posts={rows} />
      )}
    </div>
  );
}
