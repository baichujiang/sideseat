"use client";

import type { Route } from "next";
import Link from "next/link";
import { CalendarRange, ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { useLocaleContext } from "@/components/i18n/locale-provider";
import { ScheduleShareCardThumbnail } from "@/components/schedule-share/schedule-share-card-thumbnail";
import { formatMessage } from "@/lib/i18n/messages";
import {
  getCachedScheduleShareChatPreview,
  loadScheduleShareChatPreview,
  primeScheduleShareChatPreviewCache,
  type ScheduleShareChatPreviewPayload,
} from "@/lib/schedule-share/load-chat-preview";
import {
  pathFromScheduleShareUrl,
  plainTokenFromScheduleShareRecipientUrl,
  scheduleShareRecipientViewHref,
} from "@/lib/schedule-share/share-link-urls";
import { cn } from "@/lib/utils";

export function ScheduleShareCardMessage({
  shareUrl,
  ownerName,
  isOwner,
  returnTo,
  initialPreview = null,
}: {
  shareUrl: string;
  ownerName: string;
  isOwner: boolean;
  /** When set (e.g. `/connections/:id`), share opens in-app with a back-to-chat control. */
  returnTo?: string;
  /** Server-preloaded calendar snapshot (avoids blank card before client fetch). */
  initialPreview?: ScheduleShareChatPreviewPayload | null;
}) {
  const { messages: ui } = useLocaleContext();
  const c = ui.chat;
  const token = plainTokenFromScheduleShareRecipientUrl(shareUrl);
  const href = (
    token && returnTo
      ? scheduleShareRecipientViewHref(token, { returnTo })
      : pathFromScheduleShareUrl(shareUrl)
  ) as Route;
  const openInNewTab = !returnTo && !isOwner;

  const title = isOwner
    ? c.scheduleShareCardTitleOwn
    : formatMessage(c.scheduleShareCardTitlePeer, { name: ownerName });
  const subtitle = isOwner ? c.scheduleShareCardSubtitleOwn : c.scheduleShareCardSubtitlePeer;

  const [preview, setPreview] = useState<ScheduleShareChatPreviewPayload | null>(() => {
    if (initialPreview) return initialPreview;
    if (!token) return null;
    const cached = getCachedScheduleShareChatPreview(token);
    return cached !== undefined ? cached : null;
  });
  const [loading, setLoading] = useState(() => {
    if (!token) return false;
    if (initialPreview) return false;
    return getCachedScheduleShareChatPreview(token) === undefined;
  });

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    if (initialPreview) {
      primeScheduleShareChatPreviewCache(token, initialPreview);
      setPreview(initialPreview);
      setLoading(false);
      return;
    }
    const cached = getCachedScheduleShareChatPreview(token);
    if (cached !== undefined) {
      setPreview(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void loadScheduleShareChatPreview(token).then((data) => {
      if (!cancelled) {
        setPreview(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [token, initialPreview]);

  const showThumbnail = Boolean(preview?.snapshot);

  return (
    <Link
      href={href}
      target={openInNewTab ? "_blank" : undefined}
      rel={openInNewTab ? "noopener noreferrer" : undefined}
      className="mx-auto block w-full max-w-md rounded-[1.35rem] border border-sky-200/90 bg-sky-50/70 shadow-sm transition hover:border-sky-300/90 hover:shadow-md dark:border-sky-800/60 dark:bg-sky-950/35 dark:hover:border-sky-700/70"
    >
      <div className="h-1.5 w-full bg-sky-400/80 dark:bg-sky-500/70" />
      <div className="p-3.5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500/12 text-sky-700 dark:text-sky-300">
            <CalendarRange className="h-4.5 w-4.5" strokeWidth={2.25} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-foreground">{title}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-foreground/75">{subtitle}</p>
          </div>
        </div>

        {token ? (
          <div className="relative mt-3">
            {loading ? (
              <div className="flex h-[9.5rem] items-center justify-center rounded-xl border border-dashed border-sky-200/80 bg-white/60 dark:border-sky-800/50 dark:bg-sky-950/30">
                <Loader2 className="h-5 w-5 animate-spin text-sky-600/70" aria-hidden />
                <span className="sr-only">{c.scheduleShareCardLoadingPreview}</span>
              </div>
            ) : showThumbnail ? (
              <div className="relative">
                <ScheduleShareCardThumbnail snapshot={preview!.snapshot} />
                {preview?.expired ? (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-background/55 px-3 text-center text-[11px] font-medium text-muted-foreground">
                    {c.scheduleShareCardPreviewExpired}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex h-[9.5rem] items-center justify-center rounded-xl border border-dashed border-sky-200/80 bg-white/50 px-4 text-center text-[12px] text-muted-foreground dark:border-sky-800/50 dark:bg-sky-950/25">
                {preview?.expired ? c.scheduleShareCardPreviewExpired : c.scheduleShareCardPreviewUnavailable}
              </div>
            )}
          </div>
        ) : null}

        <p
          className={cn(
            "mt-3 inline-flex h-9 items-center justify-center rounded-full bg-primary px-4 text-[12px] font-semibold text-primary-foreground shadow-sm",
          )}
        >
          {c.scheduleShareCardOpen}
          {openInNewTab ? (
            <ExternalLink className="ml-1.5 h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          ) : null}
        </p>
      </div>
    </Link>
  );
}
