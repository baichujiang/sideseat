import { redirect } from "next/navigation";
import type { Route } from "next";
import { ClassmatePostStatus, type Prisma } from "@prisma/client";

import { GuestAppCta } from "@/components/app/guest-app-cta";
import { MyPostsDiscoverPostCard } from "@/components/inbox/my-posts-discover-post-card";
import { MyPostsHeaderShareMenu } from "@/components/inbox/my-posts-header-share-menu";
import { BackLink } from "@/components/nav/back-link";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/link-button";
import { getSessionUser } from "@/lib/auth/session";
import { buildViewerCourseMatchIndex } from "@/lib/discover/viewer-course-match";
import type { DiscoverPostRow } from "@/lib/discover/discover-post-row";
import { prisma } from "@/lib/db/prisma";
import { getServerAppLocale } from "@/lib/i18n/server-locale";
import { classmatePostInsightCountsByPostId } from "@/lib/queries/classmate-post-insight-counts";

const myPostsInclude = {
  courses: { include: { course: { select: { id: true, code: true, name: true } } } },
  user: { include: { userLanguages: true } },
} satisfies Prisma.ClassmatePostInclude;

type PostWithAuthorCourses = Prisma.ClassmatePostGetPayload<{ include: typeof myPostsInclude }>;

function toDiscoverPostRow(post: PostWithAuthorCourses, currentUserId: string): DiscoverPostRow {
  return {
    id: post.id,
    category: post.category,
    city: post.city,
    title: post.title,
    body: post.body,
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
  };
}

export default async function InboxMyPostsPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <BackLink href="/inbox" label="Back" />
          <h1 className="page-screen-title">My posts</h1>
        </div>
        <GuestAppCta returnTo="/inbox/my-posts" />
      </div>
    );
  }
  if (!sessionUser.onboardingComplete) {
    redirect("/onboarding");
  }
  const user = sessionUser;
  const locale = await getServerAppLocale();

  const [posts, myEnrolledCourses] = await Promise.all([
    prisma.classmatePost.findMany({
      where: { userId: user.id },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 80,
      include: myPostsInclude,
    }),
    prisma.userCourse.findMany({
      where: { userId: user.id },
      select: { course: { select: { id: true, code: true, name: true } } },
    }),
  ]);

  const viewerCourseMatchIndex = buildViewerCourseMatchIndex(
    myEnrolledCourses.map((uc) => ({ id: uc.course.id, code: uc.course.code })),
  );

  const insightByPostId = await classmatePostInsightCountsByPostId(posts.map((p) => p.id));

  const active = posts.filter((p) => p.status === ClassmatePostStatus.ACTIVE && p.expiresAt > new Date());
  const archived = posts.filter((p) => !(p.status === ClassmatePostStatus.ACTIVE && p.expiresAt > new Date()));

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 px-0.5">
        <BackLink href="/inbox" label="Back" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <h1 className="page-screen-title">My posts</h1>
          <p className="text-[13px] leading-snug text-muted-foreground">
            Discover posts you published — classmates see them on the Discover tab. Views and message taps below
            are unique classmates (only you see them).
          </p>
        </div>
        <MyPostsHeaderShareMenu />
      </div>

      {!posts.length ? (
        <EmptyState
          title="No posts yet"
          description="Create a post from Discover to find study partners, meals, sports, or language practice."
          action={
            <LinkButton href={"/discover" as Route} size="sm">
              Open Discover
            </LinkButton>
          }
        />
      ) : (
        <div className="space-y-6">
          {active.length > 0 ? (
            <section className="space-y-3">
              <h2 className="px-0.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-classmates-teal dark:text-teal-300">
                Live on Discover
              </h2>
              <ul className="space-y-2.5">
                {active.map((post) => (
                  <MyPostsDiscoverPostCard
                    key={post.id}
                    locale={locale}
                    post={toDiscoverPostRow(post, user.id)}
                    viewerCourseMatchIndex={viewerCourseMatchIndex}
                    status={post.status}
                    createdAt={post.createdAt}
                    updatedAt={post.updatedAt}
                    insights={insightByPostId.get(post.id) ?? { detailViews: 0, messageIntents: 0 }}
                    muted={false}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {archived.length > 0 ? (
            <section className="space-y-3">
              <h2 className="px-0.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Past
              </h2>
              <ul className="space-y-2.5">
                {archived.map((post) => (
                  <MyPostsDiscoverPostCard
                    key={post.id}
                    locale={locale}
                    post={toDiscoverPostRow(post, user.id)}
                    viewerCourseMatchIndex={viewerCourseMatchIndex}
                    status={post.status}
                    createdAt={post.createdAt}
                    updatedAt={post.updatedAt}
                    insights={insightByPostId.get(post.id) ?? { detailViews: 0, messageIntents: 0 }}
                    muted
                  />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
