import Link from "next/link";
import type { Route } from "next";
import { redirect, notFound } from "next/navigation";
import { format } from "date-fns";
import { ClassmatePostCategory } from "@prisma/client";

import { GuestAppCta } from "@/components/app/guest-app-cta";
import { DiscoverMessageButton } from "@/components/discover/discover-message-button";
import { BackLink } from "@/components/nav/back-link";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { safeReturnPath } from "@/lib/nav/back";
import { getClassmatePostDetailForViewer } from "@/lib/queries/classmate-post-detail";

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
    return (
      <div className="space-y-5 pb-6">
        <header className="flex items-center gap-2">
          <BackLink href={backHref} label="Back" />
        </header>

        <article className="overflow-hidden rounded-[1.25rem] border border-[#E7E0D6] bg-white shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
          <div className="border-b border-[#E7E0D6]/80 px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-classmates-teal-border/60 bg-classmates-teal-soft px-2.5 py-1 text-[11px] font-semibold text-classmates-teal">
                {labelCategory(post.category)}
              </span>
              {live ? (
                <span className="rounded-full border border-classmates-teal-border/70 bg-classmates-teal-soft px-2.5 py-1 text-[11px] font-semibold text-classmates-teal dark:text-teal-200">
                  Active
                </span>
              ) : (
                <span className="rounded-full bg-foreground/5 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  {post.status === "CLOSED" ? "Closed" : "Expired"}
                </span>
              )}
            </div>
            <h1 className="page-screen-title mt-3">{post.title}</h1>
            {post.body ? (
              <p className="mt-2 text-[15px] leading-relaxed text-foreground/85">{post.body}</p>
            ) : null}
            {post.courses.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {post.courses.map((pc) => (
                  <span
                    key={pc.course.id}
                    className="inline-flex rounded-full border border-classmates-blue-border/60 bg-classmates-blue-soft/50 px-2.5 py-1 text-[11px] font-medium text-classmates-blue"
                  >
                    {pc.course.code ?? pc.course.name}
                  </span>
                ))}
              </div>
            ) : null}
            <p className="mt-3 text-[13px] text-muted-foreground">
              {post.city} · {live ? `Until ${format(post.expiresAt, "MMM d, yyyy")}` : `Updated ${format(post.updatedAt, "MMM d, yyyy")}`}
            </p>
          </div>

          <div className="flex items-start gap-3 px-4 py-4">
            <Link href={profilePeerHref} className="shrink-0">
              <PresetAvatar id={post.user.avatarUrl} size={56} className="ring-2 ring-background" />
            </Link>
            <div className="min-w-0 flex-1">
              <Link
                href={profilePeerHref}
                className="inline-flex flex-wrap items-center gap-2 text-[15px] font-semibold text-foreground"
              >
                {post.user.nickname ?? post.user.username}
                <VerifiedBadge
                  size="xs"
                  school={post.user.school}
                  verifiedStudent={post.user.verifiedStudent}
                  status={post.user.studentVerificationStatus}
                />
              </Link>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {[post.user.major, post.user.semester != null ? `Sem ${post.user.semester}` : null]
                  .filter(Boolean)
                  .join(" · ") || "Student"}
              </p>
            </div>
          </div>

          <div className="border-t border-border/50 px-4 py-4">
            <p className="mb-3 text-[12px] text-muted-foreground">
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

  return (
    <div className="space-y-5 pb-6">
      <header className="flex items-center gap-2">
        <BackLink href={backHref} label="Back" />
      </header>

      <article className="overflow-hidden rounded-[1.25rem] border border-[#E7E0D6] bg-white shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
        <div className="border-b border-[#E7E0D6]/80 px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-classmates-teal-border/60 bg-classmates-teal-soft px-2.5 py-1 text-[11px] font-semibold text-classmates-teal">
              {labelCategory(post.category)}
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
              <span className="rounded-full bg-foreground/5 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                {post.status === "CLOSED" ? "Closed" : "Expired"}
              </span>
            )}
          </div>
          <h1 className="page-screen-title mt-3">
            {post.title}
          </h1>
          {post.body ? (
            <p className="mt-2 text-[15px] leading-relaxed text-foreground/85">{post.body}</p>
          ) : null}
          {post.linkedCourses.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {post.linkedCourses.map((c) => (
                <span
                  key={c.id}
                  className="inline-flex rounded-full border border-classmates-blue-border/60 bg-classmates-blue-soft/50 px-2.5 py-1 text-[11px] font-medium text-classmates-blue"
                >
                  {c.code ?? c.name}
                </span>
              ))}
            </div>
          ) : null}
          <p className="mt-3 text-[13px] text-muted-foreground">
            {post.city} ·{" "}
            {live
              ? `Until ${format(post.expiresAt, "MMM d, yyyy")}`
              : `Updated ${format(post.updatedAt, "MMM d, yyyy")}`}
          </p>
        </div>

        <div className="flex items-start gap-3 px-4 py-4">
          <Link href={profilePeerHref} className="shrink-0">
            <PresetAvatar id={author.avatarUrl} size={56} className="ring-2 ring-background" />
          </Link>
          <div className="min-w-0 flex-1">
            <Link
              href={profilePeerHref}
              className="inline-flex flex-wrap items-center gap-2 text-[15px] font-semibold text-foreground"
            >
              {author.nickname ?? author.username}
              <VerifiedBadge
                size="xs"
                school={author.school}
                verifiedStudent={author.verifiedStudent}
                status={author.studentVerificationStatus}
              />
            </Link>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {[author.major, author.semester != null ? `Sem ${author.semester}` : null]
                .filter(Boolean)
                .join(" · ") || "Student"}
            </p>
          </div>
        </div>

        {viewerCanMessage ? (
          <div className="border-t border-border/50 px-4 py-4">
            <p className="mb-3 text-[12px] text-muted-foreground">
              Send a direct message to connect about this post.
            </p>
            <DiscoverMessageButton
              peerId={author.id}
              returnTo={postPath}
              tone="solid"
            />
          </div>
        ) : isAuthor ? (
          <div className="border-t border-border/50 px-4 py-4">
            <DiscoverMessageButton
              peerId={sessionUser.id}
              returnTo={postPath}
              tone="solid"
            />
            <Link
              href="/discover"
              className="mt-4 inline-flex text-[13px] font-semibold text-classmates-blue underline-offset-4 hover:underline"
            >
              Back to Classmates
            </Link>
          </div>
        ) : null}
      </article>
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
