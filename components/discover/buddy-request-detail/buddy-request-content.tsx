import Link from "next/link";
import type { Route } from "next";
import { ClassmatePostCategory } from "@prisma/client";
import { Link2 } from "lucide-react";

import { DiscoverPostPostedTime } from "@/components/discover/discover-post-posted-time";
import { buddyTypeLabel } from "@/lib/discover/buddy-type-labels";
import type { BuddyRequestDisplayStatus } from "@/lib/discover/buddy-request-status";
import { buddyRequestStatusLabel } from "@/lib/discover/buddy-request-detail-meta";
import {
  courseMatchesViewer,
  type ViewerCourseMatchIndex,
} from "@/lib/discover/viewer-course-match";
import {
  languageProficiencyLabel,
  languageTagLabel,
  sportTagLabel,
  studyPurposeLabel,
  studyTimeSlotLabel,
} from "@/lib/discover/study-meta-labels";
import type {
  DiscoverPostRowLanguageMeta,
  DiscoverPostRowMealsMeta,
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
  isAuthor,
  studyMeta,
  languageMeta,
  sportMeta,
  courses,
  courseLinkBase,
  highlightViewerCourses,
  viewerCourseMatchIndex,
}: {
  locale: AppLocale;
  category: ClassmatePostCategory;
  displayStatus: BuddyRequestDisplayStatus;
  title: string;
  body: string | null;
  createdAt: Date;
  isAuthor: boolean;
  studyMeta?: DiscoverPostRowStudyMeta | null;
  languageMeta?: DiscoverPostRowLanguageMeta | null;
  sportMeta?: DiscoverPostRowSportMeta | null;
  courses: CourseChip[];
  courseLinkBase: "/courses" | null;
  highlightViewerCourses: boolean;
  viewerCourseMatchIndex: ViewerCourseMatchIndex | null;
}) {
  const dl = getMessages(locale).discoverList;
  const buddy = getMessages(locale).discoverBuddy;
  const detail = getMessages(locale).discoverBuddyDetail;
  const typeLabel = buddyTypeLabel(category, buddy);
  const statusLabel = buddyRequestStatusLabel(locale, displayStatus);

  const showStudyPurposeTimeSection =
    studyMeta && (studyMeta.purposes.length > 0 || studyMeta.timeSlots.length > 0);

  return (
    <div className="space-y-4 px-3 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-classmates-teal-border/60 bg-classmates-teal-soft px-2.5 py-1 text-[11px] font-semibold text-classmates-teal">
          {typeLabel}
        </span>
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
              : "border-border/80 bg-muted px-2.5 py-1 font-medium text-muted-foreground",
          )}
        >
          {statusLabel}
        </span>
      </div>

      <div>
        <h1
          data-testid="buddy-request-title"
          className="text-xl font-bold leading-snug tracking-tight text-foreground sm:text-2xl"
        >
          {title}
        </h1>
        {body ? (
          <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground/90">{body}</p>
        ) : null}
      </div>

      {showStudyPurposeTimeSection ? (
        <div className="space-y-2.5" aria-label={dl.postCardStudyMetaAria}>
          {studyMeta!.purposes.length > 0 ? (
            <div>
              <p className="mb-1 text-[10px] font-medium leading-snug text-muted-foreground">
                {dl.postCardStudyPurposesLabel}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {studyMeta!.purposes.map((p) => (
                  <span
                    key={p}
                    className="inline-flex max-w-full truncate rounded-full border border-sky-200/85 bg-sky-50/90 px-2 py-0.5 text-[10px] font-medium text-sky-950 dark:border-sky-500/35 dark:bg-sky-950/40 dark:text-sky-100"
                  >
                    {studyPurposeLabel(p, dl)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {studyMeta!.timeSlots.length > 0 ? (
            <div>
              <p className="mb-1 text-[10px] font-medium leading-snug text-muted-foreground">
                {dl.postCardStudyTimeLabel}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {studyMeta!.timeSlots.map((t) => (
                  <span
                    key={t}
                    className="inline-flex max-w-full truncate rounded-full border border-sky-200/85 bg-sky-50/90 px-2 py-0.5 text-[10px] font-medium text-sky-950 dark:border-sky-500/35 dark:bg-sky-950/40 dark:text-sky-100"
                  >
                    {studyTimeSlotLabel(t, dl)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {languageMeta && (languageMeta.offers.length > 0 || languageMeta.targets.length > 0) ? (
        <div className="space-y-2.5" aria-label={dl.postCardLanguageMetaAria}>
          {languageMeta.offers.length > 0 ? (
            <div>
              <p className="mb-1 text-[10px] font-medium leading-snug text-muted-foreground">
                {dl.postCardLanguageOffersLabel}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {languageMeta.offers.map((offer) => (
                  <span
                    key={offer.tag}
                    className="inline-flex max-w-full truncate rounded-full border border-violet-200/85 bg-violet-50/90 px-2 py-0.5 text-[10px] font-medium text-violet-950 dark:border-violet-500/35 dark:bg-violet-950/40 dark:text-violet-100"
                  >
                    {languageTagLabel(offer.tag, dl)} · {languageProficiencyLabel(offer.proficiency, dl)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {languageMeta.targets.length > 0 ? (
            <div>
              <p className="mb-1 text-[10px] font-medium leading-snug text-muted-foreground">
                {dl.postCardLanguageTargetsLabel}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {languageMeta.targets.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex max-w-full truncate rounded-full border border-fuchsia-200/85 bg-fuchsia-50/90 px-2 py-0.5 text-[10px] font-medium text-fuchsia-950 dark:border-fuchsia-500/35 dark:bg-fuchsia-950/40 dark:text-fuchsia-100"
                  >
                    {languageTagLabel(tag, dl)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {sportMeta && (sportMeta.sportTags.length > 0 || Boolean(sportMeta.sportOtherNote?.trim())) ? (
        <div className="space-y-2.5" aria-label={dl.postCardSportsMetaAria}>
          <div>
            <p className="mb-1 text-[10px] font-medium leading-snug text-muted-foreground">
              {dl.postCardSportsTagsLabel}
            </p>
            {sportMeta.sportTags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {sportMeta.sportTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex max-w-full truncate rounded-full border border-rose-200/85 bg-rose-50/90 px-2 py-0.5 text-[10px] font-medium text-rose-950 dark:border-rose-500/35 dark:bg-rose-950/40 dark:text-rose-100"
                  >
                    {sportTagLabel(tag, dl)}
                  </span>
                ))}
              </div>
            ) : null}
            {sportMeta.sportOtherNote?.trim() ? (
              <p
                className={
                  sportMeta.sportTags.length > 0
                    ? "mt-1.5 text-[11px] leading-snug text-muted-foreground"
                    : "text-[11px] leading-snug text-muted-foreground"
                }
              >
                {sportMeta.sportOtherNote.trim()}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

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
    </div>
  );
}
