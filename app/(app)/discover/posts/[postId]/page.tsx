import Link from "next/link";
import type { Route } from "next";
import { redirect, notFound } from "next/navigation";
import { format } from "date-fns";
import { ClassmatePostCategory, ClassmatePostStatus } from "@prisma/client";
import { Calendar, ChevronRight, Link2, MapPin } from "lucide-react";

import { GuestAppCta } from "@/components/app/guest-app-cta";
import { DiscoverMessageButton } from "@/components/discover/discover-message-button";
import { BackLink } from "@/components/nav/back-link";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { safeReturnPath } from "@/lib/nav/back";
import {
  buildViewerCourseMatchIndex,
  courseMatchesViewer,
  type ViewerCourseMatchIndex,
} from "@/lib/discover/viewer-course-match";
import { getClassmatePostDetailForViewer } from "@/lib/queries/classmate-post-detail";
import { cn } from "@/lib/utils";

type CourseChip = { id: string; code: string | null; name: string };

type AuthorDisplay = {
  id: string;
  username: string;
  nickname: string | null;
  avatarUrl: string | null;
  major: string | null;
  semester: number | null;
  school: string | null;
  verifiedStudent: boolean;
  studentVerificationStatus: React.ComponentProps<typeof VerifiedBadge>["status"];
};

/** Shared shell for post detail CTAs (peer message + author notes). */
const POST_DETAIL_ACTION_FOOTER =
  "border-t border-border/60 bg-gradient-to-b from-muted/20 via-muted/35 to-muted/45 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:px-6";

const POST_DETAIL_PRIMARY_CTA =
  "h-12 w-full min-w-0 flex-1 justify-center gap-2 rounded-2xl px-6 text-[14px] font-semibold shadow-[0_4px_14px_rgba(37,99,235,0.22)] sm:min-h-[3rem] dark:shadow-[0_4px_18px_rgba(37,99,235,0.18)]";

const POST_DETAIL_SECONDARY_CTA =
  "inline-flex h-12 w-full shrink-0 items-center justify-center rounded-2xl border-2 border-border bg-card px-5 text-[14px] font-semibold text-foreground transition-colors hover:bg-muted/70 active:bg-muted sm:w-auto sm:min-w-[10.5rem]";

