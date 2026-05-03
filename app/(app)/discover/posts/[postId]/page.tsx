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

  if (!sessionUser) {
    return (
      <div className="space-y-4 px-1">
        <BackLink href="/discover" label="Back" />
        <GuestAppCta returnTo={`/discover/posts/${postId}`} />
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
  const backHref = safeReturnPath(query.returnTo, "/discover");
  const postPath = `/discover/posts/${postId}`;
  const profilePeerHref =
    !isAuthor
      ? (`/users/${author.id}?returnTo=${encodeURIComponent(postPath)}` as Route)
      : ("/profile" as Route);

  const live = post.status === "ACTIVE" && post.expiresAt > new Date();

  return (
    <div className="space-y-5 pb-6">
      <header className="flex items-center gap-2">
        <BackLink href={backHref} label="Back" />
      </header>

      <article className="overflow-hidden rounded-[1.25rem] border border-border/60 bg-card shadow-[0_2px_16px_-4px_rgba(15,23,42,0.06)]">
        <div className="border-b border-border/50 px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
              {labelCategory(post.category)}
            </span>
            {isAuthor ? (
              <span className="rounded-full bg-primary/12 px-2.5 py-1 text-[11px] font-semibold text-primary">
                Your post
              </span>
            ) : null}
            {live ? (
              <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                Active
              </span>
            ) : (
              <span className="rounded-full bg-foreground/5 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                {post.status === "CLOSED" ? "Closed" : "Expired"}
              </span>
            )}
          </div>
          <h1 className="mt-3 text-[1.35rem] font-semibold leading-tight tracking-tight text-foreground">
            {post.title}
          </h1>
          {post.body ? (
            <p className="mt-2 text-[15px] leading-relaxed text-foreground/85">{post.body}</p>
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
              className="mt-4 inline-flex text-[13px] font-semibold text-primary underline-offset-4 hover:underline"
            >
              Back to Classmates
            </Link>
          </div>
        ) : null}
      </article>
    </div>
  );
}

function labelCategory(c: ClassmatePostCategory) {
  switch (c) {
    case ClassmatePostCategory.MEALS:
      return "Meals";
    case ClassmatePostCategory.LANGUAGE:
      return "Language";
    case ClassmatePostCategory.SPORTS:
      return "Sports";
    default:
      return "Study";
  }
}
