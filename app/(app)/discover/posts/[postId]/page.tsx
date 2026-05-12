import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { redirect, notFound } from "next/navigation";
import { ClassmatePostCategory, ClassmatePostStatus } from "@prisma/client";
import { Calendar, ChevronRight, Link2, MapPin } from "lucide-react";

import { GuestAppCta } from "@/components/app/guest-app-cta";
import { ClassmatePostDetailViewBeacon } from "@/components/discover/classmate-post-detail-view-beacon";
import { ClassmatePostDetailShareMenu } from "@/components/discover/classmate-post-detail-share-menu";
import {
  DiscoverMessageButton,
  discoverPrimarySolidCtaClassName,
} from "@/components/discover/discover-message-button";
import { BackLink } from "@/components/nav/back-link";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { safeReturnPath } from "@/lib/nav/back";
import { DEFAULT_DISCOVER_SERVED_CITY } from "@/lib/discover/discover-city-name-keys";
import { getDiscoverCityDisplayLabel } from "@/lib/discover/discover-city-display";
import {
  languageProficiencyLabel,
  languageTagLabel,
  mealVenueLabel,
  sportTagLabel,
  studyPurposeLabel,
  studyTimeSlotLabel,
  studyVenueLabel,
} from "@/lib/discover/study-meta-labels";
import {
  mapPrismaLanguageToDiscoverRow,
  mapPrismaMealsToDiscoverRow,
  mapPrismaSportToDiscoverRow,
  mapPrismaStudyToDiscoverRow,
  type DiscoverPostRowLanguageMeta,
  type DiscoverPostRowMealsMeta,
  type DiscoverPostRowSportMeta,
  type DiscoverPostRowStudyMeta,
} from "@/lib/discover/discover-post-row";
import {
  buildViewerCourseMatchIndex,
  courseMatchesViewer,
  type ViewerCourseMatchIndex,
} from "@/lib/discover/viewer-course-match";
import type { AppLocale } from "@/lib/i18n/app-locale";
import {
  formatClassmatePostExpiryFullDate,
} from "@/lib/i18n/format-classmate-post-expiry";
import { formatMessage, getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";
import { getClassmatePostDetailForViewer } from "@/lib/queries/classmate-post-detail";
import { cn } from "@/lib/utils";

type CourseChip = { id: string; code: string | null; name: string };

type AuthorDisplay = {
  id: string;
  username: string;
  nickname: string | null;
  avatarUrl: string | null;
  major: string | null;
  semester: number | null;
  school: string | null;
  verifiedStudent: boolean;
  studentVerificationStatus: ComponentProps<typeof VerifiedBadge>["status"];
};

/** Shared shell for post detail CTAs (peer message or author “My posts” link). */
const POST_DETAIL_ACTION_FOOTER =
  "border-t border-border/60 bg-gradient-to-b from-muted/20 via-muted/35 to-muted/45 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:px-6";

/** Extra elevation on top of `discoverPrimarySolidCtaClassName`. */
const POST_DETAIL_PRIMARY_CTA_SHADOW =
  "shadow-[0_4px_14px_rgba(37,99,235,0.22)] dark:shadow-[0_4px_18px_rgba(37,99,235,0.18)]";

export default async function DiscoverPostDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ postId: string }>;
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const { postId } = await params;
  const query = (await searchParams) ?? {};
  const locale = await getServerAppLocale();
  const ui = getMessages(locale);
  const sessionUser = await getSessionUser();
  const backHref = safeReturnPath(query.returnTo, "/discover");
  const postPath = `/discover/posts/${postId}`;
  const now = new Date();

  if (!sessionUser) {
    const post = await getClassmatePostDetailForGuest(postId, now);
    if (!post) {
      notFound();
    }
    const profilePeerHref = `/login?returnTo=${encodeURIComponent(
      `/users/${post.user.id}?returnTo=${encodeURIComponent(postPath)}`,
    )}` as Route;
    const live = post.status === "ACTIVE" && post.expiresAt > now;
    const author: AuthorDisplay = post.user;
    const courses: CourseChip[] = post.courses.map((pc) => ({
      id: pc.course.id,
      code: pc.course.code,
      name: pc.course.name,
    }));
    const studyMeta = mapPrismaStudyToDiscoverRow(post.study);
    const mealsMeta = mapPrismaMealsToDiscoverRow(post.meals);
    const languageMeta = mapPrismaLanguageToDiscoverRow(post.language);
    const sportMeta = mapPrismaSportToDiscoverRow(post.sport);
    const cityLabel = getDiscoverCityDisplayLabel(post.city, ui.discover.cityNames);

    return (
      <div className="space-y-5 pb-6">
        <header className="flex items-center gap-2">
          <BackLink href={backHref} label="Back" />
        </header>

        <article
          className={cn(
            "overflow-hidden rounded-[1.25rem] border border-border/80 bg-card",
            "shadow-[0_4px_24px_rgba(15,23,42,0.06)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.25)]",
          )}
        >
          <PostAuthorSection
            author={author}
            profileHref={profilePeerHref}
            showProfileCue
            topEnd={null}
          />

          <PostContentSection
            locale={locale}
            category={post.category}
            status={post.status}
            title={post.title}
            body={post.body}
            cityLabel={cityLabel}
            live={live}
            expiresAt={post.expiresAt}
            updatedAt={post.updatedAt}
            courses={courses}
            studyMeta={studyMeta}
            mealsMeta={mealsMeta}
            languageMeta={languageMeta}
            sportMeta={sportMeta}
            courseLinkBase={null}
            isAuthor={false}
            highlightViewerCourses={false}
            viewerCourseMatchIndex={null}
          />

          <div className="border-t border-border/50 bg-muted/30 px-4 py-4 sm:px-5">
            <p className="mb-3 text-[13px] leading-snug text-muted-foreground">
              Log in to message this classmate or post your own.
            </p>
            <GuestAppCta returnTo={postPath} />
          </div>
        </article>
      </div>
    );
  }

  if (!sessionUser.onboardingComplete) {
    redirect("/onboarding");
  }

  const data = await getClassmatePostDetailForViewer(postId, sessionUser.id);
  if (!data.ok) {
    notFound();
  }

  const { post, author, isAuthor, viewerCanMessage } = data;
  const profilePeerHref =
    !isAuthor
      ? (`/users/${author.id}?returnTo=${encodeURIComponent(postPath)}` as Route)
      : ("/profile" as Route);

  const live = post.status === "ACTIVE" && post.expiresAt > now;

  const myEnrolled = await prisma.userCourse.findMany({
    where: { userId: sessionUser.id },
    select: { course: { select: { id: true, code: true } } },
  });
  const viewerCourseMatchIndex = buildViewerCourseMatchIndex(
    myEnrolled.map((uc) => ({ id: uc.course.id, code: uc.course.code })),
  );
  const cityLabel = getDiscoverCityDisplayLabel(post.city, ui.discover.cityNames);

  return (
    <div className="space-y-5 pb-6">
      {!isAuthor ? <ClassmatePostDetailViewBeacon postId={post.id} /> : null}
      <header className="flex items-center gap-2">
        <BackLink href={backHref} label="Back" />
      </header>

      <article
        className={cn(
          "overflow-hidden rounded-[1.25rem] border border-border/80 bg-card",
          "shadow-[0_4px_24px_rgba(15,23,42,0.06)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.25)]",
        )}
      >
        <PostAuthorSection
          author={author}
          profileHref={profilePeerHref}
          showProfileCue={!isAuthor}
          topEnd={
            isAuthor ? (
              <ClassmatePostDetailShareMenu
                title={post.title}
                body={post.body}
                postPath={postPath}
              />
            ) : null
          }
        />

        <PostContentSection
          locale={locale}
          category={post.category}
          status={post.status}
          title={post.title}
          body={post.body}
          cityLabel={cityLabel}
          live={live}
          expiresAt={post.expiresAt}
          updatedAt={post.updatedAt}
          courses={post.linkedCourses}
          studyMeta={post.studyMeta}
          mealsMeta={post.mealsMeta}
          languageMeta={post.languageMeta}
          sportMeta={post.sportMeta}
          courseLinkBase="/courses"
          isAuthor={isAuthor}
          highlightViewerCourses
          viewerCourseMatchIndex={viewerCourseMatchIndex}
        />

        {viewerCanMessage ? (
          <div className={POST_DETAIL_ACTION_FOOTER}>
            <p className="mb-4 max-w-prose text-[13px] leading-relaxed text-muted-foreground">
              Send a direct message to connect about this post.
            </p>
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-stretch sm:gap-3">
              <DiscoverMessageButton
                peerId={author.id}
                returnTo={postPath}
                tone="solid"
                insightPostId={post.id}
                className={POST_DETAIL_PRIMARY_CTA_SHADOW}
              />
            </div>
          </div>
        ) : isAuthor ? (
          <div className={POST_DETAIL_ACTION_FOOTER}>
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-stretch sm:gap-3">
              <Link
                href={`/inbox/my-posts?returnTo=${encodeURIComponent(postPath)}` as Route}
                className={cn(
                  discoverPrimarySolidCtaClassName,
                  POST_DETAIL_PRIMARY_CTA_SHADOW,
                  "text-center no-underline active:scale-[0.98]",
                )}
              >
                My posts
              </Link>
            </div>
          </div>
        ) : null}
      </article>
    </div>
  );
}