export default async function DiscoverPostDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ postId: string }>;
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const { postId } = await params;
  const query = (await searchParams) ?? {};
  const sessionUser = await getSessionUser();
  const backHref = safeReturnPath(query.returnTo, "/discover");
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
    const live = post.status === "ACTIVE" && post.expiresAt > now;
    const author: AuthorDisplay = post.user;
    const courses: CourseChip[] = post.courses.map((pc) => ({
      id: pc.course.id,
      code: pc.course.code,
      name: pc.course.name,
    }));

    return (
      <div className="space-y-5 pb-6">
        <header className="flex items-center gap-2">
          <BackLink href={backHref} label="Back" />
        </header>

        <article
          className={cn(
            "overflow-hidden rounded-[1.25rem] border border-border/80 bg-card",
            "shadow-[0_4px_24px_rgba(15,23,42,0.06)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.25)]",
          )}
        >
          <PostAuthorSection
            author={author}
            profileHref={profilePeerHref}
            showProfileCue
          />

          <PostContentSection
            category={post.category}
            status={post.status}
            title={post.title}
            body={post.body}
            city={post.city}
            live={live}
            expiresAt={post.expiresAt}
            updatedAt={post.updatedAt}
            courses={courses}
            courseLinkBase={null}
            isAuthor={false}
            highlightViewerCourses={false}
            viewerCourseMatchIndex={null}
          />

          <div className="border-t border-border/50 bg-muted/30 px-4 py-4 sm:px-5">
            <p className="mb-3 text-[13px] leading-snug text-muted-foreground">
              Log in to message this classmate or post your own.
            </p>
            <GuestAppCta returnTo={postPath} />
          </div>
        </article>
      </div>
    );
  }

  if (!sessionUser.onboardingComplete) {
    redirect("/onboarding");
  }

  const data = await getClassmatePostDetailForViewer(postId, sessionUser.id);
  if (!data.ok) {
    notFound();
  }

  const { post, author, isAuthor, viewerCanMessage } = data;
  const profilePeerHref =
    !isAuthor
      ? (`/users/${author.id}?returnTo=${encodeURIComponent(postPath)}` as Route)
      : ("/profile" as Route);

  const live = post.status === "ACTIVE" && post.expiresAt > now;

  const myEnrolled = await prisma.userCourse.findMany({
    where: { userId: sessionUser.id },
    select: { course: { select: { id: true, code: true } } },
  });
  const viewerCourseMatchIndex = buildViewerCourseMatchIndex(
    myEnrolled.map((uc) => ({ id: uc.course.id, code: uc.course.code })),
  );

  return (
    <div className="space-y-5 pb-6">
      <header className="flex items-center gap-2">
        <BackLink href={backHref} label="Back" />
      </header>

      <article
        className={cn(
          "overflow-hidden rounded-[1.25rem] border border-border/80 bg-card",
          "shadow-[0_4px_24px_rgba(15,23,42,0.06)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.25)]",
        )}
      >
        <PostAuthorSection
          author={author}
          profileHref={profilePeerHref}
          showProfileCue={!isAuthor}
        />

        <PostContentSection
          category={post.category}
          status={post.status}
          title={post.title}
          body={post.body}
          city={post.city}
          live={live}
          expiresAt={post.expiresAt}
          updatedAt={post.updatedAt}
          courses={post.linkedCourses}
          courseLinkBase="/courses"
          isAuthor={isAuthor}
          highlightViewerCourses
          viewerCourseMatchIndex={viewerCourseMatchIndex}
        />

        {viewerCanMessage ? (
          <div className={POST_DETAIL_ACTION_FOOTER}>
            <p className="mb-4 max-w-prose text-[13px] leading-relaxed text-muted-foreground">
              Send a direct message to connect about this post.
            </p>
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-stretch sm:gap-3">
              <DiscoverMessageButton
                peerId={author.id}
                returnTo={postPath}
                tone="solid"
                className={POST_DETAIL_PRIMARY_CTA}
              />
            </div>
          </div>
        ) : isAuthor ? (
          <div className={POST_DETAIL_ACTION_FOOTER}>
            <p className="mb-4 max-w-prose text-[13px] leading-relaxed text-muted-foreground">
              Open your private notes thread to jot things down — separate from classmate chats. Use{" "}
              <span className="font-medium text-foreground/80">My posts</span> to edit this listing.
            </p>
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-stretch sm:gap-3">
              <DiscoverMessageButton
                peerId={sessionUser.id}
                returnTo={postPath}
                tone="solid"
                label="Notes"
                icon="notes"
                className={POST_DETAIL_PRIMARY_CTA}
              />
              <Link
                href={
                  `/inbox/my-posts?returnTo=${encodeURIComponent(postPath)}` as Route
                }
                className={POST_DETAIL_SECONDARY_CTA}
              >
                My posts
              </Link>
            </div>
          </div>
        ) : null}
      </article>
    </div>
  );
}

