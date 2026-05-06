import Link from "next/link";
import type { Route } from "next";
import type { Weekday } from "@prisma/client";
import { ChevronRight, MapPin, Users } from "lucide-react";

import { SaveBookmarkButton } from "@/components/courses/save-bookmark-button";
import { courseCodeBadgeLabel } from "@/lib/courses/course-code-label";
import { cn } from "@/lib/utils";

const WEEKDAY_SHORT: Record<Weekday, string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};

function formatHM(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
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

export type EnrolledSession = {
  weekday: Weekday;
  startMinute: number;
  endMinute: number;
  location: string | null;
};

/**
 * Enrolled course card — tile + code + title + sessions + classmates; tertiary share row.
 */
export function EnrolledCourseCard({
  course,
  sessions,
  memberCount,
}: {
  course: {
    id: string;
    name: string;
    code: string | null;
    instructorSummary?: string | null;
  };
  sessions: EnrolledSession[];
  memberCount: number;
}) {
  const sortedSessions = [...sessions].sort((a, b) => {
    const weekdayOrder: Weekday[] = [
      "MON",
      "TUE",
      "WED",
      "THU",
      "FRI",
      "SAT",
      "SUN",
    ];
    const da = weekdayOrder.indexOf(a.weekday);
    const db = weekdayOrder.indexOf(b.weekday);
    if (da !== db) return da - db;
    return a.startMinute - b.startMinute;
  });

  const location = sortedSessions.find((s) => s.location)?.location ?? null;
  const codeLabel = courseCodeBadgeLabel(course.name, course.code);
  const instructorLabel = course.instructorSummary?.trim() || extractInstructorHint(course.name);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[1.25rem] border border-[#E7E0D6] bg-white transition",
        "shadow-[0_4px_14px_rgba(15,23,42,0.045)] hover:border-[#D8D1C7] hover:shadow-[0_6px_18px_rgba(15,23,42,0.07)]",
        "dark:border-border dark:bg-card",
      )}
    >
      <SaveBookmarkButton
        courseId={course.id}
        initialSaved={false}
        enrolled={true}
        variant="icon"
        className="absolute right-2 top-2 z-10 sm:right-2.5 sm:top-2.5"
      />
      <Link
        href={`/courses/${course.id}` as Route}
        className={cn(
          "group flex items-center gap-2.5 px-3.5 py-3 pr-10 sm:gap-3 sm:px-4 sm:py-3.5 sm:pr-11",
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
          <p className="mt-1 text-[12px] text-[#5F6B7A] dark:text-muted-foreground sm:text-[13px]">
            Instructor: {instructorLabel}
          </p>
        ) : null}

        {sortedSessions.length > 0 ? (
          <ul className="mt-1 space-y-0.5 text-[12px] leading-5 text-[#5F6B7A] dark:text-muted-foreground sm:text-[13px] sm:leading-[1.3rem]">
            {sortedSessions.slice(0, 2).map((s, i) => (
              <li key={`${s.weekday}-${s.startMinute}-${i}`} className="tabular-nums">
                <span className="inline-block w-8 font-medium text-[#111827]/88 dark:text-foreground/88 sm:w-9">
                  {WEEKDAY_SHORT[s.weekday]}
                </span>
                <span>
                  {formatHM(s.startMinute)}–{formatHM(s.endMinute)}
                </span>
              </li>
            ))}
            {sortedSessions.length > 2 ? (
              <li className="text-[11px] text-[#8A94A6] dark:text-muted-foreground/90">
                +{sortedSessions.length - 2} more
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="mt-1 text-[12px] leading-5 text-[#5F6B7A] dark:text-muted-foreground sm:text-[13px]">
            No sessions yet · Add class time
          </p>
        )}

        {location ? (
          <p className="mt-1 flex min-w-0 items-center gap-1 text-[12px] leading-5 text-[#5F6B7A] dark:text-muted-foreground sm:text-[13px]">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-[#8A94A6]" strokeWidth={2.25} aria-hidden />
            <span className="truncate">{location}</span>
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
