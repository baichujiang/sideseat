import type { ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ClassmatePostCategory } from "@prisma/client";
import { CalendarClock, Link2 } from "lucide-react";

import { DiscoverPostPostedTime } from "@/components/discover/discover-post-posted-time";
import { buddyTypeLabel, shouldShowBuddyCategoryLabel } from "@/lib/discover/buddy-type-labels";
import type { BuddyRequestDisplayStatus } from "@/lib/discover/buddy-request-status";
import {
  buddyRequestAvailabilityValue,
  buddyRequestStatusLabel,
} from "@/lib/discover/buddy-request-detail-meta";
import {
  courseMatchesViewer,
  type ViewerCourseMatchIndex,
} from "@/lib/discover/viewer-course-match";
import type {
  DiscoverPostRowLanguageMeta,
  DiscoverPostRowSportMeta,
  DiscoverPostRowStudyMeta,
} from "@/lib/discover/discover-post-row";
import type { AppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

type CourseChip = { id: string; code: string | null; name: string };

export function BuddyRequestContent({
  locale,
  category,
  displayStatus,
  title,
  body,
  createdAt,
  expiresAt,
  updatedAt,
  isAuthor,
  studyMeta,
  languageMeta,
  sportMeta,
  courses,
  courseLinkBase,
  highlightViewerCourses,
  viewerCourseMatchIndex,
  media,
}: {
  locale: AppLocale;
  category: ClassmatePostCategory;
  displayStatus: BuddyRequestDisplayStatus;
  title: string;
  body: string | null;
  createdAt: Date;
  expiresAt: Date;
  updatedAt: Date;
  isAuthor: boolean;
  studyMeta?: DiscoverPostRowStudyMeta | null;
  languageMeta?: DiscoverPostRowLanguageMeta | null;
  sportMeta?: DiscoverPostRowSportMeta | null;
  courses: CourseChip[];
  courseLinkBase: "/courses" | null;
  highlightViewerCourses: boolean;
  viewerCourseMatchIndex: ViewerCourseMatchIndex | null;
  /** Rendered between the headline and the metadata group (e.g. image carousel). */
  media?: ReactNode;
}) {
  const dl = getMessages(locale).discoverList;
  const buddy = getMessages(locale).discoverBuddy;
  const detail = getMessages(locale).discoverBuddyDetail;
  const typeLabel = shouldShowBuddyCategoryLabel(category) ? buddyTypeLabel(category, buddy) : "";
  const statusLabel = buddyRequestStatusLabel(locale, displayStatus);
  const availabilityLine = buddyRequestAvailabilityValue(locale, displayStatus, expiresAt, updatedAt);

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <h1
          data-testid="buddy-request-title"
          className="text-xl font-bold leading-snug tracking-tight text-foreground sm:text-2xl"
        >
          {title}
        </h1>
        {body ? (
          <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground/90">{body}</p>
        ) : null}
      </header>

      {media ? <div className="min-w-0">{media}</div> : null}

      <section
        className="space-y-3.5 rounded-2xl border border-border/70 bg-muted/20 px-3 py-3.5 sm:px-4"
        aria-label={detail.postMetaSectionAria}
      >
        <div className="flex flex-wrap items-center gap-2">
          {typeLabel ? (
            <span className="rounded-full border border-classmates-teal-border/60 bg-classmates-teal-soft px-2.5 py-1 text-[11px] font-semibold text-classmates-teal">
              {typeLabel}
            </span>
          ) : null}
          {isAuthor ? (
            <span className="rounded-full border border-classmates-blue-border/80 bg-classmates-blue-soft px-2.5 py-1 text-[11px] font-semibold text-classmates-blue">
              {detail.yourRequestBadge}
            </span>
          ) : null}
          <span
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
              displayStatus === "open"
                ? "border-classmates-teal-border/70 bg-classmates-teal-soft text-classmates-teal dark:text-teal-200"
                : "border-border/80 bg-muted font-medium text-muted-foreground",
            )}
          >
            {statusLabel}
          </span>
        </div>

        <p className="flex items-start gap-2 text-[13px] leading-snug text-muted-foreground">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 opacity-80" strokeWidth={2} aria-hidden />
          <span>{availabilityLine}</span>
        </p>

        {courses.length > 0 ? (
          <div className="flex flex-wrap gap-1.5" aria-label={dl.postCardLinkedCoursesAria}>
            {courses.map((c) => {
              const label = c.code ?? c.name;
              const matchesViewer =
                highlightViewerCourses &&
                viewerCourseMatchIndex != null &&
                courseMatchesViewer(c, viewerCourseMatchIndex);
              const titleAttr = matchesViewer
                ? `${c.name} — same course as yours (code or enrollment)`
                : c.name;
              const chipClass = cn(
                "inline-flex max-w-[min(100%,14rem)] items-center gap-1 truncate rounded-full px-2 py-0.5 text-[10px] tabular-nums transition-colors",
                matchesViewer
                  ? "border-2 border-dashed border-classmates-teal-border bg-classmates-teal-soft/70 font-semibold text-classmates-teal dark:border-teal-500/55 dark:bg-teal-950/35 dark:text-teal-200"
                  : "border border-classmates-blue-border/60 bg-classmates-blue-soft/50 font-medium text-classmates-blue hover:bg-classmates-blue-soft dark:border-blue-500/35 dark:bg-blue-950/35 dark:text-blue-200",
              );
              const chipBody = (
                <>
                  {matchesViewer ? (
                    <Link2 className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
                  ) : null}
                  <span className="truncate">{label}</span>
                </>
              );
              if (courseLinkBase) {
                return (
                  <Link
                    key={c.id}
                    href={`${courseLinkBase}/${c.id}` as Route}
                    className={chipClass}
                    title={titleAttr}
                  >
                    {chipBody}
                  </Link>
                );
              }
              return (
                <span key={c.id} className={cn(chipClass, "cursor-default")} title={titleAttr}>
                  {chipBody}
                </span>
              );
            })}
          </div>
        ) : null}

        <DiscoverPostPostedTime at={createdAt} className="text-[12px] text-muted-foreground" />
      </section>
    </div>
  );
}
