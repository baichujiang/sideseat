"use client";

import { useLocaleContext } from "@/components/i18n/locale-provider";
import { formatListRelativeTime } from "@/lib/format/list-relative-time";
import { cn } from "@/lib/utils";

export function InboxRowTimestamp({ at, className }: { at: Date | string | number; className?: string }) {
  const { locale, messages } = useLocaleContext();
  const date = at instanceof Date ? at : new Date(at);
  const label = formatListRelativeTime(date, locale, messages.common.listRelativeTime);

  return (
    <time
      dateTime={Number.isNaN(date.getTime()) ? undefined : date.toISOString()}
      className={cn(
        "max-w-[5.5rem] shrink-0 text-right text-xs leading-tight text-[#8A94A6] dark:text-zinc-500 sm:max-w-[6.75rem]",
        "line-clamp-2 break-words",
        className,
      )}
    >
      {label}
    </time>
  );
}
