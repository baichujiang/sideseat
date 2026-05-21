import { redirect } from "next/navigation";
import type { Route } from "next";
import { ClassmatePostStatus, type Prisma } from "@prisma/client";

import { GuestAppCta } from "@/components/app/guest-app-cta";
import { MyPostsHeaderShareMenu } from "@/components/inbox/my-posts-header-share-menu";
import { MyPostBuddyCard } from "@/components/profile/my-post-buddy-card";
import {
  DiscoverPostsMasonry,
  DiscoverPostsMasonryItem,
} from "@/components/profile/discover-posts-masonry";
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
import { classmatePostInsightCountsByPostId } from "@/lib/queries/classmate-post-insight-counts";

const myPostsInclude = {
  courses: { include: { course: { select: { id: true, code: true, name: true } } } },
  user: { include: { userLanguages: true } },
  study: true,
  meals: true,
  language: true,
  sport: true,
  images: { select: { url: true, sortOrder: true } },
} satisfies Prisma.ClassmatePostInclude;

type PostWithAuthorCourses = Prisma.ClassmatePostGetPayload<{ include: typeof myPostsInclude }>;

function toDiscoverPostRow(post: PostWithAuthorCourses, currentUserId: string): DiscoverPostRow {
  const imageUrls = mapPrismaClassmatePostImagesToUrls(post.images);
  return {
    id: post.id,
    category: post.category,
    city: post.city,
    title: post.title,
    body: post.body,
    createdAt: post.createdAt,
    expiresAt: post.expiresAt,
    isOwn: post.userId === currentUserId,
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
    studyMeta: mapPrismaStudyToDiscoverRow(post.study),
    mealsMeta: mapPrismaMealsToDiscoverRow(post.meals),
    languageMeta: mapPrismaLanguageToDiscoverRow(post.language),
    sportMeta: mapPrismaSportToDiscoverRow(post.sport),
    ...(imageUrls?.length ? { imageUrls } : {}),
  };
}

export default async function ProfileMyPostsPage() {
  const sessionUser = await getSessionUser();
  const locale = await getServerAppLocale();
  const ui = getMessages(locale);

  if (!sessionUser) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <BackLink fallback="/profile" label={ui.common.back} />
          <h1 className="page-screen-title">{ui.profile.myPostsPageTitle}</h1>
        </div>
        <GuestAppCta returnTo="/profile/my-posts" />
      </div>
    );
  }
  const user = sessionUser;

  const posts = await prisma.classmatePost.findMany({
    where: { userId: user.id },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 80,
    include: myPostsInclude,
  });

  const insightByPostId = await classmatePostInsightCountsByPostId(posts.map((p) => p.id));

  const active = posts.filter((p) => p.status === ClassmatePostStatus.ACTIVE && p.expiresAt > new Date());
  const archived = posts.filter((p) => !(p.status === ClassmatePostStatus.ACTIVE && p.expiresAt > new Date()));

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 px-0.5">
        <BackLink fallback="/profile" label={ui.common.back} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <h1 className="page-screen-title">{ui.profile.myPostsPageTitle}</h1>
          <p className="text-[13px] leading-snug text-muted-foreground">{ui.profile.myPostsPageSubtitle}</p>
        </div>
        <MyPostsHeaderShareMenu />
      </div>

      {!posts.length ? (
        <EmptyState
          title={ui.profile.myPostsEmptyTitle}
          description={ui.profile.myPostsEmptyDesc}
          action={
            <LinkButton href={"/discover" as Route} size="sm">
              {ui.profile.myPostsOpenDiscover}
            </LinkButton>
          }
        />
      ) : (
        <div className="space-y-6">
          {active.length > 0 ? (
            <section className="space-y-3">
              <h2 className="px-0.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-classmates-teal dark:text-teal-300">
                {ui.profile.myPostsSectionLive}
              </h2>
              <DiscoverPostsMasonry>
                {active.map((post) => (
                  <DiscoverPostsMasonryItem key={post.id}>
                    <MyPostBuddyCard
                      post={toDiscoverPostRow(post, user.id)}
                      status={post.status}
                      createdAt={post.createdAt}
                      updatedAt={post.updatedAt}
                      insights={insightByPostId.get(post.id) ?? { detailViews: 0, messageIntents: 0 }}
                      muted={false}
                    />
                  </DiscoverPostsMasonryItem>
                ))}
              </DiscoverPostsMasonry>
            </section>
          ) : null}

          {archived.length > 0 ? (
            <section className="space-y-3">
              <h2 className="px-0.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {ui.profile.myPostsSectionPast}
              </h2>
              <DiscoverPostsMasonry>
                {archived.map((post) => (
                  <DiscoverPostsMasonryItem key={post.id}>
                    <MyPostBuddyCard
                      post={toDiscoverPostRow(post, user.id)}
                      status={post.status}
                      createdAt={post.createdAt}
                      updatedAt={post.updatedAt}
                      insights={insightByPostId.get(post.id) ?? { detailViews: 0, messageIntents: 0 }}
                      muted
                    />
                  </DiscoverPostsMasonryItem>
                ))}
              </DiscoverPostsMasonry>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
