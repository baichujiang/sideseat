import { ClassmatePostStatus, ConnectionStatus } from "@prisma/client";
import { ChevronDown, MapPin } from "lucide-react";

import { cn } from "@/lib/utils";

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
import { DEFAULT_DISCOVER_SERVED_CITY } from "@/lib/discover/discover-city-name-keys";
import { getDiscoverCityDisplayLabel } from "@/lib/discover/discover-city-display";
import type { AppMessages } from "@/lib/i18n/messages";
import { formatMessage, getMessages } from "@/lib/i18n/messages";
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
      <div className="space-y-3">
        <DiscoverPageHeader ui={ui} />
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
        city: DEFAULT_DISCOVER_SERVED_CITY,
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
    <div className="space-y-3">
      <DiscoverPageHeader ui={ui} />
      {!user.onboardingComplete ? (
        <OnboardingContinueCta title={ui.onboarding.discoverTitle} body={ui.onboarding.discoverBody} />
      ) : null}
      <DiscoverList rows={rows} posts={posts} savedCourseCount={savedCount} enrolledCourses={enrolledCourses} />
    </div>
  );
}

function DiscoverPageHeader({ ui }: { ui: AppMessages }) {
  const areaCityLabel = getDiscoverCityDisplayLabel(DEFAULT_DISCOVER_SERVED_CITY, ui.discover.cityNames);
  const areaFilterAria = formatMessage(ui.discover.areaFilterAria, { city: areaCityLabel });
  const areaComingSoon = formatMessage(ui.discover.areaComingSoon, { city: areaCityLabel });

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 space-y-0.5">
        <h1 className="page-screen-title">{ui.discover.screenTitle}</h1>
        <p className="page-screen-subtitle mt-0.5">{ui.discover.screenSubtitle}</p>
      </div>
      <details className="group/details relative shrink-0">
        <summary
          aria-label={areaFilterAria}
          className={cn(
            "inline-flex h-10 cursor-pointer list-none select-none items-center gap-1.5 rounded-full border border-[#E7E0D6] bg-white px-3 pr-2.5 text-[13px] font-medium text-foreground shadow-[0_2px_12px_-4px_rgba(15,23,42,0.06)] transition-colors",
            "hover:border-border hover:bg-muted/35 active:bg-muted/50",
            "[&::-webkit-details-marker]:hidden",
          )}
        >
          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2.25} aria-hidden />
          <span className="shrink-0">{areaCityLabel}</span>
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
            <span className="text-muted-foreground">{ui.discover.areaStatusPrefix} </span>
            {areaCityLabel}
          </div>
          <p className="border-t border-border px-3 py-2 text-[11px] leading-snug text-muted-foreground">
            {areaComingSoon}
          </p>
        </div>
      </details>
    </div>
  );
}
