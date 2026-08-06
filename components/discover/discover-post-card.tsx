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
import { ClassmatePostImagesGallery } from "@/components/discover/classmate-post-images-gallery";
import { displayableClassmatePostImageUrls } from "@/lib/discover/classmate-post-display-images";
import { ClassmatePostSaveButton } from "@/components/discover/classmate-post-save-button";
import { DiscoverMessageButton } from "@/components/discover/discover-message-button";
import { DiscoverPostPostedTime } from "@/components/discover/discover-post-posted-time";
import { useLocaleContext } from "@/components/i18n/locale-provider";
import { UserGenderCardIcon } from "@/components/ui/user-gender-icon";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import {
  classmatePostCategoryToPalette,
  SCENE_LIST_ROW,
} from "@/lib/discover/scene-palette";
import type {
  DiscoverPostCardScene,
  DiscoverPostRow,
} from "@/lib/discover/discover-post-row";
import {
  courseMatchesViewer,
  type ViewerCourseMatchIndex,
} from "@/lib/discover/viewer-course-match";
import { formatClassmatePostExpiryMonthDay } from "@/lib/i18n/format-classmate-post-expiry";
import { formatMessage, type AppMessages } from "@/lib/i18n/messages";
import { useAppMessages } from "@/hooks/use-app-locale";
import { cn } from "@/lib/utils";
import { shouldShowBuddyCategoryLabel } from "@/lib/discover/buddy-type-labels";

export const DISCOVER_POST_CARD_SHELL_CLASS = cn(
  "rounded-3xl border border-border/55 bg-white px-5 py-4 shadow-[0_8px_30px_-14px_rgba(15,23,42,0.12)] sm:px-6 sm:py-5",
  "dark:border-border dark:bg-card dark:shadow-[0_14px_44px_-18px_rgba(0,0,0,0.52)]",
  "[@media(hover:hover)]:hover:shadow-[0_10px_34px_-14px_rgba(15,23,42,0.14)]",
  "dark:[@media(hover:hover)]:hover:shadow-[0_16px_48px_-14px_rgba(0,0,0,0.58)]",
);

/**
 * Bleed the tinted well to ~10px from the white card edges while the shell keeps px-5 sm:px-6
 * on the article. When a save control reserves `pr-11` on the header row, pull the well
 * further right so its width matches the full-width footer band.
 */
function discoverPostInnerPanelClass(showSaveCorner: boolean) {
  return cn(
    "w-full min-w-0 rounded-2xl border border-violet-100/75 bg-violet-50/80 py-3.5 dark:border-violet-500/22 dark:bg-violet-950/28",
    "-ml-[calc(theme(spacing.5)+3.5rem+theme(spacing.3)-0.625rem)]",
    showSaveCorner
      ? "mr-[calc(0.625rem-theme(spacing.5)-2.75rem)]"
      : "mr-[calc(0.625rem-theme(spacing.5))]",
    "sm:-ml-[calc(theme(spacing.6)+3.5rem+theme(spacing.4)-0.625rem)]",
    showSaveCorner
      ? "sm:mr-[calc(0.625rem-theme(spacing.6)-3rem)]"
      : "sm:mr-[calc(0.625rem-theme(spacing.6))]",
  );
}

const DISCOVER_POST_INNER_PANEL_BODY_CLASS =
  "w-full min-w-0 max-w-none px-3 sm:px-3.5";

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
    default:
      return null;
  }
}

function categoryTabLabel(
  c: ClassmatePostCategory,
  dl: AppMessages["discoverList"],
) {
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
    default:
      return dl.sceneTabStudy;
  }
}

