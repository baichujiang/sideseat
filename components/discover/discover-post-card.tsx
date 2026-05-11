"use client";

import Link from "next/link";
import type { Route } from "next";
import {
  BookUser,
  Calendar,
  Dumbbell,
  Languages,
  Link2,
  NotebookPen,
  UtensilsCrossed,
} from "lucide-react";
import { ClassmatePostCategory } from "@prisma/client";
import type { ReactNode } from "react";

import { ClassmatesPersonRow } from "@/components/classmates/classmates-person-row";
import { DiscoverMessageButton } from "@/components/discover/discover-message-button";
import { useLocaleContext } from "@/components/i18n/locale-provider";
import { UserGenderCardIcon } from "@/components/ui/user-gender-icon";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import {
  LANGUAGE_PROFICIENCY_LABEL,
  LANGUAGE_TAG_LABEL,
} from "@/lib/constants/languages";
import {
  classmatePostCategoryToPalette,
  SCENE_LIST_ROW,
} from "@/lib/discover/scene-palette";
import type { DiscoverPostCardScene, DiscoverPostRow } from "@/lib/discover/discover-post-row";
import {
  courseMatchesViewer,
  type ViewerCourseMatchIndex,
} from "@/lib/discover/viewer-course-match";
import { formatClassmatePostExpiryMonthDay } from "@/lib/i18n/format-classmate-post-expiry";
import { formatMessage, type AppMessages } from "@/lib/i18n/messages";
import { useAppMessages } from "@/hooks/use-app-locale";
import { cn } from "@/lib/utils";

export const DISCOVER_POST_CARD_SHELL_CLASS = cn(
  "rounded-[26px] border-classmates-edge px-5 py-4 shadow-[0_6px_26px_-12px_rgba(15,23,42,0.11)] sm:rounded-[28px] sm:px-6 sm:py-5",
  "dark:border-border dark:bg-card dark:shadow-[0_14px_44px_-18px_rgba(0,0,0,0.52)]",
  "[@media(hover:hover)]:hover:shadow-[0_8px_32px_-14px_rgba(15,23,42,0.14)]",
  "dark:[@media(hover:hover)]:hover:shadow-[0_16px_48px_-14px_rgba(0,0,0,0.58)]",
);

const DISCOVER_POST_MY_POSTS_PILL_CLASS = cn(
  "inline-flex shrink-0 items-center rounded-full border border-classmates-blue-border/85 bg-classmates-blue-soft px-3 py-1.5 text-[12px] font-medium text-classmates-blue no-underline transition-colors",
  "hover:bg-classmates-blue-border/40 active:bg-classmates-blue-border/60",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  "dark:border-blue-500/35 dark:bg-blue-950/50 dark:text-blue-200 dark:hover:bg-blue-950/65 dark:active:bg-blue-950/75",
);

function DiscoverPostLinkedCourseChip({
  code,
  name,
  matchesViewer,
}: {
  code: string | null;
  name: string;
  matchesViewer: boolean;
}) {
  const label = code?.trim() || name.trim();
  return (
    <span
      title={
        matchesViewer
          ? `${name} — same course as yours (code or enrollment)`
          : name
      }
      className={cn(
        "inline-flex max-w-[11rem] items-center gap-1 truncate rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold tabular-nums ring-1 ring-inset",
        "bg-classmates-success-soft text-classmates-success ring-emerald-200/85",
        "dark:bg-emerald-950/45 dark:text-emerald-200 dark:ring-emerald-500/35",
        matchesViewer &&
          "ring-2 ring-classmates-teal-border dark:ring-teal-400/45",
      )}
    >
      <Link2 className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  );
}

function categoryIconNode(c: ClassmatePostCategory) {
  const cls = "h-3 w-3 shrink-0";
  switch (c) {
    case ClassmatePostCategory.SHARED_COURSES:
      return <BookUser className={cls} strokeWidth={2} aria-hidden />;
    case ClassmatePostCategory.MEALS:
      return <UtensilsCrossed className={cls} strokeWidth={2} aria-hidden />;
    case ClassmatePostCategory.LANGUAGE:
      return <Languages className={cls} strokeWidth={2} aria-hidden />;
    case ClassmatePostCategory.SPORTS:
      return <Dumbbell className={cls} strokeWidth={2} aria-hidden />;
    case ClassmatePostCategory.STUDY:
      return <NotebookPen className={cls} strokeWidth={2} aria-hidden />;
  }
}

