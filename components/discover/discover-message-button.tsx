"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { Loader2, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { cn } from "@/lib/utils";

type Props = {
  peerId: string;
  courseId?: string;
  /** Path to return to after opening chat (e.g. `/discover` or `/discover/posts/xyz`). */
  returnTo?: string;
  /** `soft` — list chip; `subtle` — light brand pill (discover rows); `solid` — high-contrast CTA (e.g. post detail). */
  tone?: "soft" | "subtle" | "solid";
  /** Override button label. Defaults to "Say hi" when `hasExistingChat` is false, "Message" when true. */
  label?: string;
  /** When false (no prior thread), default label becomes "Say hi". When true, becomes "Message". */
  hasExistingChat?: boolean;
  className?: string;
};

const toneClasses = {
  soft: "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-classmates-blue-soft px-3 text-[12px] font-semibold text-classmates-blue transition-colors hover:bg-classmates-blue-border/50 active:bg-classmates-blue-border/70 disabled:opacity-70 dark:border dark:border-blue-500/30 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/55",
  subtle:
    "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full border border-classmates-blue-border bg-classmates-blue-soft px-4 py-2 text-sm font-medium text-classmates-blue transition-colors hover:bg-classmates-blue-border/45 active:bg-classmates-blue-border/65 disabled:opacity-70 dark:border-blue-500/30 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/55 dark:active:bg-blue-950/70",
  solid:
    "inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-classmates-blue px-4 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-classmates-blue/90 active:bg-classmates-blue/95 disabled:opacity-70 dark:text-white",
} as const;

export function DiscoverMessageButton({
  peerId,
  courseId,
  returnTo = "/discover",
  tone = "soft",
  label,
  hasExistingChat = false,
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
      className={cn(toneClasses[tone], className)}
    >
      {opening ? (
        <Loader2
          className={cn(
            "h-4 w-4 shrink-0 animate-spin",
            tone === "solid"
              ? "text-white"
              : tone === "subtle"
                ? "text-classmates-blue"
                : "text-classmates-blue",
          )}
        />
      ) : (
        <>
          <MessageCircle
            className={cn(
              "shrink-0",
              tone === "subtle" && "h-3.5 w-3.5 text-classmates-blue dark:text-blue-300",
              tone === "soft" && "h-4 w-4 text-classmates-blue",
              tone === "solid" && "h-4 w-4 text-white",
            )}
            strokeWidth={2.25}
          />
          {buttonLabel}
        </>
      )}
    </button>
  );
}