function DiscoverPostCategoryBadge({
  category,
}: {
  category: ClassmatePostCategory;
}) {
  const m = useAppMessages();
  if (!shouldShowBuddyCategoryLabel(category)) return null;
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
  viewerCourseMatchIndex,
  listReturnTo,
  cardFooter,
  titleTrailing,
  yourPostBadge,
  className,
}: DiscoverPostCardProps) {
  const { locale, messages } = useLocaleContext();
  const dl = messages.discoverList;
  const studentRoleLabel =
    post.studentStatus === "CURRENT_STUDENT"
      ? messages.profileForm.statusCurrentStudent
      : post.studentStatus === "EXCHANGE_STUDENT"
        ? messages.profileForm.statusExchangeStudent
        : post.studentStatus === "ALUMNI"
          ? [messages.profileForm.statusAlumni, post.graduationYear].filter(Boolean).join(" ")
          : null;
  const displayImages = displayableClassmatePostImageUrls(post.imageUrls);
  const tagline = post.tagline?.trim() ?? "";
  const meta = [
    post.major,
    post.semester
      ? formatMessage(messages.meIdentity.schoolLineSemester, { semester: post.semester })
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const postPath = `/discover/posts/${post.id}`;
  const returnTo = listReturnTo ?? "/discover";
  const postDetailHref =
    `${postPath}?returnTo=${encodeURIComponent(returnTo)}` as Route;
  const myPostsManageHref =
    `/profile/my-posts?returnTo=${encodeURIComponent(postPath)}&highlight=${encodeURIComponent(post.id)}` as Route;
  const isDevExample = Boolean(post.isDevExample);
  const showSaveCorner = post.savedByViewer !== undefined && !isDevExample;
  /** Satisfies `Route` when `disableNavigation`; href is unused. */
  const noopPersonRowHref = "/discover" as Route;

  const showYourPostTitlePill = post.isOwn && yourPostBadge !== false;

  const expiryLabel = isNeverExpiry(post.expiresAt)
    ? dl.postNoExpiry
    : formatMessage(dl.postActiveUntil, {
        date: formatClassmatePostExpiryMonthDay(
          new Date(post.expiresAt),
          locale,
        ),
      });

  const showSharedCourseChips =
    post.category === ClassmatePostCategory.SHARED_COURSES &&
    post.linkedCourses &&
    post.linkedCourses.length > 0;

  const statusLabel =
    post.status === "CLOSED" ? "Matched" : post.status === "EXPIRED" ? "Expired" : "Open";
  const visibilityLabel =
    post.visibility === "CITY_INTERNATIONALS"
      ? "Everyone"
      : post.visibility === "VERIFIED_ONLY"
        ? "Verified students"
        : post.visibility === "COURSEMATES_ONLY"
          ? "Coursemates"
          : "Same school";

  const defaultFooter = (
    <div className="mt-3 flex w-full min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border/55 pt-3 dark:border-border/50">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1 sm:flex-none sm:max-w-[min(100%,26rem)]">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] leading-snug text-muted-foreground">
          <Calendar
            className="h-3.5 w-3.5 shrink-0 opacity-80"
            strokeWidth={2}
            aria-hidden
          />
          <span className="min-w-0 truncate">{expiryLabel}</span>
        </span>
        <span className="hidden shrink-0 text-[11px] text-muted-foreground/55 sm:inline" aria-hidden>
          ·
        </span>
        <DiscoverPostPostedTime
          at={post.createdAt}
          className="text-[11px] leading-snug text-muted-foreground"
        />
      </div>
      {post.isOwn && !isDevExample ? (
        <Link
          href={myPostsManageHref}
          aria-label={dl.postCardOwnPostManageCtaAria}
          className={DISCOVER_POST_MY_POSTS_PILL_CLASS}
        >
          {dl.postCardOwnPostManageCta}
        </Link>
      ) : isDevExample ? (
        <span
          className="inline-flex min-h-10 min-w-[6.5rem] items-center justify-center rounded-full border border-dashed border-muted-foreground/35 bg-muted/20 px-3 text-center text-[11px] font-medium text-muted-foreground"
          title="Dev-only example card"
        >
          示例展示
        </span>
      ) : (
        <DiscoverMessageButton
          peerId={post.userId}
          returnTo={postPath}
          tone="outline"
          hasExistingChat={false}
          insightPostId={post.id}
          className="min-h-10 min-w-[6.5rem] justify-center"
        />
      )}
    </div>
  );

  return (
    <ClassmatesPersonRow
      className={cn(DISCOVER_POST_CARD_SHELL_CLASS, className)}
      avatarHref={isDevExample ? noopPersonRowHref : postDetailHref}
      contentHref={isDevExample ? noopPersonRowHref : postDetailHref}
      disableNavigation={isDevExample}
      avatarUrl={post.avatarUrl}
      profileAriaLabel={
        post.isOwn
          ? dl.postCardViewYourPostAria
          : formatMessage(dl.postCardViewPeerPostAria, { name: post.nickname })
      }
      name={post.nickname}
      nameClassName="text-[17px] font-bold leading-snug tracking-tight text-classmates-ink dark:text-foreground"
      nameRowAdornment={
        <>
          <VerifiedBadge
            size="xs"
            tone="brandBlue"
            school={post.school}
            verifiedStudent={post.verifiedStudent}
            status={post.studentVerificationStatus}
          />
          {studentRoleLabel ? (
            <span className="shrink-0 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-700 ring-1 ring-inset ring-teal-200 dark:bg-teal-950/35 dark:text-teal-200 dark:ring-teal-500/30">
              {studentRoleLabel}
            </span>
          ) : null}
        </>
      }
      body={
        <>
          {tagline ? (
            <p className="mt-1 line-clamp-1 text-[13px] leading-snug text-classmates-sub dark:text-muted-foreground">
              {tagline}
            </p>
          ) : null}
          {meta ? (
            <p className="mt-1 truncate text-[13px] leading-snug text-muted-foreground">
              {meta}
            </p>
          ) : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <UserGenderCardIcon gender={post.gender} className="shrink-0" />
            <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/35 dark:text-emerald-200 dark:ring-emerald-500/30">
              {statusLabel}
            </span>
            <span className="shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 ring-1 ring-inset ring-sky-200 dark:bg-sky-950/35 dark:text-sky-200 dark:ring-sky-500/30">
              {visibilityLabel}
            </span>
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
          </div>
          <div className={cn("mt-3", discoverPostInnerPanelClass(showSaveCorner))}>
            <div className={DISCOVER_POST_INNER_PANEL_BODY_CLASS}>
              <div className="mb-2 flex w-full min-w-0 flex-wrap gap-1.5">
                <DiscoverPostCategoryBadge category={post.category} />
              </div>
              <p className="w-full min-w-0 max-w-none break-words text-lg font-bold leading-snug tracking-tight text-foreground sm:text-xl">
                {post.title}
              </p>
              {post.body ? (
                <p className="mt-2 line-clamp-2 w-full min-w-0 max-w-none break-words text-[13px] leading-snug text-muted-foreground sm:line-clamp-3">
                  {post.body}
                </p>
              ) : null}
              {post.tags.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {post.tags.slice(0, 6).map((tag) => (
                    <span
                      key={tag}
                      className="max-w-[9rem] truncate rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground ring-1 ring-inset ring-border/60 dark:bg-background/35"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              ) : null}
              {displayImages.length > 0 ? (
                <ClassmatePostImagesGallery
                  urls={displayImages}
                  variant="card"
                  ariaLabel={dl.postCardImagesAria}
                />
              ) : null}
              {showSharedCourseChips ? (
                <div
                  className="mt-2.5 flex flex-wrap gap-1.5"
                  aria-label={dl.postCardLinkedCoursesAria}
                >
                  {post.linkedCourses!.map((c) => (
                    <DiscoverPostLinkedCourseChip
                      key={c.id}
                      code={c.code}
                      name={c.name}
                      matchesViewer={courseMatchesViewer(
                        c,
                        viewerCourseMatchIndex,
                      )}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </>
      }
      cardFooter={cardFooter ?? defaultFooter}
      cardTopRightAction={
        showSaveCorner ? (
          <ClassmatePostSaveButton
            postId={post.id}
            initialSaved={Boolean(post.savedByViewer)}
          />
        ) : undefined
      }
    />
  );
}