function categoryTabLabel(c: ClassmatePostCategory, dl: AppMessages["discoverList"]) {
  switch (c) {
    case ClassmatePostCategory.SHARED_COURSES:
      return dl.sceneTabShared;
    case ClassmatePostCategory.STUDY:
      return dl.sceneTabStudy;
    case ClassmatePostCategory.MEALS:
      return dl.sceneTabMeals;
    case ClassmatePostCategory.LANGUAGE:
      return dl.sceneTabLanguage;
    case ClassmatePostCategory.SPORTS:
      return dl.sceneTabSports;
  }
}

function DiscoverPostCategoryBadge({ category }: { category: ClassmatePostCategory }) {
  const m = useAppMessages();
  const dl = m.discoverList;
  const palette = classmatePostCategoryToPalette(category);
  const row = SCENE_LIST_ROW[palette];
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-tight",
        row.categoryChip,
      )}
    >
      {categoryIconNode(category)}
      <span className="truncate">{categoryTabLabel(category, dl)}</span>
    </span>
  );
}

function isNeverExpiry(value: Date) {
  return new Date(value).getUTCFullYear() >= 2099;
}

export type DiscoverPostCardProps = {
  post: DiscoverPostRow;
  scene: DiscoverPostCardScene;
  viewerCourseMatchIndex: ViewerCourseMatchIndex;
  /** When set, used for post detail `returnTo` instead of the default Discover path from `scene`. */
  listReturnTo?: string;
  /** Replaces the default expiry / “My posts” strip (e.g. inbox analytics footer). */
  cardFooter?: ReactNode;
  /** Extra pills after gender (e.g. Active / archived on My posts). */
  titleTrailing?: ReactNode;
  /** When false, hides the “Your post” pill even if `post.isOwn` (e.g. My posts list). */
  yourPostBadge?: boolean;
  className?: string;
};

