"use client";

import { Clock } from "lucide-react";

import { useLocaleContext } from "@/components/i18n/locale-provider";
import { formatListRelativeTime } from "@/lib/format/list-relative-time";
import { formatMessage } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

export function DiscoverPostPostedTime({
  at,
  className,
}: {
  at: Date | string | number;
  className?: string;
}) {
  const { locale, messages } = useLocaleContext();
  const date = at instanceof Date ? at : new Date(at);
  const relative = formatListRelativeTime(date, locale, messages.common.listRelativeTime);
  const ariaLabel = formatMessage(messages.discoverList.postPostedAria, { time: relative });
  const iso = Number.isNaN(date.getTime()) ? undefined : date.toISOString();

  return (
    <span className={cn("inline-flex min-w-0 max-w-full items-center gap-1.5", className)}>
      <Clock className="h-3.5 w-3.5 shrink-0 opacity-80" strokeWidth={2} aria-hidden />
      <time dateTime={iso} aria-label={ariaLabel} className="min-w-0 truncate">
        {relative}
      </time>
    </span>
  );
}
