"use client";

import Link from "next/link";
import type { Route } from "next";
import { CalendarDays, Heart } from "lucide-react";

import { ClassmatePostImagesGallery } from "@/components/discover/classmate-post-images-gallery";
import { displayableClassmatePostImageUrls } from "@/lib/discover/classmate-post-display-images";
import { ClassmatePostSaveButton } from "@/components/discover/classmate-post-save-button";
import { DiscoverMessageButton } from "@/components/discover/discover-message-button";
import { useLocaleContext } from "@/components/i18n/locale-provider";
import { buddyRequestAvailabilityValue, buddyRequestStatusLabel } from "@/lib/discover/buddy-request-detail-meta";
import { getBuddyRequestDisplayStatus } from "@/lib/discover/buddy-request-status";
import { buddyTypeLabel, shouldShowBuddyCategoryLabel } from "@/lib/discover/buddy-type-labels";
import type { DiscoverPostRow } from "@/lib/discover/discover-post-row";
import { formatClassmatePostExpiryMonthDay } from "@/lib/i18n/format-classmate-post-expiry";
import { formatMessage } from "@/lib/i18n/messages";
import { ClassmatePostStatus } from "@prisma/client";
import type { ReactNode } from "react";
import { useAppMessages } from "@/hooks/use-app-locale";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import { cn } from "@/lib/utils";

function isNeverExpiry(value: Date) {
  return new Date(value).getUTCFullYear() >= 2099;
}

