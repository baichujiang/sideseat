"use client";

import { useAppMessages } from "@/hooks/use-app-locale";
import { cn } from "@/lib/utils";

/** Pending state while the assistant reply is generating (complete-reply UX). */
export function AssistantTypingIndicator({ className }: { className?: string }) {
  const { assistant: a } = useAppMessages();

  return (
    <div
      className={cn("flex items-center gap-2 px-1 py-1.5", className)}
      role="status"
      aria-live="polite"
      aria-label={a.typingLabel}
      data-testid="assistant-typing"
    >
      <span className="inline-flex items-center gap-1 rounded-[1.15rem] bg-white px-3.5 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.06)] ring-1 ring-black/[0.04] dark:bg-zinc-900 dark:ring-white/10">
        <span className="flex items-center gap-1" aria-hidden>
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500/80 [animation-delay:0ms]" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500/80 [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500/80 [animation-delay:300ms]" />
        </span>
        <span className="pl-1 text-[11px] text-muted-foreground">{a.typingLabel}</span>
      </span>
    </div>
  );
}
