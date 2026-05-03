import Link from "next/link";
import type { Route } from "next";
import { MapPin } from "lucide-react";

/**
 * Focal "right now" card. Renders only when a course block is in progress or
 * the next one is imminent (within an hour). If neither holds, the host page
 * skips this entirely — silence is a valid state.
 *
 * Visual treatment uses the app's primary color (not rose) so it harmonizes
 * with the rest of the design instead of looking like an alert. The pulsing
 * dot carries the "live" affordance without color panic.
 */
export function HomeNowCard({
  courseId,
  courseName,
  courseCode,
  location,
  until,
  variant,
}: {
  courseId: string;
  courseName: string;
  courseCode: string | null;
  location: string | null;
  /** HH:MM formatted end time (ongoing) or start time (imminent). */
  until: string;
  /** `ongoing` = happening now; `imminent` = starts in < 1 hour. */
  variant: "ongoing" | "imminent";
}) {
  const eyebrow = variant === "ongoing" ? "Happening now" : "Starting soon";
  const whenLabel = variant === "ongoing" ? `Until ${until}` : `Starts ${until}`;

  return (
    <Link
      href={`/courses/${courseId}`}
      className="group block rounded-2xl border border-primary/25 bg-primary/[0.06] px-3.5 py-3 transition hover:border-primary/40 hover:bg-primary/[0.08]"
    >
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          {variant === "ongoing" ? (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60 opacity-70" />
          ) : null}
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-primary">
          {eyebrow}
        </span>
      </div>

      <p className="mt-1 truncate text-[15px] font-semibold leading-snug">
        {courseCode ? <span className="text-primary">{courseCode}</span> : null}
        {courseCode ? " · " : ""}
        <span>{courseName}</span>
      </p>

      <p className="mt-0.5 flex items-center gap-2 text-[12px] text-muted-foreground">
        <span>{whenLabel}</span>
        {location ? (
          <>
            <span aria-hidden>·</span>
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0" strokeWidth={2.25} />
              <span className="truncate">{location}</span>
            </span>
          </>
        ) : null}
      </p>
    </Link>
  );
}