function PostAuthorSection({
  author,
  profileHref,
  showProfileCue,
}: {
  author: AuthorDisplay;
  profileHref: Route;
  showProfileCue: boolean;
}) {
  const displayName = author.nickname ?? author.username;
  const subtitle =
    [author.major, author.semester != null ? `Sem ${author.semester}` : null]
      .filter(Boolean)
      .join(" · ") || "Student";

  return (
    <div className="border-b border-border/60 px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex items-start gap-3.5">
        <Link href={profileHref} className="shrink-0 rounded-full ring-2 ring-background">
          <PresetAvatar id={author.avatarUrl} size={56} />
        </Link>
        <div className="min-w-0 flex-1 pt-0.5">
          <Link
            href={profileHref}
            className="group inline-flex max-w-full items-center gap-2 text-[15px] font-semibold text-foreground"
          >
            <span className="truncate">{displayName}</span>
            <VerifiedBadge
              size="xs"
              school={author.school}
              verifiedStudent={author.verifiedStudent}
              status={author.studentVerificationStatus}
            />
            {showProfileCue ? (
              <ChevronRight
                className="h-4 w-4 shrink-0 text-muted-foreground opacity-60 transition group-hover:opacity-100"
                aria-hidden
              />
            ) : null}
          </Link>
          <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

function PostContentSection({
  category,
  status,
  title,
  body,
  city,
  live,
  expiresAt,
  updatedAt,
  courses,
  courseLinkBase,
  isAuthor,
  highlightViewerCourses,
  viewerCourseMatchIndex,
}: {
  category: ClassmatePostCategory;
  status: ClassmatePostStatus;
  title: string;
  body: string | null;
  city: string;
  live: boolean;
  expiresAt: Date;
  updatedAt: Date;
  courses: CourseChip[];
  courseLinkBase: "/courses" | null;
  isAuthor: boolean;
  /** When false (e.g. guest), chips stay neutral. */
  highlightViewerCourses: boolean;
  viewerCourseMatchIndex: ViewerCourseMatchIndex | null;
}) {
  const dateLabel = live
    ? `Active until ${format(expiresAt, "MMM d, yyyy")}`
    : status === ClassmatePostStatus.CLOSED
      ? `Closed · updated ${format(updatedAt, "MMM d, yyyy")}`
      : `Expired · updated ${format(updatedAt, "MMM d, yyyy")}`;
  const dateValue = live ? expiresAt.toISOString() : updatedAt.toISOString();

  return (
    <div className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-classmates-teal-border/60 bg-classmates-teal-soft px-2.5 py-1 text-[11px] font-semibold text-classmates-teal">
          {labelCategory(category)}
        </span>
        {isAuthor ? (
          <span className="rounded-full border border-classmates-blue-border/80 bg-classmates-blue-soft px-2.5 py-1 text-[11px] font-semibold text-classmates-blue">
            Your post
          </span>
        ) : null}
        {live ? (
          <span className="rounded-full border border-classmates-teal-border/70 bg-classmates-teal-soft px-2.5 py-1 text-[11px] font-semibold text-classmates-teal dark:text-teal-200">
            Active
          </span>
        ) : (
          <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            {status === ClassmatePostStatus.CLOSED ? "Closed" : "Expired"}
          </span>
        )}
      </div>

      <div>
        <h1 className="text-xl font-semibold leading-snug tracking-tight text-foreground">
          {title}
        </h1>
        {body ? (
          <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground/90">
            {body}
          </p>
        ) : null}
      </div>

      {courses.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {courses.map((c) => {
            const label = c.code ?? c.name;
            const matchesViewer =
              highlightViewerCourses &&
              viewerCourseMatchIndex != null &&
              courseMatchesViewer(c, viewerCourseMatchIndex);
            const titleAttr = matchesViewer
              ? `${c.name} — same course as yours (code or enrollment)`
              : c.name;
            const chipClass = cn(
              "inline-flex max-w-[min(100%,14rem)] items-center gap-1 truncate rounded-full px-2 py-0.5 text-[10px] tabular-nums transition-colors",
              matchesViewer
                ? "border-2 border-dashed border-classmates-teal-border bg-classmates-teal-soft/70 font-semibold text-classmates-teal dark:border-teal-500/55 dark:bg-teal-950/35 dark:text-teal-200"
                : "border border-classmates-blue-border/60 bg-classmates-blue-soft/50 font-medium text-classmates-blue hover:bg-classmates-blue-soft dark:border-blue-500/35 dark:bg-blue-950/35 dark:text-blue-200",
            );
            const chipBody = (
              <>
                {matchesViewer ? (
                  <Link2 className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
                ) : null}
                <span className="truncate">{label}</span>
              </>
            );
            if (courseLinkBase) {
              return (
                <Link
                  key={c.id}
                  href={`${courseLinkBase}/${c.id}` as Route}
                  className={chipClass}
                  title={titleAttr}
                >
                  {chipBody}
                </Link>
              );
            }
            return (
              <span
                key={c.id}
                className={cn(chipClass, "cursor-default")}
                title={titleAttr}
              >
                {chipBody}
              </span>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-border/50 pt-4 text-[13px] text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          {city}
        </span>
        <time
          dateTime={dateValue}
          className="inline-flex items-center gap-1.5"
        >
          <Calendar className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          {dateLabel}
        </time>
      </div>
    </div>
  );
}

async function getClassmatePostDetailForGuest(postId: string, now: Date) {
  return prisma.classmatePost.findFirst({
    where: {
      id: postId,
      city: "Munich",
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
    },
  });
}

function labelCategory(c: ClassmatePostCategory) {
  switch (c) {
    case ClassmatePostCategory.SHARED_COURSES:
      return "Shared courses";
    case ClassmatePostCategory.MEALS:
      return "Meals";
    case ClassmatePostCategory.LANGUAGE:
      return "Language";
    case ClassmatePostCategory.SPORTS:
      return "Sports";
    case ClassmatePostCategory.STUDY:
      return "Study";
  }
}
