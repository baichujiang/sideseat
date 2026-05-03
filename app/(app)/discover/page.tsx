import type { Route } from "next";
import { ClassmatePostCategory, ClassmatePostStatus, ConnectionStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { MapPin } from "lucide-react";

import { GuestAppCta } from "@/components/app/guest-app-cta";
import {
  DiscoverList,
  type DiscoverPostRow,
  type DiscoverRow,
} from "@/components/discover/discover-list";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/link-button";
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
      <div className="space-y-5">
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
  if (!sessionUser.onboardingComplete) {
    redirect("/onboarding");
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

  const activePosts = await prisma.classmatePost.findMany({
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
      user: true,
    },
    orderBy: { createdAt: "desc" },
    take: 120,
  });

  const freshHits = freshHitsBase.filter((h) => !connectedUserIds.has(h.userId));
  const freshPosts = activePosts.filter(
    (post) => post.userId === user.id || !connectedUserIds.has(post.userId),
  );

  if (freshHits.length === 0 && freshPosts.length === 0) {
    return (
      <div className="space-y-5">
        <PageHeader />
        <EmptyState
          title="No new classmates to show"
          description={
            savedCount === 0
              ? "You're already connected with everyone we'd suggest. Add another course to widen your matches."
              : "You're already connected with everyone we'd suggest. Check back as more classmates join."
          }
          action={
            savedCount === 0 ? (
              <LinkButton href={"/courses/add" as Route} size="sm">
                Add a course
              </LinkButton>
            ) : (
              <LinkButton href={"/inbox" as Route} size="sm" variant="outline">
                Open inbox
              </LinkButton>
            )
          }
        />
      </div>
    );
  }

  const rows: DiscoverRow[] = freshHits.map((h) => ({
    userId: h.userId,
    nickname: h.nickname,
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
    avatarUrl: post.user.avatarUrl,
    major: post.user.major,
    semester: post.user.semester,
    school: post.user.school,
    languages: post.user.languages,
    verifiedStudent: post.user.verifiedStudent,
    studentVerificationStatus: post.user.studentVerificationStatus,
  }));

  return (
    <div className="space-y-4">
      <PageHeader />
      <DiscoverList rows={rows} posts={posts} />
    </div>
  );
}

function PageHeader() {
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold leading-tight tracking-tight">Classmates</h2>
          <p className="text-[13px] leading-snug text-muted-foreground">
            Meet students through classes, study plans, meals, languages, and sports.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-card px-3.5 text-[13px] font-medium text-foreground shadow-[0_2px_12px_-4px_rgba(15,23,42,0.06)]"
        >
          <MapPin className="h-4 w-4 text-muted-foreground" strokeWidth={2.25} />
          Munich
        </button>
      </div>
    </div>
  );
}
