import Link from "next/link";
import type { Route } from "next";
import type { Weekday } from "@prisma/client";
import { ChevronRight, MapPin, Users } from "lucide-react";

import { SaveBookmarkButton } from "@/components/courses/save-bookmark-button";
import { CourseAvatar } from "@/components/ui/course-avatar";
import { courseCodeBadgeLabel } from "@/lib/courses/course-code-label";
import { formatMessage, type CoursesMessages } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

const WEEKDAY_SHORT_FALLBACK: Record<Weekday, string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};

function weekdayShort(courses: CoursesMessages | undefined, d: Weekday): string {
  return courses?.weekdayShort[d] ?? WEEKDAY_SHORT_FALLBACK[d];
}

function classmatesLine(c: CoursesMessages | undefined, n: number) {
  if (!c) return `${n} ${n === 1 ? "classmate" : "classmates"}`;
  return n === 1 ? c.classmatesCountOne : formatMessage(c.classmatesCountMany, { count: n });
}

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
 * Enrolled course card — `card` = bordered tile; `compact` = inbox-style row in a grouped list.
 */
export function EnrolledCourseCard({
  course,
  sessions,
  memberCount,
  variant = "card",
  courses,
  listReturnTo,
  readOnly = false,
}: {
  course: {
    id: string;
    name: string;
    code: string | null;
    instructorSummary?: string | null;
  };
  sessions: EnrolledSession[];
  memberCount: number;
  variant?: "card" | "compact";
  courses?: CoursesMessages;
  /** Full `/courses?...` path for back navigation from course detail. */
  listReturnTo?: string;
  readOnly?: boolean;
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
  const isCompact = variant === "compact";

  const c = courses;
  const moreSlots =
    sortedSessions.length > 2
      ? c
        ? formatMessage(c.enrolledMoreSlotsCount, { n: sortedSessions.length - 2 })
        : `+${sortedSessions.length - 2} more`
      : null;
  const sessionLine =
    sortedSessions.length === 0
      ? c?.enrolledNoWeeklyTimes ?? "No weekly times on Home"
      : [
          ...sortedSessions.slice(0, 2).map(
            (s) => `${weekdayShort(c, s.weekday)} ${formatHM(s.startMinute)}–${formatHM(s.endMinute)}`,
          ),
          moreSlots,
        ]
          .filter(Boolean)
          .join(" · ");

  const instructorDisplay =
    instructorLabel && c
      ? `${c.instructorPrefix} ${instructorLabel}`
      : instructorLabel
        ? `Instructor: ${instructorLabel}`
        : null;

  const compactMetaParts = [
    sessionLine,
    instructorDisplay,
    location ?? null,
    classmatesLine(c, memberCount),
  ].filter(Boolean);

  const courseHref =
    listReturnTo ?
      (`/courses/${course.id}?returnTo=${encodeURIComponent(listReturnTo)}` as Route)
    : (`/courses/${course.id}` as Route);

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
      <SaveBookmarkButton
        courseId={course.id}
        initialSaved={false}
        enrolled={true}
        variant="icon"
        className={cn(
          "absolute right-2 z-10",
          isCompact ? "top-1/2 -translate-y-1/2" : "top-2 sm:right-2.5 sm:top-2.5",
        )}
        readOnly={readOnly}
      />
      <Link
        href={courseHref}
        className={cn(
          "group flex transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/25 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-card",
          isCompact
            ? cn(
                "items-center gap-3 px-3 py-2.5 pr-10",
                "active:bg-muted/40 [@media(hover:hover)]:hover:bg-muted/25",
              )
            : cn(
                "items-center gap-2.5 px-3.5 py-3 pr-10 sm:gap-3 sm:px-4 sm:py-3.5 sm:pr-11",
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
              <p className="mt-1 text-[12px] text-[#5F6B7A] dark:text-muted-foreground sm:text-[13px]">
                {c ? `${c.instructorPrefix} ${instructorLabel}` : `Instructor: ${instructorLabel}`}
              </p>
            ) : null}

            {sortedSessions.length > 0 ? (
              <ul className="mt-1 space-y-0.5 text-[12px] leading-5 text-[#5F6B7A] dark:text-muted-foreground sm:text-[13px] sm:leading-[1.3rem]">
                {sortedSessions.slice(0, 2).map((s, i) => (
                  <li key={`${s.weekday}-${s.startMinute}-${i}`} className="tabular-nums">
                    <span className="inline-block w-8 font-medium text-[#111827]/88 dark:text-foreground/88 sm:w-9">
                      {weekdayShort(c, s.weekday)}
                    </span>
                    <span>
                      {formatHM(s.startMinute)}–{formatHM(s.endMinute)}
                    </span>
                  </li>
                ))}
                {sortedSessions.length > 2 ? (
                  <li className="text-[11px] text-[#8A94A6] dark:text-muted-foreground/90">
                    {c
                      ? formatMessage(c.enrolledMoreSlotsCount, { n: sortedSessions.length - 2 })
                      : `+${sortedSessions.length - 2} more`}
                  </li>
                ) : null}
              </ul>
            ) : (
              <p className="mt-1 text-[12px] leading-5 text-[#5F6B7A] dark:text-muted-foreground sm:text-[13px]">
                {c?.enrolledNoWeeklyTimesCard ?? "No weekly times on Home · Open this course to add them"}
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
              {classmatesLine(c, memberCount)}
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