function PostAuthorSection({
  author,
  profileHref,
  showProfileCue,
  topEnd,
}: {
  author: AuthorDisplay;
  profileHref: Route;
  showProfileCue: boolean;
  topEnd: ReactNode;
}) {
  const displayName = author.nickname ?? author.username;
  const subtitle =
    [author.major, author.semester != null ? `Sem ${author.semester}` : null]
      .filter(Boolean)
      .join(" · ") || "Student";

  return (
    <div className="border-b border-border/70 bg-muted/20 px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex items-start gap-3.5">
        <Link href={profileHref} className="shrink-0 rounded-full ring-2 ring-background">
          <PresetAvatar id={author.avatarUrl} size={56} />
        </Link>
        <div className="min-w-0 flex-1 pt-0.5">
          <Link
            href={profileHref}
            className="group inline-flex max-w-full items-center gap-2 text-[15px] font-semibold text-foreground"
          >
            <span className="truncate">{displayName}</span>
            <VerifiedBadge
              size="xs"
              school={author.school}
              verifiedStudent={author.verifiedStudent}
              status={author.studentVerificationStatus}
            />
            {showProfileCue ? (
              <ChevronRight
                className="h-4 w-4 shrink-0 text-muted-foreground opacity-60 transition group-hover:opacity-100"
                aria-hidden
              />
            ) : null}
          </Link>
          <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p>
        </div>
        {topEnd ? <div className="shrink-0 self-start">{topEnd}</div> : null}
      </div>
    </div>
  );
}

