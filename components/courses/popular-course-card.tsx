import type { Route } from "next";
import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";

import { SaveBookmarkButton } from "@/components/courses/save-bookmark-button";
import { CourseAvatar } from "@/components/ui/course-avatar";
import { courseCodeBadgeLabel } from "@/lib/courses/course-code-label";
import { formatMessage, type CoursesMessages } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

function classmatesLine(c: CoursesMessages, n: number) {
  return n === 1 ? c.classmatesCountOne : formatMessage(c.classmatesCountMany, { count: n });
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
  variant = "card",
  courses,
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
  variant?: "card" | "compact";
  /** When omitted, English-only fallbacks are used (e.g. discover embeds). */
  courses?: CoursesMessages;
}) {
  const codeLabel = courseCodeBadgeLabel(course.name, course.code);
  const instructorLabel = course.instructorSummary?.trim() || extractInstructorHint(course.name);
  const bookmark = viewer ?? null;
  const isCompact = variant === "compact";
  const c = courses;
  const instructorDisplay =
    instructorLabel && c ? `${c.instructorPrefix} ${instructorLabel}` : instructorLabel ? `Instructor: ${instructorLabel}` : null;
  const classmateLine = c ? classmatesLine(c, memberCount) : `${memberCount} ${memberCount === 1 ? "classmate" : "classmates"}`;

  const compactMetaParts = [instructorDisplay, classmateLine].filter(Boolean);

  return (
    <div
      className={cn(
        "relative",
        isCompact
          ? null
          : cn(
              "overflow-hidden rounded-[1.25rem] border border-[#E7E0D6] bg-white transition",
              "shadow-[0_4px_14px_rgba(15,23,42,0.045)] hover:border-[#D8D1C7] hover:shadow-[0_6px_18px_rgba(15,23,42,0.07)]",
              "dark:border-border dark:bg-card",
            ),
      )}
    >
      {bookmark ? (
        <SaveBookmarkButton
          courseId={course.id}
          initialSaved={bookmark.saved}
          enrolled={bookmark.enrolled}
          variant="icon"
          className={cn(
            "absolute right-2 z-10",
            isCompact ? "top-1/2 -translate-y-1/2" : "top-2 sm:right-2.5 sm:top-2.5",
          )}
        />
      ) : null}
      <Link
        href={`/courses/${course.id}?returnTo=%2Fcourses` as Route}
        className={cn(
          "group flex transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/25 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-card",
          isCompact
            ? cn(
                "items-center gap-3 px-3 py-2.5",
                bookmark && "pr-10",
                "active:bg-muted/40 [@media(hover:hover)]:hover:bg-muted/25",
              )
            : cn(
                "items-center gap-2.5 px-3.5 py-3 sm:gap-3 sm:px-4 sm:py-3.5",
                bookmark && "pr-10 sm:pr-11",
              ),
        )}
      >
        {isCompact ? (
          <CourseAvatar id={course.id} code={course.code} name={course.name} size={44} className="shrink-0" />
        ) : null}
        <div className="min-w-0 flex-1">
          {isCompact ? (
            <>
              <div className="flex min-w-0 items-center gap-2">
                {codeLabel ? (
                  <span
                    className={cn(
                      "inline-flex max-w-[5.5rem] shrink-0 truncate rounded-full bg-[#EFF6FF] px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[#2563EB]",
                      "dark:bg-blue-950/40 dark:text-blue-300",
                    )}
                  >
                    {codeLabel}
                  </span>
                ) : null}
                <h3 className="min-w-0 truncate text-[15px] font-semibold leading-tight tracking-tight text-[#111827] dark:text-foreground">
                  {course.name}
                </h3>
              </div>
              <p className="mt-0.5 truncate text-[13px] leading-snug text-[#5F6B7A] dark:text-zinc-400">
                {compactMetaParts.join(" · ")}
              </p>
            </>
          ) : (
            <>
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
                  {c ? `${c.instructorPrefix} ${instructorLabel}` : `Instructor: ${instructorLabel}`}
                </p>
              ) : null}

              <span
                className={cn(
                  "mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-[#F0FDFA] px-2 py-0.5 text-[11px] font-semibold text-[#0F766E]",
                  "dark:bg-teal-950/35 dark:text-teal-200",
                )}
              >
                <Users className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
                {classmateLine}
              </span>
            </>
          )}
        </div>

        <ChevronRight
          className={cn(
            "shrink-0 text-[#A1A9B5] transition group-hover:translate-x-0.5 group-hover:text-[#5F6B7A] dark:text-muted-foreground/70",
            isCompact ? "h-4 w-4" : "h-[1.125rem] w-[1.125rem] sm:h-5 sm:w-5",
          )}
          strokeWidth={2.25}
          aria-hidden
        />
      </Link>
    </div>
  );
}
