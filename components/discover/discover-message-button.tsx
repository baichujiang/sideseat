"use client";

import { Loader2, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  peerId: string;
  courseId?: string;
  /** Path to return to after opening chat (e.g. `/discover` or `/discover/posts/xyz`). */
  returnTo?: string;
  /** `soft` matches inline list chips; `solid` is a high-contrast CTA on post detail. */
  tone?: "soft" | "solid";
  className?: string;
};

const toneClasses = {
  soft: "inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-primary/10 px-3 text-[12px] font-semibold text-primary transition-colors hover:bg-primary/15 active:bg-primary/20 disabled:opacity-70",
  solid:
    "inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-primary px-4 text-[13px] font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 active:bg-primary/95 disabled:opacity-70",
} as const;

export function DiscoverMessageButton({
  peerId,
  courseId,
  returnTo = "/discover",
  tone = "soft",
  className,
}: Props) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);

  async function openChat() {
    if (opening) return;
    setOpening(true);
    try {
      const res = await fetch("/api/connections/open", {
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
      className={className ?? toneClasses[tone]}
    >
      {opening ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <MessageCircle className="mr-1.5 h-4 w-4" strokeWidth={2.25} />
          Message
        </>
      )}
    </button>
  );
}
