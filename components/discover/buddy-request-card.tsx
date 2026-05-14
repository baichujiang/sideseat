"use client";

import Link from "next/link";
import type { Route } from "next";
import { Calendar, Clock, MapPin } from "lucide-react";

import { ClassmatePostImagesGallery } from "@/components/discover/classmate-post-images-gallery";
import { ClassmatePostSaveButton } from "@/components/discover/classmate-post-save-button";
import { DiscoverMessageButton } from "@/components/discover/discover-message-button";
import { useLocaleContext } from "@/components/i18n/locale-provider";
import { buddyRequestAvailabilityValue, buddyRequestStatusLabel } from "@/lib/discover/buddy-request-detail-meta";
import { getBuddyRequestDisplayStatus } from "@/lib/discover/buddy-request-status";
import { buddyTypeLabel } from "@/lib/discover/buddy-type-labels";
import { formatMealsVenueLine, formatStudyVenueLine } from "@/lib/discover/format-post-venue-line";
import type { DiscoverPostRow } from "@/lib/discover/discover-post-row";
import { studyTimeSlotLabel } from "@/lib/discover/study-meta-labels";
import { getDiscoverCityDisplayLabel } from "@/lib/discover/discover-city-display";
import type { DiscoverCityNameKey } from "@/lib/discover/discover-city-name-keys";
import { formatMessage, type AppMessages } from "@/lib/i18n/messages";
import { ClassmatePostStatus } from "@prisma/client";
import { useAppMessages } from "@/hooks/use-app-locale";
import { cn } from "@/lib/utils";

function buddyTimeLine(post: DiscoverPostRow, dl: AppMessages["discoverList"], buddy: AppMessages["discoverBuddy"]) {
  const slots = post.studyMeta?.timeSlots;
  if (slots?.length) {
    return slots
      .slice(0, 2)
      .map((s) => studyTimeSlotLabel(s, dl))
      .join(" · ");
  }
  return buddy.buddyCardTimeTbd;
}

function buddyLocationLine(
  post: DiscoverPostRow,
  dl: AppMessages["discoverList"],
  cityLabel: string,
  buddy: AppMessages["discoverBuddy"],
) {
  if (post.category === "MEALS" && post.mealsMeta) {
    const line = formatMealsVenueLine(post.mealsMeta, dl);
    if (line.trim()) return line;
  }
  if (post.category === "STUDY" && post.studyMeta) {
    const line = formatStudyVenueLine(post.studyMeta, dl);
    if (line.trim()) return line;
  }
  return formatMessage(buddy.buddyCardCityLine, { city: cityLabel });
}

function MiniAvatar({ url, name }: { url: string | null; name: string }) {
  const initial = name.trim().charAt(0) || "?";
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- small list avatar
      <img src={url} alt="" className="h-7 w-7 shrink-0 rounded-full border border-border/50 object-cover" />
    );
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/50 bg-muted text-[10px] font-semibold text-muted-foreground">
      {initial}
    </span>
  );
}

export function BuddyRequestCard({
  post,
  cityNameKey,
}: {
  post: DiscoverPostRow;
  cityNameKey: DiscoverCityNameKey;
}) {
  const m = useAppMessages();
  const { locale } = useLocaleContext();
  const dl = m.discoverList;
  const buddy = m.discoverBuddy;
  const cityLabel = getDiscoverCityDisplayLabel(cityNameKey, m.discover.cityNames);
  const detailHref = (`/discover/posts/${post.id}?returnTo=%2Fdiscover` as Route) satisfies Route;
  const images = post.imageUrls ?? [];
  const typeLabel = buddyTypeLabel(post.category, buddy);
  const timeLine = buddyTimeLine(post, dl, buddy);
  const locLine = buddyLocationLine(post, dl, cityLabel, buddy);
  const displayStatus = getBuddyRequestDisplayStatus({
    status: ClassmatePostStatus.ACTIVE,
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
  const statusFooter = `${statusLabel} · ${availabilityLine}`;
  const showSave = post.savedByViewer !== undefined && !post.isDevExample;

  const linkedCourseId = post.linkedCourses?.[0]?.id;

  const mainBlock = (
    <>
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-muted/50">
        {images.length > 0 ? (
          <ClassmatePostImagesGallery
            urls={images}
            variant="card"
            ariaLabel={dl.postCardImagesAria}
            className="[&>div]:mt-0"
          />
        ) : (
          <div
            className={cn(
              "flex h-full min-h-[7.5rem] w-full flex-col justify-end bg-gradient-to-br from-violet-100/90 via-sky-50/80 to-amber-50/70 p-3 dark:from-violet-950/50 dark:via-slate-900/40 dark:to-amber-950/30",
            )}
          >
            <span className="inline-flex max-w-full self-start rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-foreground shadow-sm dark:bg-white/10 dark:text-foreground">
              {typeLabel}
            </span>
            <p className="mt-2 line-clamp-2 text-[14px] font-semibold leading-snug text-foreground drop-shadow-sm">
              {post.title}
            </p>
          </div>
        )}
      </div>

      <div className="space-y-1.5 p-2.5">
        {images.length > 0 ? (
          <span className="inline-flex max-w-full rounded-full bg-muted/80 px-2 py-0.5 text-[10px] font-semibold text-foreground/90">
            {typeLabel}
          </span>
        ) : null}
        {images.length > 0 ? (
          <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug text-foreground">{post.title}</h3>
        ) : null}
        {post.body ? (
          <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{post.body}</p>
        ) : null}

        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
          <span className="min-w-0 truncate">{timeLine}</span>
        </div>
        <div className="flex items-start gap-1 text-[10px] text-muted-foreground">
          <MapPin className="mt-0.5 h-3 w-3 shrink-0 opacity-80" aria-hidden />
          <span className="min-w-0 line-clamp-2 leading-snug">{locLine}</span>
        </div>

        <div className="flex items-center gap-2 pt-0.5">
          <MiniAvatar url={post.avatarUrl} name={post.nickname} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-medium text-foreground">{post.nickname}</p>
            {post.school ? (
              <p className="truncate text-[10px] text-muted-foreground">{post.school}</p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-1 border-t border-border/50 pt-2 text-[10px] text-muted-foreground">
          <Calendar className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{statusFooter}</span>
        </div>
      </div>
    </>
  );

  if (post.isDevExample) {
    return (
      <article className="break-inside-avoid overflow-hidden rounded-2xl border border-border/55 bg-white shadow-[0_4px_18px_-10px_rgba(15,23,42,0.12)] dark:border-border dark:bg-card">
        {mainBlock}
        <p className="px-2.5 pb-2 text-center text-[10px] text-muted-foreground">Demo</p>
      </article>
    );
  }

  return (
    <article className="break-inside-avoid overflow-hidden rounded-2xl border border-border/55 bg-white shadow-[0_4px_18px_-10px_rgba(15,23,42,0.12)] dark:border-border dark:bg-card">
      <Link
        href={detailHref}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {mainBlock}
      </Link>
      <div className="flex items-center justify-between gap-2 border-t border-border/50 px-2.5 pb-2.5 pt-2">
        <DiscoverMessageButton
          peerId={post.userId}
          courseId={linkedCourseId}
          returnTo="/discover"
          tone="outline"
          hasExistingChat={false}
          className="h-8 min-h-8 flex-1 touch-manipulation px-2 text-[11px]"
          label={buddy.buddyCardMessage}
          insightPostId={post.id}
        />
        {showSave ? (
          <ClassmatePostSaveButton postId={post.id} initialSaved={Boolean(post.savedByViewer)} />
        ) : null}
      </div>
    </article>
  );
}
