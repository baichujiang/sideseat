"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { Bookmark } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAppMessages } from "@/hooks/use-app-locale";
import { cn } from "@/lib/utils";

/**
 * The one and only "save / unsave course" control. Replaces the older
 * `SaveCourseControl` that had a compact-star variant + a full amber bar
 * variant + ad-hoc rows in `SavedCoursesSection`. Having three widgets for
 * the same verb made saved courses feel like a different feature on every
 * surface; this collapses all of them into one bookmark button.
 *
 * The visual never shifts into a warning/amber color — saving a course is
 * not a cautionary action. State is communicated by fill alone.
 */
export function SaveBookmarkButton({
  courseId,
  initialSaved,
  /** Optional — when true, nothing renders. */
  enrolled = false,
  variant = "icon",
  className,
  onChange,
  readOnly = false,
}: {
  courseId: string;
  initialSaved: boolean;
  enrolled?: boolean;
  /**
   *  - "icon"  : round 32px icon-only button (default, use in lists / headers)
   *  - "chip"  : icon + "Save" / "Saved" label (use in search results)
   *  - "block" : full-width labeled button (use on course detail page)
   */
  variant?: "icon" | "chip" | "block";
  className?: string;
  /** Called after a successful save/unsave with the new `saved` state. */
  onChange?: (saved: boolean) => void;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const messages = useAppMessages();
  const co = messages.courses;
  const [saved, setSaved] = useState(initialSaved);
  const [pending, setPending] = useState(false);

  // Keep in sync if parent reruns with a different initial (e.g. after a
  // router.refresh() against a new course in the same list).
  useEffect(() => {
    setSaved(initialSaved);
  }, [initialSaved, courseId]);

  /** Enrolled users can’t use SavedCourse (API rejects); keep the control visible as “on schedule”. */
  if (enrolled) {
    if (variant === "icon") {
      return (
        <button
          type="button"
          disabled
          aria-label={co.bookmarkOnScheduleAria}
          title={co.bookmarkOnScheduleTitle}
          className={cn(
            "inline-flex h-8 w-8 shrink-0 cursor-default items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary opacity-95",
            className,
          )}
        >
          <Bookmark className="h-4 w-4 fill-primary" strokeWidth={2.25} />
        </button>
      );
    }
    if (variant === "chip") {
      return (
        <button
          type="button"
          disabled
          aria-label={co.bookmarkOnScheduleAria}
          title={co.bookmarkOnScheduleTitle}
          className={cn(
            "inline-flex shrink-0 cursor-default items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary opacity-95",
            className,
          )}
        >
          <Bookmark className="h-3 w-3 fill-primary" strokeWidth={2.25} />
          {co.bookmarkOnScheduleChip}
        </button>
      );
    }
    return (
      <button
        type="button"
        disabled
        aria-label={co.bookmarkOnScheduleAria}
        title={co.bookmarkOnScheduleTitle}
        className={cn(
          "flex w-full cursor-default items-center justify-center gap-2 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-2.5 text-sm font-medium text-foreground opacity-95",
          className,
        )}
      >
        <Bookmark className="h-4 w-4 fill-primary text-primary" strokeWidth={2.25} />
        {co.bookmarkOnScheduleBlock}
      </button>
    );
  }

  async function toggle(e?: React.MouseEvent | React.FormEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    if (pending) return;
    setPending(true);
    try {
      if (saved) {
        const res = await apiFetch(
          `/api/courses/saved?courseId=${encodeURIComponent(courseId)}`,
          { method: "DELETE" },
        );
        if (!res.ok) return;
        setSaved(false);
        onChange?.(false);
      } else {
        const res = await apiFetch("/api/courses/saved", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseId }),
        });
        if (!res.ok) return;
        setSaved(true);
        onChange?.(true);
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const label = saved ? co.bookmarkSaved : co.bookmarkSave;
  const ariaLabel = saved ? co.bookmarkRemoveAria : co.bookmarkSaveAria;
  const disabled = pending || readOnly;
  const title = readOnly ? messages.offline.onlineRequiredAction : ariaLabel;

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-pressed={saved}
        title={title}
        className={cn(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition disabled:opacity-60",
          saved
            ? "bg-primary/10 text-primary hover:bg-primary/15"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
          className,
        )}
      >
        <Bookmark
          className={cn("h-4 w-4", saved ? "fill-primary" : undefined)}
          strokeWidth={2.25}
        />
      </button>
    );
  }

  if (variant === "chip") {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-pressed={saved}
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-60",
          saved
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-border bg-background text-muted-foreground hover:bg-muted",
          className,
        )}
      >
        <Bookmark
          className={cn("h-3 w-3", saved ? "fill-primary" : undefined)}
          strokeWidth={2.25}
        />
        {label}
      </button>
    );
  }

  // block — used as a standalone CTA on the course detail page
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      aria-pressed={saved}
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium transition disabled:opacity-60",
        saved
          ? "border-primary/40 bg-primary/5 text-foreground"
          : "border-border bg-card text-foreground hover:bg-muted/60",
        className,
      )}
    >
      <Bookmark
        className={cn("h-4 w-4", saved ? "fill-primary text-primary" : undefined)}
        strokeWidth={2.25}
      />
      {saved ? co.bookmarkSavedTapRemove : co.bookmarkSave}
    </button>
  );
}
