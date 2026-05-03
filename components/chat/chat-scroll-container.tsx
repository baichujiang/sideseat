"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Keeps the viewport pinned to the latest messages (standard chat behavior),
 * and shows a floating "scroll to bottom" button once the user has scrolled
 * up more than a screen-height.
 *
 * Auto-scroll behavior:
 *  - Always snap to bottom on initial render.
 *  - When a new message arrives (`messageCount` increases), snap only if the
 *    user is already near the bottom — otherwise leave their scroll position
 *    alone and let the FAB reveal the new activity.
 */
export function ChatScrollContainer({
  messageCount,
  children,
}: {
  messageCount: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  /** `null` until the first layout pass for this mount (avoids treating every run as "initial"). */
  const prevCount = useRef<number | null>(null);
  const [showFab, setShowFab] = useState(false);

  const nearBottom = (el: HTMLDivElement) =>
    el.scrollHeight - el.scrollTop - el.clientHeight < 160;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (prevCount.current === null) {
      el.scrollTop = el.scrollHeight;
      prevCount.current = messageCount;
      return;
    }

    const grew = messageCount > prevCount.current;
    if (grew && nearBottom(el)) {
      el.scrollTop = el.scrollHeight;
    }
    prevCount.current = messageCount;
  }, [messageCount]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      setShowFab(!nearBottom(el) && el.scrollHeight > el.clientHeight + 40);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToBottom = () => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={ref}
        className="h-full overflow-y-auto overscroll-y-contain px-3 pt-2"
      >
        {children}
      </div>
      <button
        type="button"
        onClick={scrollToBottom}
        aria-label="Scroll to latest"
        className={cn(
          "absolute bottom-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-lg transition",
          "hover:text-foreground",
          showFab
            ? "opacity-100 translate-y-0"
            : "pointer-events-none translate-y-2 opacity-0",
        )}
      >
        <ChevronDown className="h-4 w-4" strokeWidth={2.25} />
      </button>
    </div>
  );
}
