import { redirect } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { format } from "date-fns";
import { ChevronRight, MapPin } from "lucide-react";
import { ClassmatePostCategory, ClassmatePostStatus } from "@prisma/client";

import { GuestAppCta } from "@/components/app/guest-app-cta";
import { BackLink } from "@/components/nav/back-link";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/link-button";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { cn } from "@/lib/utils";

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

  const posts = await prisma.classmatePost.findMany({
    where: { userId: user.id },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 80,
  });

  const active = posts.filter((p) => p.status === ClassmatePostStatus.ACTIVE && p.expiresAt > new Date());
  const archived = posts.filter((p) => !(p.status === ClassmatePostStatus.ACTIVE && p.expiresAt > new Date()));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 px-0.5">
        <BackLink href="/inbox" label="Back" />
        <div>
          <h1 className="page-screen-title">My posts</h1>
          <p className="text-[13px] leading-snug text-muted-foreground">
            Discover posts you published — classmates see them on the Discover tab
          </p>
        </div>
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
        <div className="space-y-5">
          {active.length > 0 ? (
            <section className="space-y-2">
              <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Live
              </h2>
              <ul className="overflow-hidden rounded-[1.125rem] border border-border/60 bg-card shadow-[0_2px_16px_-4px_rgba(15,23,42,0.06)]">
                {active.map((post, i) => (
                  <PostRow key={post.id} post={post} isLast={i === active.length - 1} />
                ))}
              </ul>
            </section>
          ) : null}

          {archived.length > 0 ? (
            <section className="space-y-2">
              <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Past
              </h2>
              <ul className="overflow-hidden rounded-[1.125rem] border border-border/60 bg-card shadow-[0_2px_16px_-4px_rgba(15,23,42,0.06)]">
                {archived.map((post, i) => (
                  <PostRow key={post.id} post={post} isLast={i === archived.length - 1} muted />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function PostRow({
  post,
  isLast,
  muted = false,
}: {
  post: {
    id: string;
    category: ClassmatePostCategory;
    city: string;
    title: string;
    body: string | null;
    status: ClassmatePostStatus;
    expiresAt: Date;
    updatedAt: Date;
  };
  isLast: boolean;
  muted?: boolean;
}) {
  const postHref =
    `/discover/posts/${post.id}?returnTo=${encodeURIComponent("/inbox/my-posts")}` as Route;
  const live = post.status === ClassmatePostStatus.ACTIVE && post.expiresAt > new Date();
  const statusLabel = !live
    ? post.status === ClassmatePostStatus.CLOSED
      ? "Closed"
      : post.expiresAt <= new Date()
        ? "Expired"
        : "Ended"
    : null;

  return (
    <li className={cn(!isLast && "border-b border-border/50")}>
      <Link
        href={postHref}
        className={cn(
          "flex min-h-[4.25rem] items-start gap-3.5 px-4 py-3.5 transition-colors active:bg-muted/50 [@media(hover:hover)]:hover:bg-muted/45",
          muted && "opacity-80",
        )}
      >
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MapPin className="h-4 w-4" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {labelCategory(post.category)}
            </span>
            {live ? (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                Active
              </span>
            ) : statusLabel ? (
              <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {statusLabel}
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-[15px] font-semibold leading-snug text-foreground">{post.title}</p>
          {post.body ? (
            <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted-foreground">{post.body}</p>
          ) : null}
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {post.city} ·{" "}
            {live
              ? `Until ${format(post.expiresAt, "MMM d, yyyy")}`
              : `Updated ${format(post.updatedAt, "MMM d, yyyy")}`}
          </p>
        </div>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/45" strokeWidth={2} />
      </Link>
    </li>
  );
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
