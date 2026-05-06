import type { Route } from "next";
import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";

import { SaveBookmarkButton } from "@/components/courses/save-bookmark-button";
import { cn } from "@/lib/utils";

function extractStudentCodes(name: string, rawCode: string | null): string[] {
  const source = `${rawCode ?? ""} ${name}`.toUpperCase();
  const matches = source.match(/\bIN[\s-]?(\d{4})\b/g) ?? [];
  const normalized = matches.map((token) => `IN${token.replace(/[^0-9]/g, "").slice(-4)}`);
  return [...new Set(normalized)];
}

function extractInstructorHint(name: string): string | null {
  const match = name.match(/\(([^()]+)\)\s*$/);
  if (!match) return null;

  const candidates = match[1]!
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => /^[A-Z][a-zA-Z.-]+(?:\s+[A-Z][a-zA-Z.-]+)*$/.test(part));

  if (candidates.length === 0) return null;
  return candidates.slice(0, 2).join(", ");
}

export function PopularCourseCard({
  course,
  memberCount,
  viewer,
}: {
  course: {
    id: string;
    name: string;
    code: string | null;
    instructorSummary?: string | null;
  };
  memberCount: number;
  /** When set (signed-in Popular list), bookmark is shown on the card. */
  viewer?: { saved: boolean; enrolled: boolean } | null;
}) {
  const studentCodes = extractStudentCodes(course.name, course.code);
  const codeLabel = studentCodes.join(" · ");
  const instructorLabel = course.instructorSummary?.trim() || extractInstructorHint(course.name);
  const bookmark = viewer ?? null;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[1.25rem] border border-[#E7E0D6] bg-white transition",
        "shadow-[0_4px_14px_rgba(15,23,42,0.045)] hover:border-[#D8D1C7] hover:shadow-[0_6px_18px_rgba(15,23,42,0.07)]",
        "dark:border-border dark:bg-card",
      )}
    >
      {bookmark ? (
        <SaveBookmarkButton
          courseId={course.id}
          initialSaved={bookmark.saved}
          enrolled={bookmark.enrolled}
          variant="icon"
          className="absolute right-2 top-2 z-10 sm:right-2.5 sm:top-2.5"
        />
      ) : null}
      <Link
        href={`/courses/${course.id}?returnTo=%2Fcourses` as Route}
        className={cn(
          "group flex items-center gap-2.5 px-3.5 py-3 sm:gap-3 sm:px-4 sm:py-3.5",
          bookmark && "pr-10 sm:pr-11",
          "transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/25 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-card",
        )}
      >
        <div className="min-w-0 flex-1">
          {codeLabel ? (
            <span
              className={cn(
                "inline-flex rounded-full bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-semibold tracking-wide text-[#2563EB]",
                "dark:bg-blue-950/40 dark:text-blue-300",
              )}
            >
              {codeLabel}
            </span>
          ) : null}

          <h3
            className={cn(
              "line-clamp-2 text-[15px] font-semibold leading-[1.3] tracking-tight text-[#111827] dark:text-foreground sm:text-[16px]",
              codeLabel ? "mt-1" : "mt-0",
            )}
          >
            {course.name}
          </h3>

          {instructorLabel ? (
            <p className="mt-1 text-[12px] text-[#5F6B7A] dark:text-muted-foreground">
              Instructor: {instructorLabel}
            </p>
          ) : null}

          <span
            className={cn(
              "mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-[#F0FDFA] px-2 py-0.5 text-[11px] font-semibold text-[#0F766E]",
              "dark:bg-teal-950/35 dark:text-teal-200",
            )}
          >
            <Users className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
            {memberCount} {memberCount === 1 ? "classmate" : "classmates"}
          </span>
        </div>

        <ChevronRight
          className="h-[1.125rem] w-[1.125rem] shrink-0 text-[#A1A9B5] transition group-hover:translate-x-0.5 group-hover:text-[#5F6B7A] sm:h-5 sm:w-5 dark:text-muted-foreground/70"
          strokeWidth={2.25}
          aria-hidden
        />
      </Link>
    </div>
  );
}
