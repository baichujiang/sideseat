"use client";

import type { Route } from "next";
import Link from "next/link";
import { CalendarRange, ExternalLink } from "lucide-react";

import { useLocaleContext } from "@/components/i18n/locale-provider";
import { formatMessage } from "@/lib/i18n/messages";
import { pathFromScheduleShareUrl } from "@/lib/schedule-share/share-link-urls";

export function ScheduleShareCardMessage({
  shareUrl,
  ownerName,
  isOwner,
}: {
  shareUrl: string;
  ownerName: string;
  isOwner: boolean;
}) {
  const { messages: ui } = useLocaleContext();
  const c = ui.chat;
  const href = pathFromScheduleShareUrl(shareUrl) as Route;

  const title = isOwner
    ? c.scheduleShareCardTitleOwn
    : formatMessage(c.scheduleShareCardTitlePeer, { name: ownerName });
  const subtitle = isOwner ? c.scheduleShareCardSubtitleOwn : c.scheduleShareCardSubtitlePeer;

  return (
    <div className="mx-auto w-full max-w-md overflow-hidden rounded-[1.35rem] border border-sky-200/90 bg-sky-50/70 shadow-sm dark:border-sky-800/60 dark:bg-sky-950/35">
      <div className="h-1.5 w-full bg-sky-400/80 dark:bg-sky-500/70" />
      <div className="p-3.5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500/12 text-sky-700 dark:text-sky-300">
            <CalendarRange className="h-4.5 w-4.5" strokeWidth={2.25} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-foreground">{title}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-foreground/75">{subtitle}</p>
            <Link
              href={href}
              target={isOwner ? undefined : "_blank"}
              rel={isOwner ? undefined : "noopener noreferrer"}
              className="mt-3 inline-flex h-9 items-center justify-center rounded-full bg-primary px-4 text-[12px] font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
            >
              {c.scheduleShareCardOpen}
              <ExternalLink className="ml-1.5 h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
