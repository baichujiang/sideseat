import type { Route } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { GuestAppCta } from "@/components/app/guest-app-cta";
import { ClassmatePostDetailViewBeacon } from "@/components/discover/classmate-post-detail-view-beacon";
import { ClassmatePostDetailShareMenu } from "@/components/discover/classmate-post-detail-share-menu";
import { BuddyRequestBottomBar } from "@/components/discover/buddy-request-detail/buddy-request-bottom-bar";
import { BuddyRequestContent } from "@/components/discover/buddy-request-detail/buddy-request-content";
import { BuddyRequestDetailShell } from "@/components/discover/buddy-request-detail/buddy-request-detail-shell";
import { BuddyRequestMediaCarousel } from "@/components/discover/buddy-request-detail/buddy-request-media-carousel";
import {
  PlanDetailsCard,
  type BuddyPlanRow,
} from "@/components/discover/buddy-request-detail/plan-details-card";
import { BackLink } from "@/components/nav/back-link";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  buddyRequestPreferredTimeValue,
  buddyRequestStatusLabel,
  buddyRequestWhereValue,
} from "@/lib/discover/buddy-request-detail-meta";
import { getBuddyRequestDisplayStatus } from "@/lib/discover/buddy-request-status";
import { resolveBackHref } from "@/lib/nav/back";
import { DEFAULT_DISCOVER_SERVED_CITY } from "@/lib/discover/discover-city-name-keys";
import { getDiscoverCityDisplayLabel } from "@/lib/discover/discover-city-display";
import {
  mapPrismaLanguageToDiscoverRow,
  mapPrismaMealsToDiscoverRow,
  mapPrismaSportToDiscoverRow,
  mapPrismaStudyToDiscoverRow,
  mapPrismaClassmatePostImagesToUrls,
} from "@/lib/discover/discover-post-row";
import {
  buildViewerCourseMatchIndex,
  type ViewerCourseMatchIndex,
} from "@/lib/discover/viewer-course-match";
import type { AppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";
import {
  getClassmatePostDetailForViewer,
  type ClassmatePostDetail,
  type ClassmatePostDetailAuthor,
} from "@/lib/queries/classmate-post-detail";

function BuddyRequestPageHeader({
  backHref,
  backLabel,
  title,
  shareSlot,
}: {
  backHref: Route;
  backLabel: string;
  title: string;
  shareSlot?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <BackLink href={backHref} fallback="/discover" label={backLabel} />
      <h1 className="min-w-0 flex-1 truncate text-[17px] font-semibold text-foreground">{title}</h1>
      {shareSlot ? <div className="shrink-0">{shareSlot}</div> : null}
    </div>
  );
}

function buildBuddyPlanRows(
  locale: AppLocale,
  post: ClassmatePostDetail,
  displayStatus: ReturnType<typeof getBuddyRequestDisplayStatus>,
  cityLabel: string | null,
): BuddyPlanRow[] {
  const d = getMessages(locale).discoverBuddyDetail;
  const preferred = buddyRequestPreferredTimeValue(locale, post.studyMeta);
  const whenLabel = preferred ? d.rowPreferredTime : d.rowWhen;
  const whenValue = preferred ?? d.notSpecified;
  const whereRaw = buddyRequestWhereValue(locale, post.category, post.mealsMeta, post.studyMeta);
  const whereValue = whereRaw ?? d.notSpecified;
  const rows: BuddyPlanRow[] = [
    { label: whenLabel, value: whenValue },
    { label: d.rowWhere, value: whereValue },
    { label: d.rowStatus, value: buddyRequestStatusLabel(locale, displayStatus) },
  ];
  if (cityLabel?.trim()) {
    rows.push({ label: d.rowCity, value: cityLabel.trim() });
  }
  return rows;
}

export default async function DiscoverPostDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ postId: string }>;
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const { postId } = await params;
  const query = (await searchParams) ?? {};
  const locale = await getServerAppLocale();
  const ui = getMessages(locale);
  const detail = ui.discoverBuddyDetail;
  const sessionUser = await getSessionUser();
  const backHref = resolveBackHref(query.returnTo, "/discover") as Route;
  const postPath = `/discover/posts/${postId}`;
  const now = new Date();

  if (!sessionUser) {
    const post = await getClassmatePostDetailForGuest(postId, now);
    if (!post) {
      notFound();
    }
    const profilePeerHref = `/login?returnTo=${encodeURIComponent(
      `/users/${post.user.id}?returnTo=${encodeURIComponent(postPath)}`,
    )}` as Route;
    const author: ClassmatePostDetailAuthor = {
      ...post.user,
      languages: [],
    };
    const courses = post.courses.map((pc) => ({
      id: pc.course.id,
      code: pc.course.code,
      name: pc.course.name,
    }));
    const studyMeta = mapPrismaStudyToDiscoverRow(post.study);
    const mealsMeta = mapPrismaMealsToDiscoverRow(post.meals);
    const languageMeta = mapPrismaLanguageToDiscoverRow(post.language);
    const sportMeta = mapPrismaSportToDiscoverRow(post.sport);
    const imageUrls = mapPrismaClassmatePostImagesToUrls(post.images) ?? [];
    const cityLabel = getDiscoverCityDisplayLabel(post.city, ui.discover.cityNames);
    const bundle: ClassmatePostDetail = {
      id: post.id,
      userId: post.userId,
      category: post.category,
      title: post.title,
      body: post.body,
      city: post.city,
      status: post.status,
      expiresAt: post.expiresAt,
      updatedAt: post.updatedAt,
      createdAt: post.createdAt,
      studyMeta,
      mealsMeta,
      languageMeta,
      sportMeta,
      imageUrls,
      linkedCourses: courses,
      interestedCount: post._count.saves,
    };
    const displayStatus = getBuddyRequestDisplayStatus({
      status: post.status,
      expiresAt: post.expiresAt,
      now,
    });
    const signInHref = `/login?returnTo=${encodeURIComponent(postPath)}` as Route;
    const planRows = buildBuddyPlanRows(locale, bundle, displayStatus, cityLabel);

    return (
      <>
        <BuddyRequestPageHeader
          backHref={backHref}
          backLabel={ui.common.back}
          title={ui.discoverZone.tabBuddies}
        />
        <BuddyRequestDetailShell
          bottomBar={
            <BuddyRequestBottomBar
              variant="guest"
              displayStatus={displayStatus}
              viewerCanMessage={false}
              postId={post.id}
              authorId={author.id}
              postPath={postPath}
              initialSaved={false}
              signInHref={signInHref}
              messageCta={detail.messageAuthorCta}
              messageAria={detail.messageAuthorAria}
              signInCta={detail.signInToMessageCta}
              signInAria={detail.signInToMessageAria}
              manageCta={detail.manageRequestCta}
              manageAria={detail.manageRequestAria}
              expiredNote={detail.bottomBarRequestExpired}
              closedNote={detail.bottomBarRequestClosed}
              messagingUnavailable={detail.bottomBarMessagingUnavailable}
            />
          }
        >
          <BuddyRequestContent
            locale={locale}
            category={post.category}
            displayStatus={displayStatus}
            title={post.title}
            body={post.body}
            createdAt={post.createdAt}
            expiresAt={post.expiresAt}
            updatedAt={post.updatedAt}
            isAuthor={false}
            interestedCount={bundle.interestedCount}
            studyMeta={studyMeta}
            languageMeta={languageMeta}
            sportMeta={sportMeta}
            courses={courses}
            courseLinkBase={null}
            highlightViewerCourses={false}
            viewerCourseMatchIndex={null}
            author={{
              name: author.nickname ?? author.username,
              profileHref: profilePeerHref,
              avatarUrl: author.avatarUrl,
              school: author.school,
              verifiedStudent: author.verifiedStudent,
              studentVerificationStatus: author.studentVerificationStatus,
              profileAria: detail.viewProfileAria,
            }}
            planDetails={<PlanDetailsCard title={detail.planDetailsTitle} rows={planRows} />}
            media={
              imageUrls.length > 0 ? (
                <BuddyRequestMediaCarousel
                  urls={imageUrls}
                  category={post.category}
                  title={post.title}
                  ariaLabel={ui.discoverList.postCardImagesAria}
                />
              ) : undefined
            }
          />
          <div className="space-y-3 rounded-2xl border border-border/70 bg-card/50 px-4 py-3">
            <p className="text-[13px] leading-snug text-muted-foreground">{detail.guestIntro}</p>
            <GuestAppCta returnTo={postPath} />
          </div>
        </BuddyRequestDetailShell>
      </>
    );
  }

  const [data, saveRow] = await Promise.all([
    getClassmatePostDetailForViewer(postId, sessionUser.id),
    prisma.classmatePostSave.findUnique({
      where: {
        userId_classmatePostId: { userId: sessionUser.id, classmatePostId: postId },
      },
      select: { id: true },
    }),
  ]);
  if (!data.ok) {
    notFound();
  }

  const { post, author, isAuthor, viewerCanMessage } = data;
  const profilePeerHref = !isAuthor
    ? (`/users/${author.id}?returnTo=${encodeURIComponent(postPath)}` as Route)
    : ("/profile" as Route);

  const myEnrolled = await prisma.userCourse.findMany({
    where: { userId: sessionUser.id },
    select: { course: { select: { id: true, code: true } } },
  });
  const viewerCourseMatchIndex: ViewerCourseMatchIndex = buildViewerCourseMatchIndex(
    myEnrolled.map((uc) => ({ id: uc.course.id, code: uc.course.code })),
  );

  const cityLabel = getDiscoverCityDisplayLabel(post.city, ui.discover.cityNames);
  const displayStatus = getBuddyRequestDisplayStatus({
    status: post.status,
    expiresAt: post.expiresAt,
    now,
  });
  const planRows = buildBuddyPlanRows(locale, post, displayStatus, cityLabel);
  const manageHref = `/profile/my-posts?returnTo=${encodeURIComponent(postPath)}` as Route;
  const peerCourseId = post.linkedCourses[0]?.id;

  const shareSlot = (
    <ClassmatePostDetailShareMenu
      title={post.title}
      body={post.body}
      postPath={postPath}
      idleAriaLabel={detail.shareRequestAria}
    />
  );

  const bottomBar = isAuthor ? (
    <BuddyRequestBottomBar
      variant="author"
      displayStatus={displayStatus}
      viewerCanMessage={false}
      postId={post.id}
      authorId={author.id}
      postPath={postPath}
      initialSaved={Boolean(saveRow)}
      manageHref={manageHref}
      messageCta={detail.messageAuthorCta}
      messageAria={detail.messageAuthorAria}
      signInCta={detail.signInToMessageCta}
      signInAria={detail.signInToMessageAria}
      manageCta={detail.manageRequestCta}
      manageAria={detail.manageRequestAria}
      expiredNote={detail.bottomBarRequestExpired}
      closedNote={detail.bottomBarRequestClosed}
      messagingUnavailable={detail.bottomBarMessagingUnavailable}
    />
  ) : (
    <BuddyRequestBottomBar
      variant="peer"
      displayStatus={displayStatus}
      viewerCanMessage={viewerCanMessage}
      postId={post.id}
      authorId={author.id}
      peerCourseId={peerCourseId}
      postPath={postPath}
      initialSaved={Boolean(saveRow)}
      messageCta={detail.messageAuthorCta}
      messageAria={detail.messageAuthorAria}
      signInCta={detail.signInToMessageCta}
      signInAria={detail.signInToMessageAria}
      manageCta={detail.manageRequestCta}
      manageAria={detail.manageRequestAria}
      expiredNote={detail.bottomBarRequestExpired}
      closedNote={detail.bottomBarRequestClosed}
      messagingUnavailable={detail.bottomBarMessagingUnavailable}
    />
  );

  return (
    <>
      <BuddyRequestPageHeader
        backHref={backHref}
        backLabel={ui.common.back}
        title={ui.discoverZone.tabBuddies}
        shareSlot={shareSlot}
      />
      <BuddyRequestDetailShell bottomBar={bottomBar}>
        {!isAuthor ? <ClassmatePostDetailViewBeacon postId={post.id} /> : null}
        <BuddyRequestContent
          locale={locale}
          category={post.category}
          displayStatus={displayStatus}
          title={post.title}
          body={post.body}
          createdAt={post.createdAt}
          expiresAt={post.expiresAt}
          updatedAt={post.updatedAt}
          isAuthor={isAuthor}
          interestedCount={post.interestedCount}
          studyMeta={post.studyMeta}
          languageMeta={post.languageMeta}
          sportMeta={post.sportMeta}
          courses={post.linkedCourses}
          courseLinkBase="/courses"
          highlightViewerCourses
          viewerCourseMatchIndex={viewerCourseMatchIndex}
          author={{
            name: author.nickname ?? author.username,
            profileHref: profilePeerHref,
            avatarUrl: author.avatarUrl,
            school: author.school,
            verifiedStudent: author.verifiedStudent,
            studentVerificationStatus: author.studentVerificationStatus,
            profileAria: !isAuthor ? detail.viewProfileAria : undefined,
          }}
          planDetails={<PlanDetailsCard title={detail.planDetailsTitle} rows={planRows} />}
          media={
            post.imageUrls.length > 0 ? (
              <BuddyRequestMediaCarousel
                urls={post.imageUrls}
                category={post.category}
                title={post.title}
                ariaLabel={ui.discoverList.postCardImagesAria}
              />
            ) : undefined
          }
        />
      </BuddyRequestDetailShell>
    </>
  );
}

async function getClassmatePostDetailForGuest(postId: string, now: Date) {
  return prisma.classmatePost.findFirst({
    where: {
      id: postId,
      city: DEFAULT_DISCOVER_SERVED_CITY,
      OR: [{ status: "ACTIVE" }, { status: "CLOSED" }],
      expiresAt: { gt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 7) },
      user: {
        moderationBlocks: { none: { isActive: true } },
      },
    },
    select: {
      id: true,
      category: true,
      city: true,
      title: true,
      body: true,
      status: true,
      expiresAt: true,
      updatedAt: true,
      createdAt: true,
      userId: true,
      user: {
        select: {
          id: true,
          username: true,
          nickname: true,
          avatarUrl: true,
          major: true,
          semester: true,
          school: true,
          verifiedStudent: true,
          studentVerificationStatus: true,
        },
      },
      courses: { select: { course: { select: { id: true, code: true, name: true } } } },
      study: true,
      meals: true,
      language: true,
      sport: true,
      images: { select: { url: true, sortOrder: true } },
      _count: { select: { saves: true } },
    },
  });
}
