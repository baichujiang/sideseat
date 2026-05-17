"use client";

import { format } from "date-fns";
import { ClassmatePostStatus } from "@prisma/client";
import { Eye, MessageCircle } from "lucide-react";

import { BuddyRequestCard } from "@/components/discover/buddy-request-card";
import { ClassmatePostDetailShareMenu } from "@/components/discover/classmate-post-detail-share-menu";
import { useLocaleContext } from "@/components/i18n/locale-provider";
import type { DiscoverPostRow } from "@/lib/discover/discover-post-row";
import { useAppMessages } from "@/hooks/use-app-locale";
import {
  formatClassmatePostExpiryFullDate,
} from "@/lib/i18n/format-classmate-post-expiry";
import { formatMessage } from "@/lib/i18n/messages";
import type { ClassmatePostInsightCounts } from "@/lib/queries/classmate-post-insight-counts";
import { cn } from "@/lib/utils";

export function MyPostBuddyCard({
  post,
  status,
  createdAt,
  updatedAt,
  insights,
  muted,
}: {
  post: DiscoverPostRow;
  status: ClassmatePostStatus;
  createdAt: Date;
  updatedAt: Date;
  insights: ClassmatePostInsightCounts;
  muted: boolean;
}) {
  const m = useAppMessages();
  const { locale } = useLocaleContext();
  const dl = m.discoverList;
  const postPath = `/discover/posts/${post.id}`;
  const live = status === ClassmatePostStatus.ACTIVE && post.expiresAt > new Date();
  const statusLabel = !live
    ? status === ClassmatePostStatus.CLOSED
      ? locale === "zh-CN"
        ? "已关闭"
        : "Closed"
      : post.expiresAt <= new Date()
        ? locale === "zh-CN"
          ? "已过期"
          : "Expired"
        : locale === "zh-CN"
          ? "已结束"
          : "Ended"
    : null;
  const wasEdited = updatedAt.getTime() - createdAt.getTime() > 60_000;

  const headerOverlay = (
    <>
      {live ? (
        <span className="rounded-full border border-emerald-500/35 bg-emerald-500/90 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
          {locale === "zh-CN" ? "展示中" : "Active"}
        </span>
      ) : statusLabel ? (
        <span className="rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white shadow-sm backdrop-blur-sm">
          {statusLabel}
        </span>
      ) : (
        <span />
      )}
      <ClassmatePostDetailShareMenu
        title={post.title}
        body={post.body}
        postPath={postPath}
        className="shrink-0"
      />
    </>
  );

  const customFooter = (
    <div className="space-y-1 border-t border-border/50 px-2.5 pb-2.5 pt-2 text-[10px] leading-snug text-muted-foreground">
      <p>
        <span className="font-medium text-foreground/80">
          {locale === "zh-CN" ? "发布" : "Posted"}
        </span>{" "}
        <time dateTime={createdAt.toISOString()}>{format(createdAt, "MMM d, yyyy · h:mm a")}</time>
      </p>
      {wasEdited ? (
        <p>
          <span className="font-medium text-foreground/80">
            {locale === "zh-CN" ? "最近编辑" : "Last edited"}
          </span>{" "}
          <time dateTime={updatedAt.toISOString()}>{format(updatedAt, "MMM d, yyyy · h:mm a")}</time>
        </p>
      ) : null}
      {live ? (
        <p className="line-clamp-2">
          {formatMessage(dl.postActiveUntil, {
            date: formatClassmatePostExpiryFullDate(post.expiresAt, locale),
          })}
        </p>
      ) : null}
      <p
        className="flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums"
        aria-label={
          locale === "zh-CN"
            ? `${insights.detailViews} 次浏览，${insights.messageIntents} 次发起聊天`
            : `${insights.detailViews} unique views, ${insights.messageIntents} chats started`
        }
      >
        <span className="inline-flex items-center gap-1">
          <Eye className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
          {insights.detailViews}{" "}
          {locale === "zh-CN"
            ? "次浏览"
            : insights.detailViews === 1
              ? "view"
              : "views"}
        </span>
        <span aria-hidden>·</span>
        <span className="inline-flex items-center gap-1">
          <MessageCircle className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
          {insights.messageIntents}{" "}
          {locale === "zh-CN"
            ? "次聊天"
            : insights.messageIntents === 1
              ? "chat started"
              : "chats started"}
        </span>
      </p>
    </div>
  );

  return (
    <BuddyRequestCard
      post={post}
      returnTo="/profile/my-posts"
      hideAuthorRow
      listingStatus={status}
      headerOverlay={headerOverlay}
      customFooter={customFooter}
      articleClassName={cn(muted && "opacity-[0.88] saturate-[0.9]")}
    />
  );
}
