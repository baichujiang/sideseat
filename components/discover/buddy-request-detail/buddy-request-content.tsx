import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { BookOpen, CalendarClock, Heart, Link2, type LucideIcon } from "lucide-react";

import { DiscoverPostPostedTime } from "@/components/discover/discover-post-posted-time";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import { VerifiedBadge } from "@/components/ui/verified-badge";
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
import { formatMessage, getMessages } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";
import { ClassmatePostCategory } from "@prisma/client";

type CourseChip = { id: string; code: string | null; name: string };
type VerifiedStatus = ComponentProps<typeof VerifiedBadge>["status"];

type BuddyRequestAuthor = {
  name: string;
  profileHref: Route;
  avatarUrl: string | null;
  school: string | null;
  verifiedStudent: boolean;
  studentVerificationStatus: VerifiedStatus;
  profileAria?: string;
};

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
  interestedCount,
  studyMeta: _studyMeta,
  languageMeta: _languageMeta,
  sportMeta: _sportMeta,
  courses,
  courseLinkBase,
  highlightViewerCourses,
  viewerCourseMatchIndex,
  author,
  planDetails,
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
  interestedCount: number;
  studyMeta?: DiscoverPostRowStudyMeta | null;
  languageMeta?: DiscoverPostRowLanguageMeta | null;
  sportMeta?: DiscoverPostRowSportMeta | null;
  courses: CourseChip[];
  courseLinkBase: "/courses" | null;
  highlightViewerCourses: boolean;
  viewerCourseMatchIndex: ViewerCourseMatchIndex | null;
  author: BuddyRequestAuthor;
  planDetails: ReactNode;
  /** Legacy post photos — rendered after the description when present. */
  media?: ReactNode;
}) {
  const dl = getMessages(locale).discoverList;
  const buddy = getMessages(locale).discoverBuddy;
  const detail = getMessages(locale).discoverBuddyDetail;
  const typeLabel = shouldShowBuddyCategoryLabel(category) ? buddyTypeLabel(category, buddy) : "";
  const statusLabel = buddyRequestStatusLabel(locale, displayStatus);
  const availabilityLine = buddyRequestAvailabilityValue(locale, displayStatus, expiresAt, updatedAt);
  const interestedLine = formatMessage(buddy.buddyInterestedCount, { count: interestedCount });
  const trimmedBody = body?.trim() ?? "";

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          {typeLabel ? (
            <span className="inline-flex rounded-full border border-classmates-blue-border/70 bg-classmates-blue-soft px-2.5 py-0.5 text-[11px] font-medium text-classmates-blue">
              {typeLabel}
            </span>
          ) : null}
          {isAuthor ? (
            <span className="inline-flex rounded-full border border-classmates-blue-border/80 bg-classmates-blue-soft px-2.5 py-0.5 text-[11px] font-semibold text-classmates-blue">
              {detail.yourRequestBadge}
            </span>
          ) : null}
          <span
            className={cn(
              "inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
              displayStatus === "open"
                ? "border-classmates-teal-border/70 bg-classmates-teal-soft text-classmates-teal dark:text-teal-200"
                : "border-border/80 bg-muted font-medium text-muted-foreground",
            )}
          >
            {statusLabel}
          </span>
        </div>
        <h1
          data-testid="buddy-request-title"
          className={cn(
            "text-[22px] font-bold leading-tight text-foreground",
            typeLabel || isAuthor || statusLabel ? "mt-2" : undefined,
          )}
        >
          {title}
        </h1>
      </div>

      <div className="rounded-2xl border border-border/70 bg-card/50 px-4 py-3">
        <p className="text-[11px] font-medium text-muted-foreground">{dl.postSheetDetailsLabel}</p>
        <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground">
          {trimmedBody || detail.notSpecified}
        </p>
      </div>

      {planDetails}

      <section
        className="space-y-2.5 rounded-2xl border border-border/70 bg-card/50 px-4 py-3"
        aria-label={detail.postMetaSectionAria}
      >
        <DetailRow icon={CalendarClock} label={detail.rowAvailability} value={availabilityLine} />
        <DetailRow icon={Heart} label={detail.rowInterested} value={interestedLine} />

        {courses.length > 0 ? (
          <DetailRow
            icon={BookOpen}
            label={dl.postCardLinkedCoursesAria}
            value={
              <CourseChips
                courses={courses}
                courseLinkBase={courseLinkBase}
                highlightViewerCourses={highlightViewerCourses}
                viewerCourseMatchIndex={viewerCourseMatchIndex}
              />
            }
          />
        ) : null}
      </section>

      <section className="rounded-2xl border border-border/70 bg-card/50 px-4 py-3">
        <p className="mb-2 text-[11px] font-medium text-muted-foreground">{buddy.buddyCardAuthorLabel}</p>
        <Link
          href={author.profileHref}
          aria-label={author.profileAria}
          className="flex items-center gap-3 rounded-xl no-underline hover:bg-muted/40"
        >
          <PresetAvatar id={author.avatarUrl} size={48} className="h-12 w-12 shrink-0" />
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="truncate text-[15px] font-semibold text-foreground">{author.name}</p>
              <VerifiedBadge
                size="xs"
                school={author.school}
                verifiedStudent={author.verifiedStudent}
                status={author.studentVerificationStatus}
              />
            </div>
            <DiscoverPostPostedTime at={createdAt} className="mt-0.5 text-[12px] text-muted-foreground" />
          </div>
        </Link>
      </section>

      {media ? <div className="min-w-0 pt-1">{media}</div> : null}
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <div className="text-[14px] text-foreground">{value}</div>
      </div>
    </div>
  );
}

function CourseChips({
  courses,
  courseLinkBase,
  highlightViewerCourses,
  viewerCourseMatchIndex,
}: {
  courses: CourseChip[];
  courseLinkBase: "/courses" | null;
  highlightViewerCourses: boolean;
  viewerCourseMatchIndex: ViewerCourseMatchIndex | null;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 pt-0.5">
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
            {matchesViewer ? <Link2 className="h-3 w-3 shrink-0 opacity-90" aria-hidden /> : null}
            <span className="truncate">{label}</span>
          </>
        );
        if (courseLinkBase) {
          return (
            <Link key={c.id} href={`${courseLinkBase}/${c.id}` as Route} className={chipClass} title={titleAttr}>
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
  );
}