export function DiscoverPostCard({
  post,
  scene,
  viewerCourseMatchIndex,
  listReturnTo,
  cardFooter,
  titleTrailing,
  yourPostBadge,
  className,
}: DiscoverPostCardProps) {
  const { locale, messages } = useLocaleContext();
  const dl = messages.discoverList;
  const meta = [post.major, post.semester ? `sem ${post.semester}` : null]
    .filter(Boolean)
    .join(" · ");
  const postPath = `/discover/posts/${post.id}`;
  const returnTo =
    listReturnTo ?? (scene === "shared" ? "/discover" : `/discover?tab=${scene}`);
  const postDetailHref =
    `${postPath}?returnTo=${encodeURIComponent(returnTo)}` as Route;
  const myPostsHref =
    `/inbox/my-posts?returnTo=${encodeURIComponent(postPath)}` as Route;

  const showYourPostTitlePill = post.isOwn && yourPostBadge !== false;

  const expiryLabel = isNeverExpiry(post.expiresAt)
    ? dl.postNoExpiry
    : formatMessage(dl.postActiveUntil, {
        date: formatClassmatePostExpiryMonthDay(new Date(post.expiresAt), locale),
      });

  const showSharedCourseChips =
    post.category === ClassmatePostCategory.SHARED_COURSES &&
    post.linkedCourses &&
    post.linkedCourses.length > 0;

  const showLanguageMeta =
    post.category === ClassmatePostCategory.LANGUAGE && post.languages.length > 0;

  const showSportsMeta = post.category === ClassmatePostCategory.SPORTS;

  const defaultFooter = (
    <div
      className={cn(
        "mt-3 flex w-full min-w-0 items-center gap-2 border-t border-border/45 pt-3 dark:border-border/50",
        post.isOwn ? "justify-between" : "justify-start",
      )}
    >
      <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-[11px] leading-snug text-muted-foreground">
        <Calendar className="h-3.5 w-3.5 shrink-0 opacity-80" strokeWidth={2} aria-hidden />
        <span className="min-w-0 truncate">{expiryLabel}</span>
      </span>
      {post.isOwn ? (
        <Link
          href={myPostsHref}
          aria-label={dl.myPostsListCtaAria}
          className={DISCOVER_POST_MY_POSTS_PILL_CLASS}
        >
          {dl.myPostsListCta}
        </Link>
      ) : null}
    </div>
  );

  return (
    <ClassmatesPersonRow
      className={cn(DISCOVER_POST_CARD_SHELL_CLASS, className)}
      avatarHref={postDetailHref}
      contentHref={postDetailHref}
      avatarUrl={post.avatarUrl}
      profileAriaLabel={
        post.isOwn ? "View your post" : `View ${post.nickname}'s post`
      }
      name={post.nickname}
      nameClassName="font-bold"
      titleAdornment={
        <>
          <VerifiedBadge
            size="xs"
            tone="brandBlue"
            school={post.school}
            verifiedStudent={post.verifiedStudent}
            status={post.studentVerificationStatus}
          />
          <UserGenderCardIcon gender={post.gender} className="shrink-0" />
          {titleTrailing}
          {showYourPostTitlePill ? (
            <span
              className={cn(
                "shrink-0 rounded-full border border-classmates-blue-border/85 bg-classmates-blue-soft px-2 py-0.5 text-[10px] font-semibold text-classmates-blue",
                "dark:border-blue-500/35 dark:bg-blue-950/50 dark:text-blue-200",
              )}
            >
              {dl.postCardYourPostBadge}
            </span>
          ) : null}
        </>
      }
      body={
        <>
          {meta ? (
            <p className="mt-0.5 truncate text-[12px] leading-snug text-muted-foreground">
              {meta}
            </p>
          ) : null}
          <div className="mt-2 rounded-2xl border border-border/55 bg-muted/50 px-3.5 py-3 dark:border-border/55 dark:bg-muted/20">
            <div className="mb-2 flex flex-wrap gap-1.5">
              <DiscoverPostCategoryBadge category={post.category} />
            </div>
            <p className="text-[13px] font-bold leading-snug tracking-tight text-foreground">
              {post.title}
            </p>
            {post.body ? (
              <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-muted-foreground">
                {post.body}
              </p>
            ) : null}
            {showSportsMeta ? (
              <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                {dl.postCardSportsBlurb}
              </p>
            ) : null}
            {showLanguageMeta ? (
              <div className="mt-2.5" aria-label={dl.postCardSpeaksLabel}>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  {dl.postCardSpeaksLabel}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {post.languages.map((row) => (
                    <span
                      key={row.tag}
                      title={LANGUAGE_PROFICIENCY_LABEL[row.proficiency]}
                      className="inline-flex max-w-full truncate rounded-full border border-violet-200/80 bg-violet-50/90 px-2 py-0.5 text-[10px] font-medium text-violet-950 dark:border-violet-500/35 dark:bg-violet-950/40 dark:text-violet-100"
                    >
                      {LANGUAGE_TAG_LABEL[row.tag]} · {LANGUAGE_PROFICIENCY_LABEL[row.proficiency]}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {showSharedCourseChips ? (
              <div className="mt-2.5 flex flex-wrap gap-1.5" aria-label={dl.postCardLinkedCoursesAria}>
                {post.linkedCourses!.map((c) => (
                  <DiscoverPostLinkedCourseChip
                    key={c.id}
                    code={c.code}
                    name={c.name}
                    matchesViewer={courseMatchesViewer(c, viewerCourseMatchIndex)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </>
      }
      cardFooter={cardFooter ?? defaultFooter}
      action={
        post.isOwn ? undefined : (
          <DiscoverMessageButton
            peerId={post.userId}
            returnTo={postPath}
            tone="subtle"
            hasExistingChat={false}
            insightPostId={post.id}
            className="h-9 min-h-9 w-full justify-center gap-1.5 px-4 text-[12px] sm:w-auto sm:min-w-[9.5rem]"
          />
        )
      }
    />
  );
}
