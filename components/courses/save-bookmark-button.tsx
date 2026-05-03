"use client";

import { Bookmark } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSaved);
  const [pending, setPending] = useState(false);

  // Keep in sync if parent reruns with a different initial (e.g. after a
  // router.refresh() against a new course in the same list).
  useEffect(() => {
    setSaved(initialSaved);
  }, [initialSaved, courseId]);

  if (enrolled) return null;

  async function toggle(e?: React.MouseEvent | React.FormEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    if (pending) return;
    setPending(true);
    try {
      if (saved) {
        const res = await fetch(
          `/api/courses/saved?courseId=${encodeURIComponent(courseId)}`,
          { method: "DELETE" },
        );
        if (!res.ok) return;
        setSaved(false);
        onChange?.(false);
      } else {
        const res = await fetch("/api/courses/saved", {
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

  const label = saved ? "Saved" : "Save";
  const ariaLabel = saved ? "Remove from saved" : "Save for later";

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-label={ariaLabel}
        aria-pressed={saved}
        title={ariaLabel}
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
        disabled={pending}
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
      disabled={pending}
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
      {saved ? "Saved — tap to remove" : "Save for later"}
    </button>
  );
}
