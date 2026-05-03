"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { Users, X } from "lucide-react";

import { QuickEnrollButton } from "@/components/courses/quick-enroll-button";

export type SavedRow = {
  savedId: string;
  courseId: string;
  code: string | null;
  name: string;
  memberCount: number;
};

/**
 * Saved section of /courses. Compact rows, each row has:
 *   - code + name + enrolled count   (tapping opens the course detail page)
 *   - [Enroll]  → one-tap enrollment via `QuickEnrollButton`. The user lands
 *                 on this row having already said "I'm considering it", so
 *                 the act of enrolling shouldn't force them through a
 *                 full-page form just to pick a default intention. The row
 *                 disappears (moves to Enrolled) on success; the user can
 *                 add weekly times later from the course detail page.
 *   - [Remove]  → optimistic unsave
 *
 * The old in-panel search input has been lifted to the page-level
 * `CourseSearchSurface`; a secondary search inside this panel would have
 * been redundant with the primary one at the top.
 */
export function SavedCoursesPanel({
  initialSaved,
}: {
  initialSaved: SavedRow[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<SavedRow[]>(initialSaved);

  useEffect(() => {
    setRows(initialSaved);
  }, [initialSaved]);

  async function unsave(row: SavedRow) {
    // Optimistic — the DELETE is cheap and rarely fails; if it does, we
    // surface a quiet refresh via router so the real state reasserts.
    setRows((prev) => prev.filter((r) => r.courseId !== row.courseId));
    try {
      const res = await fetch(
        `/api/courses/saved?courseId=${encodeURIComponent(row.courseId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        router.refresh();
        return;
      }
      router.refresh();
    } catch {
      router.refresh();
    }
  }

  const hasRows = rows.length > 0;

  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Saved
        </h2>
        <p className="text-[11px] text-muted-foreground/80">
          {hasRows
            ? `${rows.length} ${rows.length === 1 ? "course" : "courses"}`
            : "Bookmark courses you're considering"}
        </p>
      </div>

      {hasRows ? (
        <ul className="divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/60 bg-card">
          {rows.map((row) => (
            <li
              key={row.savedId}
              className="flex items-center gap-2 px-3 py-2.5"
            >
              <Link
                href={`/courses/${row.courseId}?returnTo=%2Fcourses` as Route}
                className="min-w-0 flex-1"
              >
                <p className="truncate text-[14px] font-semibold leading-tight">
                  {row.code ? (
                    <span className="mr-1.5 text-primary">{row.code}</span>
                  ) : null}
                  <span className="text-foreground">{row.name}</span>
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-[11.5px] text-muted-foreground">
                  <Users className="h-3 w-3" strokeWidth={2.25} />
                  <span>
                    {row.memberCount}{" "}
                    {row.memberCount === 1 ? "classmate" : "classmates"} enrolled
                  </span>
                </p>
              </Link>

              <QuickEnrollButton courseId={row.courseId} />

              <button
                type="button"
                onClick={() => void unsave(row)}
                aria-label={`Remove ${row.code ?? row.name}`}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.25} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-5 text-center text-[12px] text-muted-foreground">
          Courses you bookmark from search will show up here.
        </div>
      )}
    </section>
  );
}
