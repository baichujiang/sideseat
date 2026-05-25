"use client";

import { WifiOff } from "lucide-react";

import { useLocaleContext } from "@/components/i18n/locale-provider";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { cn } from "@/lib/utils";

export function OfflineBanner({ className }: { className?: string }) {
  const isOnline = useOnlineStatus();
  const { messages } = useLocaleContext();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className={cn(
        "mb-3 flex items-center gap-2 rounded-2xl border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-[12px] font-medium text-amber-950 shadow-sm",
        "dark:border-amber-400/25 dark:bg-amber-950/35 dark:text-amber-100",
        className,
      )}
    >
      <WifiOff className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
      <span>{messages.offline.banner}</span>
    </div>
  );
}
