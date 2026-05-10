"use client";

import { Check, Share2 } from "lucide-react";
import { useCallback, useState } from "react";

import { buildClassmatePostXhsShareText } from "@/lib/discover/share-classmate-post-to-xhs";
import { cn } from "@/lib/utils";

const compactClass =
  "inline-flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-full border-2 border-border bg-card px-4 text-[13px] font-semibold text-foreground shadow-sm transition hover:bg-muted/70 active:bg-muted disabled:opacity-60 sm:w-auto sm:min-w-[10.25rem] dark:hover:bg-muted/50";

export function ClassmatePostShareToXhsButton({
  title,
  body,
  postPath,
  variant = "detail",
  className,
}: {
  title: string;
  body: string | null;
  /** Absolute path, e.g. `/discover/posts/…` */
  postPath: string;
  variant?: "detail" | "compact";
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const share = useCallback(async () => {
    const path = postPath.startsWith("/") ? postPath : `/${postPath}`;
    const pageUrl = `${window.location.origin}${path}`;
    const text = buildClassmatePostXhsShareText({ title, body, pageUrl });

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: title.slice(0, 120),
          text,
          url: pageUrl,
        });
        return;
      } catch (e) {
        if ((e as { name?: string }).name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2600);
    } catch {
      window.prompt("Copy for 小红书 — select all, then copy:", text);
    }
  }, [title, body, postPath]);

  const idleLabel = variant === "compact" ? "Share to 小红书" : "Share to 小红书";
  const copiedLabel = "Copied — paste in 小红书";

  return (
    <button
      type="button"
      onClick={() => void share()}
      className={cn(variant === "compact" ? compactClass : undefined, className)}
      aria-label={copied ? copiedLabel : `${idleLabel}, post link and text`}
    >
      {copied ? (
        <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />
      ) : (
        <Share2 className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
      )}
      <span className="min-w-0">{copied ? copiedLabel : idleLabel}</span>
    </button>
  );
}