export function BuddyRequestCard({
  post,
  returnTo = "/discover",
  customFooter,
  headerOverlay,
  articleClassName,
  hideAuthorRow = false,
  listingStatus,
}: {
  post: DiscoverPostRow;
  returnTo?: string;
  /** When set, replaces the default message action in the author row. */
  customFooter?: ReactNode;
  headerOverlay?: ReactNode;
  articleClassName?: string;
  hideAuthorRow?: boolean;
  listingStatus?: ClassmatePostStatus;
}) {
  const m = useAppMessages();
  const { locale } = useLocaleContext();
  const dl = m.discoverList;
  const buddy = m.discoverBuddy;
  const detailHref =
    `/discover/posts/${post.id}?returnTo=${encodeURIComponent(returnTo)}` as Route;
  const profileHref =
    `/users/${post.userId}?returnTo=${encodeURIComponent(returnTo)}` as Route;
  const images = displayableClassmatePostImageUrls(post.imageUrls);
  const typeLabel = shouldShowBuddyCategoryLabel(post.category)
    ? buddyTypeLabel(post.category, buddy)
    : "";
  const displayStatus = getBuddyRequestDisplayStatus({
    status: listingStatus ?? ClassmatePostStatus.ACTIVE,
    expiresAt: new Date(post.expiresAt),
    now: new Date(),
  });
  const statusLabel = buddyRequestStatusLabel(locale, displayStatus);
  const availabilityLine = buddyRequestAvailabilityValue(
    locale,
    displayStatus,
    new Date(post.expiresAt),
    new Date(post.createdAt),
  );
  const showSave = post.savedByViewer !== undefined && !post.isDevExample;
  const showDefaultMessage = customFooter === undefined && !post.isDevExample;
  const linkedCourseId = post.linkedCourses?.[0]?.id;
  const contentReserveClass = showSave ? "pr-11 sm:pr-12" : undefined;
  const interestedLine =
    post.interestedCount !== undefined
      ? formatMessage(buddy.buddyInterestedCount, { count: post.interestedCount })
      : null;

  const expiryLabel = isNeverExpiry(post.expiresAt)
    ? dl.postNoExpiry
    : formatMessage(dl.postActiveUntil, {
        date: formatClassmatePostExpiryMonthDay(new Date(post.expiresAt), locale),
      });

  const articleSurfaceClassName = cn(
    "break-inside-avoid overflow-hidden rounded-2xl border border-[#E7E0D6] bg-white shadow-[0_4px_16px_rgba(15,23,42,0.04)] dark:border-border/80 dark:bg-card",
    showSave && "relative",
    articleClassName,
  );

  const mainBlock = (
    <>
      {headerOverlay ? (
        <div className={cn("mb-2 flex w-full items-start justify-between gap-2", contentReserveClass)}>
          {headerOverlay}
        </div>
      ) : null}
      <div className={cn("mb-2 flex items-start justify-between gap-2", contentReserveClass)}>
        {typeLabel ? (
          <span className="inline-flex rounded-full border border-classmates-blue-border/70 bg-classmates-blue-soft px-2.5 py-0.5 text-[11px] font-medium text-classmates-blue">
            {typeLabel}
          </span>
        ) : (
          <span />
        )}
        {displayStatus !== "open" ? (
          <span className="text-[11px] font-semibold text-muted-foreground">{statusLabel}</span>
        ) : null}
      </div>
      <h3 className={cn("text-[15px] font-semibold leading-snug text-foreground", contentReserveClass)}>
        {post.title}
      </h3>
      {post.body?.trim() ? (
        <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">
          {post.body.trim()}
        </p>
      ) : null}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-muted-foreground">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 truncate">
            {displayStatus === "open" ? expiryLabel : availabilityLine}
          </span>
        </span>
        {interestedLine ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 tabular-nums">
            <Heart className="h-3.5 w-3.5 shrink-0 text-red-500" aria-hidden />
            {interestedLine}
          </span>
        ) : null}
      </div>
      {images.length > 0 ? (
        <ClassmatePostImagesGallery
          urls={images}
          variant="card"
          ariaLabel={dl.postCardImagesAria}
          topClassName="mt-2"
          className="[&_img]:max-h-28"
        />
      ) : null}
    </>
  );

  const authorRow =
    !hideAuthorRow ? (
      <div className="flex items-center justify-between gap-2 border-t border-border/50 px-4 py-2.5">
        <Link
          href={profileHref}
          aria-label={m.discoverBuddyDetail.viewProfileAria}
          onClick={(event) => event.stopPropagation()}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg outline-none ring-offset-2 transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <PresetAvatar id={post.avatarUrl} size={28} className="h-7 w-7 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-[12px] font-medium leading-tight text-foreground">{post.nickname}</p>
            <p className="text-[10px] leading-tight text-muted-foreground">{buddy.buddyCardAuthorLabel}</p>
          </div>
        </Link>
        {showDefaultMessage ? (
          <DiscoverMessageButton
            peerId={post.userId}
            courseId={linkedCourseId}
            returnTo={returnTo}
            tone="outline"
            hasExistingChat={false}
            iconOnly
            className="h-10 w-10 min-h-10 min-w-10 shrink-0 touch-manipulation p-0 [&_svg]:h-[13px] [&_svg]:w-[13px]"
            label={buddy.buddyCardMessage}
            insightPostId={post.id}
          />
        ) : null}
      </div>
    ) : null;

  if (post.isDevExample) {
    return (
      <article className={articleSurfaceClassName}>
        <div className="px-4 py-3.5">
          {mainBlock}
          {!hideAuthorRow ? (
            <div className="mt-2.5 flex items-center gap-1.5 border-t border-border/50 pt-2.5">
              <PresetAvatar id={post.avatarUrl} size={28} className="h-7 w-7 shrink-0" />
              <div className="min-w-0">
                <p className="truncate text-[12px] font-medium leading-tight text-foreground">{post.nickname}</p>
                <p className="text-[10px] leading-tight text-muted-foreground">{buddy.buddyCardAuthorLabel}</p>
              </div>
            </div>
          ) : null}
        </div>
        <p className="px-4 pb-2 text-center text-[10px] text-muted-foreground">Demo</p>
      </article>
    );
  }

  return (
    <article className={articleSurfaceClassName}>
      {showSave ? (
        <div className="pointer-events-auto absolute right-1.5 top-1.5 z-20 sm:right-2 sm:top-2">
          <ClassmatePostSaveButton postId={post.id} initialSaved={Boolean(post.savedByViewer)} />
        </div>
      ) : null}
      <Link
        href={detailHref}
        className={cn(
          "block px-4 py-3.5 transition hover:border-classmates-blue-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          contentReserveClass,
        )}
      >
        {mainBlock}
      </Link>
      {authorRow}
      {customFooter}
    </article>
  );
}
