import Link from "next/link";
import type { Route } from "next";
import type { Weekday } from "@prisma/client";
import { ChevronRight, MapPin, Users } from "lucide-react";

import { CourseAvatar } from "@/components/ui/course-avatar";

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

export type EnrolledSession = {
  weekday: Weekday;
  startMinute: number;
  endMinute: number;
  location: string | null;
};

/**
 * Primary card for courses the viewer is enrolled in. Dedicated (not shared
 * with saved courses) because the two have different information density:
 * enrolled has schedule, location, intentions; saved has neither.
 *
 * Layout:
 *   ┌─────────────────────────────────┐
 *   │ [AV]  IN2064  Machine Learning  │
 *   │       Mon 14:00–16:00           │
 *   │       Tue 10:00–12:00           │
 *   │       MI HS 1 · 42 classmates → │
 *   └─────────────────────────────────┘
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

  return (
    <Link
      href={`/courses/${course.id}` as Route}
      className="group flex items-stretch gap-3 rounded-2xl border border-border/60 bg-card px-3 py-3 transition hover:border-border hover:bg-muted/30"
    >
      <CourseAvatar
        id={course.id}
        code={course.code}
        name={course.name}
        size={44}
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold leading-tight">
          {course.code ? (
            <span className="mr-1.5 text-primary">{course.code}</span>
          ) : null}
          <span className="text-foreground">{course.name}</span>
        </p>

        {sortedSessions.length > 0 ? (
          <ul className="mt-1 space-y-0.5">
            {sortedSessions.slice(0, 2).map((s, i) => (
              <li
                key={`${s.weekday}-${s.startMinute}-${i}`}
                className="text-[12px] text-muted-foreground"
              >
                <span className="inline-block w-8 text-foreground/70">
                  {WEEKDAY_SHORT[s.weekday]}
                </span>
                <span className="tabular-nums">
                  {formatHM(s.startMinute)}–{formatHM(s.endMinute)}
                </span>
              </li>
            ))}
            {sortedSessions.length > 2 ? (
              <li className="text-[11px] text-muted-foreground/80">
                +{sortedSessions.length - 2} more
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="mt-1 text-[12px] text-muted-foreground">
            No sessions yet — tap to edit.
          </p>
        )}

        <div className="mt-1.5 flex items-center gap-3 text-[11.5px] text-muted-foreground">
          {location ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0" strokeWidth={2.25} />
              <span className="truncate">{location}</span>
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <Users className="h-3 w-3" strokeWidth={2.25} />
            <span>
              {memberCount}{" "}
              {memberCount === 1 ? "classmate" : "classmates"}
            </span>
          </span>
        </div>
      </div>

      <ChevronRight
        className="h-4 w-4 self-center text-muted-foreground/60 transition group-hover:text-muted-foreground"
        strokeWidth={2.25}
      />
    </Link>
  );
}