function PostContentSection({
  locale,
  category,
  status,
  title,
  body,
  cityLabel,
  live,
  expiresAt,
  updatedAt,
  courses,
  studyMeta,
  mealsMeta,
  languageMeta,
  sportMeta,
  courseLinkBase,
  isAuthor,
  highlightViewerCourses,
  viewerCourseMatchIndex,
}: {
  locale: AppLocale;
  category: ClassmatePostCategory;
  status: ClassmatePostStatus;
  title: string;
  body: string | null;
  cityLabel: string;
  live: boolean;
  expiresAt: Date;
  updatedAt: Date;
  courses: CourseChip[];
  studyMeta?: DiscoverPostRowStudyMeta | null;
  mealsMeta?: DiscoverPostRowMealsMeta | null;
  languageMeta?: DiscoverPostRowLanguageMeta | null;
  sportMeta?: DiscoverPostRowSportMeta | null;
  courseLinkBase: "/courses" | null;
  isAuthor: boolean;
  /** When false (e.g. guest), chips stay neutral. */
  highlightViewerCourses: boolean;
  viewerCourseMatchIndex: ViewerCourseMatchIndex | null;
}) {
  const dl = getMessages(locale).discoverList;
  const dateLabel = live
    ? formatMessage(dl.postActiveUntil, {
        date: formatClassmatePostExpiryFullDate(expiresAt, locale),
      })
    : status === ClassmatePostStatus.CLOSED
      ? formatMessage(dl.postDetailClosedUpdated, {
          date: formatClassmatePostExpiryFullDate(updatedAt, locale),
        })
      : formatMessage(dl.postDetailExpiredUpdated, {
          date: formatClassmatePostExpiryFullDate(updatedAt, locale),
        });
  const dateValue = live ? expiresAt.toISOString() : updatedAt.toISOString();

  return (
    <div className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-classmates-teal-border/60 bg-classmates-teal-soft px-2.5 py-1 text-[11px] font-semibold text-classmates-teal">
          {labelCategory(category)}
        </span>
        {isAuthor ? (
          <span className="rounded-full border border-classmates-blue-border/80 bg-classmates-blue-soft px-2.5 py-1 text-[11px] font-semibold text-classmates-blue">
            Your post
          </span>
        ) : null}
        {live ? (
          <span className="rounded-full border border-classmates-teal-border/70 bg-classmates-teal-soft px-2.5 py-1 text-[11px] font-semibold text-classmates-teal dark:text-teal-200">
            Active
          </span>
        ) : (
          <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            {status === ClassmatePostStatus.CLOSED ? "Closed" : "Expired"}
          </span>
        )}
      </div>

      <div className="rounded-2xl border border-border/70 bg-muted/30 px-3.5 py-3.5 sm:px-4 sm:py-4">
        <h1 className="text-xl font-semibold leading-snug tracking-tight text-foreground">
          {title}
        </h1>
        {body ? (
          <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground/90">
            {body}
          </p>
        ) : null}
      </div>

      {studyMeta &&
      (studyMeta.purposes.length > 0 ||
        studyMeta.timeSlots.length > 0 ||
        studyMeta.venues.length > 0 ||
        Boolean(studyMeta.venueOtherNote?.trim())) ? (
        <div className="space-y-2.5" aria-label={dl.postCardStudyMetaAria}>
          {studyMeta.purposes.length > 0 ? (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                {dl.postCardStudyPurposesLabel}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {studyMeta.purposes.map((p) => (
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
          {studyMeta.timeSlots.length > 0 ? (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                {dl.postCardStudyTimeLabel}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {studyMeta.timeSlots.map((t) => (
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
          {studyMeta.venues.length > 0 ? (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                {dl.postCardStudyVenuesLabel}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {studyMeta.venues.map((v) => (
                  <span
                    key={v}
                    className="inline-flex max-w-full truncate rounded-full border border-sky-200/85 bg-sky-50/90 px-2 py-0.5 text-[10px] font-medium text-sky-950 dark:border-sky-500/35 dark:bg-sky-950/40 dark:text-sky-100"
                  >
                    {studyVenueLabel(v, dl)}
                  </span>
                ))}
              </div>
              {studyMeta.venues.includes("OTHER") && studyMeta.venueOtherNote?.trim() ? (
                <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                  {studyMeta.venueOtherNote.trim()}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {mealsMeta &&
      (mealsMeta.venueTags.length > 0 || Boolean(mealsMeta.venueOtherNote?.trim())) ? (
        <div className="space-y-2.5" aria-label={dl.postCardMealsMetaAria}>
          {mealsMeta.venueTags.length > 0 ? (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                {dl.postCardMealsVenuesLabel}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {mealsMeta.venueTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex max-w-full truncate rounded-full border border-amber-200/85 bg-amber-50/90 px-2 py-0.5 text-[10px] font-medium text-amber-950 dark:border-amber-500/35 dark:bg-amber-950/40 dark:text-amber-100"
                  >
                    {mealVenueLabel(tag, dl)}
                  </span>
                ))}
              </div>
              {mealsMeta.venueTags.includes("OTHER") && mealsMeta.venueOtherNote?.trim() ? (
                <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                  {mealsMeta.venueOtherNote.trim()}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {languageMeta &&
      (languageMeta.offers.length > 0 || languageMeta.targets.length > 0) ? (
        <div className="space-y-2.5" aria-label={dl.postCardLanguageMetaAria}>
          {languageMeta.offers.length > 0 ? (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
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
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
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

      {sportMeta &&
      (sportMeta.sportTags.length > 0 || Boolean(sportMeta.sportOtherNote?.trim())) ? (
        <div className="space-y-2.5" aria-label={dl.postCardSportsMetaAria}>
          {sportMeta.sportTags.length > 0 ? (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                {dl.postCardSportsTagsLabel}
              </p>
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
              {sportMeta.sportTags.includes("OTHER") && sportMeta.sportOtherNote?.trim() ? (
                <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                  {sportMeta.sportOtherNote.trim()}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {courses.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
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
              <span
                key={c.id}
                className={cn(chipClass, "cursor-default")}
                title={titleAttr}
              >
                {chipBody}
              </span>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-border/50 pt-4 text-[13px] text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          {cityLabel}
        </span>
        <time
          dateTime={dateValue}
          className="inline-flex items-center gap-1.5"
        >
          <Calendar className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          {dateLabel}
        </time>
      </div>
    </div>
  );
}

async function getClassmatePostDetailForGuest(postId: string, now: Date) {
  return prisma.classmatePost.findFirst({
    where: {
      id: postId,
      city: DEFAULT_DISCOVER_SERVED_CITY,
      OR: [{ status: "ACTIVE" }, { status: "CLOSED" }],
      expiresAt: { gt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 7) },
      user: {
        moderationBlocks: { none: { isActive: true } },
      },
    },
    select: {
      id: true,
      category: true,
      city: true,
      title: true,
      body: true,
      status: true,
      expiresAt: true,
      updatedAt: true,
      userId: true,
      user: {
        select: {
          id: true,
          username: true,
          nickname: true,
          avatarUrl: true,
          major: true,
          semester: true,
          school: true,
          verifiedStudent: true,
          studentVerificationStatus: true,
        },
      },
      courses: { select: { course: { select: { id: true, code: true, name: true } } } },
      study: true,
      meals: true,
      language: true,
      sport: true,
    },
  });
}

function labelCategory(c: ClassmatePostCategory) {
  switch (c) {
    case ClassmatePostCategory.SHARED_COURSES:
      return "Shared courses";
    case ClassmatePostCategory.MEALS:
      return "Meals";
    case ClassmatePostCategory.LANGUAGE:
      return "Language";
    case ClassmatePostCategory.SPORTS:
      return "Sports";
    case ClassmatePostCategory.STUDY:
      return "Study";
  }
}
