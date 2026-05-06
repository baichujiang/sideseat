"use client";

import { Check, Share2 } from "lucide-react";
import { useCallback, useState } from "react";

import { cn } from "@/lib/utils";

/** At or below this enrolled count, nudge growth with “Invite classmates”. */
const INVITE_CLASSMATE_THRESHOLD = 3;

/**
 * Copy or Web Share the canonical course URL (`/courses/[id]` on current origin).
 * Low enrollment → “Invite classmates”; otherwise “Share course link”.
 */
const buttonVariantClass =
  "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-classmates-edge bg-classmates-surface px-4 text-[13px] font-semibold text-classmates-ink shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:bg-classmates-warm-alt active:bg-classmates-warm-alt/80 dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-muted/40";

/** Growth CTA — explicit brand blue so it reads as the page’s main action. */
const buttonPrimaryClass =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#2563EB] px-5 py-3 text-sm font-semibold text-white shadow-[0_6px_16px_rgba(37,99,235,0.2)] transition hover:bg-[#1D4ED8] active:bg-[#1E40AF] dark:bg-blue-600 dark:text-white dark:shadow-[0_6px_16px_rgba(37,99,235,0.35)] dark:hover:bg-blue-500";

export function CourseShareLinkAction({
  courseId,
  memberCount,
  variant = "card",
  className,
  /** When set, used instead of invite/share copy (still uses inviteMode for share body text). */
  labelOverride,
}: {
  courseId: string;
  memberCount: number;
  variant?: "card" | "detail" | "button" | "buttonPrimary" | "icon";
  className?: string;
  labelOverride?: string;
}) {
  const [copied, setCopied] = useState(false);
  const inviteMode = memberCount <= INVITE_CLASSMATE_THRESHOLD;

  const share = useCallback(async () => {
    const path = `/courses/${courseId}`;
    const url = `${window.location.origin}${path}`;
    const title = "SideSeat course";
    const invite = memberCount <= INVITE_CLASSMATE_THRESHOLD;
    const text = invite
      ? `Want to join this course on SideSeat? Here’s the link: ${url}`
      : url;

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (e) {
        if ((e as { name?: string }).name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }, [courseId, memberCount]);

  const defaultLabel = inviteMode ? "Invite classmates" : "Share course link";
  const label = copied ? "Link copied" : (labelOverride ?? defaultLabel);
  const iconAriaLabel = copied
    ? "Link copied"
    : inviteMode
      ? "Invite classmates — share course link"
      : "Share course link";

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          void share();
        }}
        aria-label={iconAriaLabel}
        title={iconAriaLabel}
        className={cn(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#E7E0D6] bg-white/95 text-[#5F6B7A] shadow-sm backdrop-blur-sm transition",
          "hover:border-[#D8D1C7] hover:bg-[#FAFAF8] hover:text-[#111827] active:scale-[0.97]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
          "dark:border-border dark:bg-card/95 dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground dark:focus-visible:ring-offset-card",
          copied && "border-emerald-200/80 text-emerald-700 dark:border-emerald-900/50 dark:text-emerald-400",
          className,
        )}
      >
        {copied ? (
          <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        ) : (
          <Share2 className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void share()}
      className={cn(
        variant === "buttonPrimary"
          ? buttonPrimaryClass
          : variant === "button"
            ? buttonVariantClass
            : variant === "card"
              ? "text-left text-xs font-medium text-classmates-hint underline-offset-2 transition hover:text-classmates-blue hover:underline dark:text-muted-foreground dark:hover:text-blue-400"
              : "text-left text-sm font-medium text-classmates-sub underline-offset-2 transition hover:text-classmates-blue hover:underline dark:text-muted-foreground dark:hover:text-blue-400",
        className,
      )}
    >
      {label}
    </button>
  );
}
