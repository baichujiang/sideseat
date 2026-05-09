import { redirect } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { format } from "date-fns";
import {
  BookUser,
  Calendar,
  ChevronRight,
  Clock,
  Dumbbell,
  Languages,
  MapPin,
  NotebookPen,
  UtensilsCrossed,
} from "lucide-react";
import { ClassmatePostCategory, ClassmatePostStatus } from "@prisma/client";

import { GuestAppCta } from "@/components/app/guest-app-cta";
import { BackLink } from "@/components/nav/back-link";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/link-button";
import { getSessionUser } from "@/lib/auth/session";
import {
  classmatePostCategoryToPalette,
  SCENE_LIST_ROW,
} from "@/lib/discover/scene-palette";
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
        <div className="space-y-6">
          {active.length > 0 ? (
            <section className="space-y-3">
              <h2 className="px-0.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-classmates-teal dark:text-teal-300">
                Live on Discover
              </h2>
              <ul className="space-y-2.5">
                {active.map((post) => (
                  <PostRow key={post.id} post={post} />
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
                  <PostRow key={post.id} post={post} muted />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function categoryIcon(c: ClassmatePostCategory) {
  const cls = "h-[18px] w-[18px] shrink-0";
  switch (c) {
    case ClassmatePostCategory.SHARED_COURSES:
      return <BookUser className={cls} strokeWidth={1.85} aria-hidden />;
    case ClassmatePostCategory.MEALS:
      return <UtensilsCrossed className={cls} strokeWidth={1.85} aria-hidden />;
    case ClassmatePostCategory.LANGUAGE:
      return <Languages className={cls} strokeWidth={1.85} aria-hidden />;
    case ClassmatePostCategory.SPORTS:
      return <Dumbbell className={cls} strokeWidth={1.85} aria-hidden />;
    case ClassmatePostCategory.STUDY:
      return <NotebookPen className={cls} strokeWidth={1.85} aria-hidden />;
  }
}

function PostRow({
  post,
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
    createdAt: Date;
    updatedAt: Date;
  };
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
  const wasEdited = post.updatedAt.getTime() - post.createdAt.getTime() > 60_000;

  const palette = classmatePostCategoryToPalette(post.category);
  const row = SCENE_LIST_ROW[palette];

  return (
    <li>
      <Link
        href={postHref}
        className={cn(
          "flex items-start gap-3.5 rounded-[1.25rem] border p-4 transition-all duration-200 ease-out active:bg-black/[0.03] dark:active:bg-white/[0.04]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-classmates-azure/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          row.card,
          row.cardHover,
          muted && "opacity-[0.88] saturate-[0.9]",
        )}
      >
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border",
            row.iconWrap,
            muted && "opacity-90",
          )}
        >
          {muted ? (
            <Calendar className="h-[18px] w-[18px] shrink-0 opacity-85" strokeWidth={1.85} aria-hidden />
          ) : (
            categoryIcon(post.category)
          )}
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn("rounded-full border px-2 py-0.5 text-[10px]", row.categoryChip)}
            >
              {labelCategory(post.category)}
            </span>
            {live ? (
              <span className="rounded-full border border-emerald-500/35 bg-emerald-500/12 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300">
                Active
              </span>
            ) : statusLabel ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {statusLabel}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-[15px] font-semibold leading-snug tracking-tight text-foreground">
            {post.title}
          </p>
          {post.body ? (
            <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
              {post.body}
            </p>
          ) : null}
          <div className="mt-2 flex flex-col gap-1.5 text-[11px] leading-snug text-muted-foreground">
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <Clock className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
              <span className="font-medium text-foreground/75">Posted</span>
              <time dateTime={post.createdAt.toISOString()}>
                {format(post.createdAt, "MMM d, yyyy · h:mm a")}
              </time>
            </span>
            {wasEdited ? (
              <span className="inline-flex flex-wrap items-center gap-1.5 pl-[1.125rem] sm:pl-0">
                <span className="font-medium text-foreground/75">Last edited</span>
                <time dateTime={post.updatedAt.toISOString()}>
                  {format(post.updatedAt, "MMM d, yyyy · h:mm a")}
                </time>
              </span>
            ) : null}
            <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5">
              <MapPin className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
              {post.city}
              <span aria-hidden>·</span>
              {live ? (
                <>
                  <span className="sr-only">Listing expires</span>
                  Until {format(post.expiresAt, "MMM d, yyyy")}
                </>
              ) : (
                <>
                  {statusLabel ? `${statusLabel} · ` : null}
                  <span className="sr-only">Last update</span>
                  {format(post.updatedAt, "MMM d, yyyy")}
                </>
              )}
            </span>
          </div>
        </div>
        <ChevronRight
          className="mt-2 h-4 w-4 shrink-0 text-muted-foreground/40"
          strokeWidth={2}
          aria-hidden
        />
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
