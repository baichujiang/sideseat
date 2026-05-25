"use client";

import { ClassmatePostInsightKind } from "@prisma/client";
import { apiFetch } from "@/lib/auth/api-fetch";

import { Loader2, MessageCircle, NotebookPen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { cn } from "@/lib/utils";

type Props = {
  peerId: string;
  courseId?: string;
  /** Path to return to after opening chat (e.g. `/discover` or `/discover/posts/xyz`). */
  returnTo?: string;
  /** `soft` — list chip; `subtle` — light brand pill (discover rows); `outline` — bordered pill (post card footer); `solid` — high-contrast CTA (e.g. post detail). */
  tone?: "soft" | "subtle" | "solid" | "outline";
  /** Override button label. Defaults to "Say hi" when `hasExistingChat` is false, "Message" when true. */
  label?: string;
  /** When false (no prior thread), default label becomes "Say hi". When true, becomes "Message". */
  hasExistingChat?: boolean;
  /** `notes` — notebook icon (e.g. self-notes from post detail). */
  icon?: "message" | "notes";
  /** When set, records a deduplicated MESSAGE_INTENT for the classmate post (author excluded server-side). */
  insightPostId?: string;
  /** Icon without visible label; uses `label` (or default) as `aria-label`. */
  iconOnly?: boolean;
  className?: string;
};

/** High-contrast CTA (post detail footer, etc.): matches `buttonVariants` default height/padding, full-width on small screens. */
export const discoverPrimarySolidCtaClassName =
  "inline-flex h-11 w-full min-w-[min(100%,10.5rem)] max-w-full touch-manipulation items-center justify-center gap-2 rounded-xl bg-classmates-blue px-5 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-classmates-blue/90 active:bg-classmates-blue/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-70 sm:w-auto sm:min-w-[12rem] dark:text-white";

/**
 * Subtle pill surface for Discover list secondary actions (Say hi subtle tone, My posts link).
 * Pair with `h-10` (or `h-8`) + width classes at the callsite so tap targets stay comfortable on cards.
 */
export const discoverSubtleSecondaryCtaSurfaceClassName = cn(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-classmates-blue-border bg-classmates-blue-soft px-4 py-2 text-sm font-medium text-classmates-blue no-underline transition-colors hover:bg-classmates-blue-border/45 active:bg-classmates-blue-border/65 disabled:opacity-70",
  "touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  "dark:border-blue-500/30 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/55 dark:active:bg-blue-950/70",
);

const toneClasses = {
  soft: "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-classmates-blue-soft px-3 text-[12px] font-semibold text-classmates-blue transition-colors hover:bg-classmates-blue-border/50 active:bg-classmates-blue-border/70 disabled:opacity-70 dark:border dark:border-blue-500/30 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/55",
  subtle: cn(discoverSubtleSecondaryCtaSurfaceClassName, "h-8"),
  solid: discoverPrimarySolidCtaClassName,
  outline: cn(
    "inline-flex h-10 min-h-10 shrink-0 touch-manipulation items-center justify-center gap-1.5 rounded-full border border-classmates-blue-border bg-white/90 px-4 text-[13px] font-semibold text-classmates-blue shadow-none transition-colors hover:bg-classmates-blue-soft/90 active:bg-classmates-blue-border/35 disabled:opacity-70",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "dark:border-blue-500/40 dark:bg-zinc-950/60 dark:text-blue-200 dark:hover:bg-blue-950/45 dark:active:bg-blue-950/60",
  ),
} as const;

export function DiscoverMessageButton({
  peerId,
  courseId,
  returnTo = "/discover",
  tone = "soft",
  label,
  hasExistingChat = false,
  icon = "message",
  insightPostId,
  iconOnly = false,
  className,
}: Props) {
  const buttonLabel = label ?? (hasExistingChat ? "Message" : "Say hi");
  const router = useRouter();
  const [opening, setOpening] = useState(false);

  async function openChat() {
    if (opening) return;
    setOpening(true);
    try {
      const res = await apiFetch("/api/connections/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerId, ...(courseId ? { courseId } : {}) }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOpening(false);
        return;
      }
      const data = payload?.data as { connectionId?: string } | undefined;
      const connectionId = data?.connectionId;
      if (!connectionId) {
        setOpening(false);
        return;
      }
      if (insightPostId) {
        void apiFetch(`/api/classmate-posts/${insightPostId}/insights`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: ClassmatePostInsightKind.MESSAGE_INTENT }),
        });
      }
      const back = encodeURIComponent(returnTo);
      // Avoid router.refresh() here: refreshing the current route while navigating
      // to /connections/* reliably stalls the UI in App Router.
      router.push(`/connections/${connectionId}?returnTo=${back}`);
    } catch {
      setOpening(false);
    }
  }

  return (
    <button
      type="button"
      onClick={openChat}
      disabled={opening}
      aria-label={iconOnly ? buttonLabel : undefined}
      className={cn(toneClasses[tone], className)}
    >
      {opening ? (
        <Loader2
          className={cn(
            "h-4 w-4 shrink-0 animate-spin",
            tone === "solid"
              ? "text-white"
              : tone === "subtle" || tone === "outline"
                ? "text-classmates-blue dark:text-blue-300"
                : "text-classmates-blue",
          )}
        />
      ) : (
        <>
          {icon === "notes" ? (
            <NotebookPen
              className={cn(
                "shrink-0",
                (tone === "subtle" || tone === "outline") && "h-3.5 w-3.5 text-classmates-blue dark:text-blue-300",
                tone === "soft" && "h-4 w-4 text-classmates-blue",
                tone === "solid" && "h-4 w-4 text-white",
              )}
              strokeWidth={2.25}
            />
          ) : (
            <MessageCircle
              className={cn(
                "shrink-0",
                (tone === "subtle" || tone === "outline") && "h-3.5 w-3.5 text-classmates-blue dark:text-blue-300",
                tone === "soft" && "h-4 w-4 text-classmates-blue",
                tone === "solid" && "h-4 w-4 text-white",
              )}
              strokeWidth={2.25}
            />
          )}
          {iconOnly ? null : buttonLabel}
        </>
      )}
    </button>
  );
}
