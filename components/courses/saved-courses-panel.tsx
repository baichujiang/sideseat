"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { Bookmark, Users, X } from "lucide-react";

import { QuickEnrollButton } from "@/components/courses/quick-enroll-button";
import { inboxChatListUlClassName } from "@/components/inbox/inbox-conversation-tile";
import { cn } from "@/lib/utils";

export type SavedRow = {
  savedId: string;
  courseId: string;
  code: string | null;
  name: string;
  memberCount: number;
};

function catalogSearchHref(school?: string): Route {
  if (!school) return "/courses#course-catalog-search" as Route;
  return `/courses?school=${encodeURIComponent(school)}#course-catalog-search` as Route;
}

/**
 * Saved courses — compact list when populated; guided empty state when not.
 */
export function SavedCoursesPanel({
  initialSaved,
  school,
}: {
  initialSaved: SavedRow[];
  /** Keeps “Search courses” deep-link on the same school tab. */
  school?: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<SavedRow[]>(initialSaved);

  useEffect(() => {
    setRows(initialSaved);
  }, [initialSaved]);

  async function unsave(row: SavedRow) {
    setRows((prev) => prev.filter((r) => r.courseId !== row.courseId));
    try {
      const res = await apiFetch(
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
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-3 px-0.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5F6B7A] dark:text-muted-foreground">
          Saved
        </h2>
        <span className="text-[13px] tabular-nums text-[#8A94A6] dark:text-muted-foreground">
          {hasRows ? `${rows.length} ${rows.length === 1 ? "course" : "courses"}` : "Saved"}
        </span>
      </div>

      {hasRows ? (
        <ul className={inboxChatListUlClassName}>
          {rows.map((row) => (
            <li key={row.savedId} className="list-none">
              <div className="flex items-center gap-3 px-3 py-2.5 transition-colors active:bg-muted/40 [@media(hover:hover)]:hover:bg-muted/25">
              <Link
                href={`/courses/${row.courseId}?returnTo=%2Fcourses` as Route}
                className="min-w-0 flex-1"
              >
                <p className="truncate text-[15px] font-semibold leading-snug tracking-tight text-[#111827] dark:text-foreground">
                  {row.code ? (
                    <span className="mr-1.5 font-semibold text-[#2563EB] dark:text-blue-400">{row.code}</span>
                  ) : null}
                  <span>{row.name}</span>
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-[13px] leading-snug text-[#5F6B7A] dark:text-zinc-400">
                  <Users className="h-3.5 w-3.5 shrink-0 opacity-90" strokeWidth={2.25} aria-hidden />
                  <span>
                    {row.memberCount} {row.memberCount === 1 ? "classmate" : "classmates"} enrolled
                  </span>
                </p>
              </Link>

              <QuickEnrollButton courseId={row.courseId} />

              <button
                type="button"
                onClick={() => void unsave(row)}
                aria-label={`Remove ${row.code ?? row.name}`}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#8A94A6] transition hover:bg-[#F3F0EA] hover:text-[#111827] dark:hover:bg-muted"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.25} />
              </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div
          className={cn(
            "flex flex-col gap-3 rounded-[1.25rem] border border-dashed border-[#D8D1C7]/90 bg-[#FCFBF8] px-4 py-3.5",
            "sm:flex-row sm:items-center sm:justify-between sm:gap-4",
            "dark:border-border dark:bg-muted/15",
          )}
        >
          <div className="flex min-w-0 items-start gap-2.5 text-left">
            <Bookmark
              className="mt-0.5 h-4 w-4 shrink-0 text-[#A1A9B5] dark:text-muted-foreground"
              strokeWidth={2}
              aria-hidden
            />
            <div className="min-w-0">
              <p className="text-[14px] font-semibold leading-snug text-[#111827] dark:text-foreground">
                No saved courses yet
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-[#5F6B7A] dark:text-muted-foreground">
                Bookmarks from search show here.
              </p>
            </div>
          </div>
          <Link
            href={catalogSearchHref(school)}
            className={cn(
              "inline-flex shrink-0 self-start rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-2 text-[13px] font-semibold text-[#2563EB] transition sm:self-center",
              "hover:bg-[#DBEAFE] dark:border-blue-500/40 dark:bg-blue-950/35 dark:text-blue-300 dark:hover:bg-blue-950/50",
            )}
          >
            Search courses
          </Link>
        </div>
      )}
    </section>
  );
}
