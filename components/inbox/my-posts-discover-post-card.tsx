"use client";

import { format } from "date-fns";
import { Clock, Eye, MapPin, MessageCircle } from "lucide-react";
import { ClassmatePostStatus } from "@prisma/client";

import { ClassmatePostDetailShareMenu } from "@/components/discover/classmate-post-detail-share-menu";
import { DiscoverPostCard } from "@/components/discover/discover-post-card";
import {
  discoverSceneForPostCategory,
  type DiscoverPostRow,
} from "@/lib/discover/discover-post-row";
import { getDiscoverCityDisplayLabel } from "@/lib/discover/discover-city-display";
import type { ViewerCourseMatchIndex } from "@/lib/discover/viewer-course-match";
import type { AppLocale } from "@/lib/i18n/app-locale";
import {
  formatClassmatePostExpiryFullDate,
} from "@/lib/i18n/format-classmate-post-expiry";
import { formatMessage, getMessages } from "@/lib/i18n/messages";
import type { ClassmatePostInsightCounts } from "@/lib/queries/classmate-post-insight-counts";
import { cn } from "@/lib/utils";

export function MyPostsDiscoverPostCard({
  locale,
  post,
  viewerCourseMatchIndex,
  status,
  createdAt,
  updatedAt,
  insights,
  muted,
}: {
  locale: AppLocale;
  post: DiscoverPostRow;
  viewerCourseMatchIndex: ViewerCourseMatchIndex;
  status: ClassmatePostStatus;
  createdAt: Date;
  updatedAt: Date;
  insights: ClassmatePostInsightCounts;
  muted: boolean;
}) {
  const messages = getMessages(locale);
  const dl = messages.discoverList;
  const cityLabel = getDiscoverCityDisplayLabel(post.city, messages.discover.cityNames);
  const postPath = `/discover/posts/${post.id}`;
  const live = status === ClassmatePostStatus.ACTIVE && post.expiresAt > new Date();
  const statusLabel = !live
    ? status === ClassmatePostStatus.CLOSED
      ? "Closed"
      : post.expiresAt <= new Date()
        ? "Expired"
        : "Ended"
    : null;
  const wasEdited = updatedAt.getTime() - createdAt.getTime() > 60_000;
  const scene = discoverSceneForPostCategory(post.category);

  const titleTrailing = live ? (
    <span className="shrink-0 rounded-full border border-emerald-500/35 bg-emerald-500/12 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300">
      Active
    </span>
  ) : statusLabel ? (
    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {statusLabel}
    </span>
  ) : null;

  const cardFooter = (
    <div className="mt-3 w-full min-w-0 space-y-1.5 border-t border-border/45 pt-3 text-[11px] leading-snug text-muted-foreground dark:border-border/50">
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <Clock className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
        <span className="font-medium text-foreground/75">Posted</span>
        <time dateTime={createdAt.toISOString()}>{format(createdAt, "MMM d, yyyy · h:mm a")}</time>
      </span>
      {wasEdited ? (
        <span className="flex flex-wrap items-center gap-1.5 pl-[1.125rem] sm:pl-0">
          <span className="font-medium text-foreground/75">Last edited</span>
          <time dateTime={updatedAt.toISOString()}>{format(updatedAt, "MMM d, yyyy · h:mm a")}</time>
        </span>
      ) : null}
      <span className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
        <MapPin className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
        {cityLabel}
        <span aria-hidden>·</span>
        {live ? (
          <>
            <span className="sr-only">
              {locale === "zh-CN" ? "帖子有效期" : "Listing expires"}
            </span>
            {formatMessage(dl.postActiveUntil, {
              date: formatClassmatePostExpiryFullDate(post.expiresAt, locale),
            })}
          </>
        ) : (
          <>
            {statusLabel ? `${statusLabel} · ` : null}
            <span className="sr-only">Last update</span>
            {formatClassmatePostExpiryFullDate(updatedAt, locale)}
          </>
        )}
      </span>
      <span
        className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] tabular-nums text-muted-foreground"
        aria-label={`${insights.detailViews} unique views, ${insights.messageIntents} started a chat from this post`}
      >
        <span className="inline-flex items-center gap-1">
          <Eye className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
          {insights.detailViews} {insights.detailViews === 1 ? "view" : "views"}
        </span>
        <span aria-hidden>·</span>
        <span className="inline-flex items-center gap-1">
          <MessageCircle className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
          {insights.messageIntents}{" "}
          {insights.messageIntents === 1 ? "chat started" : "chats started"}
        </span>
      </span>
    </div>
  );

  return (
    <li className="relative">
      <DiscoverPostCard
        post={post}
        scene={scene}
        viewerCourseMatchIndex={viewerCourseMatchIndex}
        listReturnTo="/inbox/my-posts"
        cardFooter={cardFooter}
        titleTrailing={titleTrailing}
        yourPostBadge={false}
        className={cn(muted && "opacity-[0.88] saturate-[0.9]")}
      />
      <ClassmatePostDetailShareMenu
        title={post.title}
        body={post.body}
        postPath={postPath}
        className="absolute right-3 top-3 z-10"
      />
    </li>
  );
}
