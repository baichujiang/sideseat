"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import type { Route } from "next";
import { addDays } from "date-fns";
import { useEffect, useState } from "react";
import {
  BookUser,
  Clock,
  Edit3,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ClassmatePostCategory,
  StudyPurpose,
  StudyTimeSlot,
  StudyVenue,
  type LanguageProficiency,
  type LanguageTag,
  type SportTag,
  type UserGender,
} from "@prisma/client";

import {
  ClassmatesPersonRow,
  CLASSMATES_PERSON_ROW_AVATAR_RING_DISCOVER,
} from "@/components/classmates/classmates-person-row";
import { DiscoverFeed } from "@/components/discover/discover-feed";
import { DiscoverFeedTabs } from "@/components/discover/discover-feed-tabs";
import {
  applyBuddyFeedClientFilters,
  DiscoverFilterSheet,
  DiscoverFilterTriggerButton,
  type BuddyFeedTimeFilter,
} from "@/components/discover/discover-filter-sheet";
import { ClassmatePostCreateImageRow } from "@/components/discover/classmate-post-create-image-row";
import { LanguageExchangePostFields } from "@/components/discover/language-exchange-post-fields";
import { SportsPostFieldCombobox } from "@/components/discover/sports-post-field-combobox";
import { DiscoverMessageButton } from "@/components/discover/discover-message-button";
import { AppPushLayer } from "@/components/ui/app-push-layer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LinkButton } from "@/components/ui/link-button";
import { UserGenderCardIcon } from "@/components/ui/user-gender-icon";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import type { DiscoverPostRow } from "@/lib/discover/discover-post-row";
import {
  discoverFeedKindToParam,
  filterDiscoverFeedPosts,
  parseDiscoverFeedKind,
  type DiscoverFeedKind,
} from "@/lib/discover/discover-feed-kind";
import { ALL_BUDDY_CATEGORIES, buddyTypeLabel } from "@/lib/discover/buddy-type-labels";
import { DEFAULT_DISCOVER_SERVED_CITY } from "@/lib/discover/discover-city-name-keys";
import { useAppMessages } from "@/hooks/use-app-locale";
import { formatMessage, type AppMessages } from "@/lib/i18n/messages";
import {
  CLASSMATE_POST_BODY_MAX_LEN,
  CLASSMATE_POST_MEALS_VENUE_OTHER_NOTE_MAX,
  CLASSMATE_POST_SPORT_OTHER_NOTE_MAX,
  CLASSMATE_POST_TITLE_MAX_LEN,
  CLASSMATE_POST_STUDY_VENUE_OTHER_NOTE_MAX,
  STUDY_PURPOSE_VALUES,
  STUDY_TIME_SLOT_VALUES,
  STUDY_VENUE_VALUES,
} from "@/lib/validators/classmate-posts";
import { studyPurposeLabel, studyTimeSlotLabel, studyVenueLabel } from "@/lib/discover/study-meta-labels";
import { cn } from "@/lib/utils";

type PostExpiryPreset = "3d" | "1w" | "1m" | "never";
const DEFAULT_LANGUAGE_OFFER_PROFICIENCY: LanguageProficiency = "CONVERSATIONAL";

type CourseRef = {
  id: string;
  code: string | null;
  name: string;
};

/** Shared-course tab rows — chips need overlap to distinguish schedule match vs enrollment-only. */
type SharedCourse = CourseRef & { overlapMinutes: number };

export type DiscoverRow = {
  userId: string;
  nickname: string;
  gender: UserGender;
  avatarUrl: string | null;
  major: string | null;
  semester: number | null;
  bio: string | null;
  school: string | null;
  languages: Array<{ tag: LanguageTag; proficiency: LanguageProficiency }>;
  verifiedStudent: boolean;
  studentVerificationStatus:
    | "UNVERIFIED"
    | "EMAIL_PENDING"
    | "VERIFIED"
    | "MANUAL_REVIEW_REQUIRED"
    | "REJECTED";
  primaryReason: string;
  primaryCourse: CourseRef;
  sharedCourses: SharedCourse[];
  otherCourses: CourseRef[];
  connectionId: string | null;
};

export type { DiscoverPostRow } from "@/lib/discover/discover-post-row";

export type EnrolledCourseOption = { id: string; code: string | null; name: string };

export function DiscoverList({
  rows,
  posts,
  savedCourseCount,
  enrolledCourses = [],
}: {
  rows: DiscoverRow[];
  posts: DiscoverPostRow[];
  /** Saved courses count — used to suggest “Add a course” when the feed is empty. */
  savedCourseCount?: number;
  enrolledCourses?: EnrolledCourseOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const m = useAppMessages();
  const dl = m.discoverList;
  const buddy = m.discoverBuddy;

  const [feed, setFeed] = useState<DiscoverFeedKind>(() => parseDiscoverFeedKind(searchParams.get("feed")));
  const [searchQuery, setSearchQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<{
    categories: ClassmatePostCategory[] | null;
    time: BuddyFeedTimeFilter;
    openOnly: boolean;
  }>({ categories: null, time: "any", openOnly: false });
  const [postOpen, setPostOpen] = useState(false);

  useEffect(() => {
    setFeed(parseDiscoverFeedKind(searchParams.get("feed")));
  }, [searchParams]);

  const setFeedKind = (kind: DiscoverFeedKind) => {
    setFeed(kind);
    const url = new URL(window.location.href);
    if (kind === "for-you") {
      url.searchParams.delete("feed");
    } else {
      url.searchParams.set("feed", discoverFeedKindToParam(kind));
    }
    url.searchParams.delete("tab");
    window.history.replaceState(null, "", url.toString());
  };

  const filteredByFeed = filterDiscoverFeedPosts(posts, feed);
  const filteredBySheet = applyBuddyFeedClientFilters(filteredByFeed, filters);
  const q = searchQuery.trim().toLowerCase();
  const filteredPosts =
    q.length < 2
      ? filteredBySheet
      : filteredBySheet.filter((p) => {
          const courseBlob = (p.linkedCourses ?? []).map((c) => `${c.code ?? ""} ${c.name}`).join(" ");
          const blob = [p.title, p.body ?? "", p.nickname, buddyTypeLabel(p.category, buddy), courseBlob]
            .join(" ")
            .toLowerCase();
          return blob.includes(q);
        });

  const filterActive =
    Boolean(filters.categories?.length) || filters.time !== "any" || filters.openOnly;

  const emptyCopy = feed === "today" ? buddy.emptyFeedToday : buddy.emptyFeed;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={buddy.searchPlaceholder}
            aria-label={buddy.searchAria}
            className="h-10 min-w-0 flex-1 rounded-full border-border/80 bg-white px-3.5 text-[13px] shadow-sm dark:bg-card"
          />
          <DiscoverFilterTriggerButton
            onClick={() => setFilterOpen(true)}
            ariaLabel={buddy.filterOpenAria}
            active={filterActive}
          />
          <button
            type="button"
            onClick={() => setPostOpen(true)}
            aria-label={buddy.createRequestCtaAria}
            className="inline-flex h-10 shrink-0 items-center gap-1 rounded-full bg-classmates-blue px-3.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-classmates-blue/90"
          >
            <Plus className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">{buddy.createRequestCta}</span>
          </button>
        </div>
        <DiscoverFeedTabs active={feed} onChange={setFeedKind} labels={buddy} />
      </div>

      {feed === "for-you" && rows.length > 0 ? (
        <DiscoverPeopleRail rows={rows} title={buddy.peopleStripTitle} />
      ) : null}

      <DiscoverFilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        initial={filters}
        buddy={buddy}
        onApply={(next) => setFilters(next)}
      />

      {filteredPosts.length === 0 ? (
        <div className="rounded-2xl border border-[#E7E0D6] bg-white px-4 py-6 text-center text-[13px] text-muted-foreground shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
          {emptyCopy}
          {rows.length === 0 && savedCourseCount === 0 ? (
            <div className="mt-4 flex justify-center">
              <LinkButton href={"/courses/add" as Route} size="sm">
                {dl.addCourse}
              </LinkButton>
            </div>
          ) : null}
        </div>
      ) : (
        <DiscoverFeed posts={filteredPosts} cityNameKey={DEFAULT_DISCOVER_SERVED_CITY} />
      )}

      <CreatePostSheet
        open={postOpen}
        enrolledCourses={enrolledCourses}
        onClose={() => setPostOpen(false)}
        onCreated={() => {
          setPostOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}

function DiscoverPeopleRail({ rows, title }: { rows: DiscoverRow[]; title: string }) {
  return (
    <div className="space-y-2">
      <p className="text-[12px] font-semibold tracking-tight text-foreground">{title}</p>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {rows.map((r) => (
          <div key={r.userId} className="w-[min(100%,19rem)] shrink-0">
            <RecommendationRow row={r} />
          </div>
        ))}
      </div>
    </div>
  );
}

function sharedCourseChipLabel(c: { code: string | null; name: string }): string {
  const code = c.code?.trim();
  return code || c.name.trim();
}

/**
 * Shared tab — one chip per mutual course. Teal + clock = weekly session overlap;
 * amber + book = same course enrollment but no overlapping times (not “deeper blue”).
 */
function SharedCourseChipForRow({
  code,
  name,
  overlapMinutes,
}: {
  code: string | null;
  name: string;
  overlapMinutes: number;
}) {
  const label = sharedCourseChipLabel({ code, name });
  const hasScheduleOverlap = overlapMinutes > 0;
  return (
    <span
      title={
        hasScheduleOverlap
          ? `${name} — calendar overlaps with yours this week`
          : `${name} — same course; no overlapping sessions in your schedules`
      }
      className={cn(
        "inline-flex max-w-[10rem] items-center gap-1 truncate rounded-full px-2.5 py-0.5 text-[11px] font-bold tabular-nums ring-1 ring-inset",
        hasScheduleOverlap
          ? "bg-classmates-teal-soft text-classmates-teal ring-classmates-teal-border dark:bg-teal-950/45 dark:text-teal-200 dark:ring-teal-500/40"
          : "bg-amber-50/95 text-amber-950 ring-amber-200/90 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-500/35",
      )}
    >
      {hasScheduleOverlap ? (
        <Clock className="h-3 w-3 shrink-0 opacity-85" aria-hidden />
      ) : (
        <BookUser className="h-3 w-3 shrink-0 opacity-75" aria-hidden />
      )}
      <span className="truncate">{label}</span>
    </span>
  );
}

function RecommendationRow({ row }: { row: DiscoverRow }) {
  const meta = [row.major, row.semester ? `sem ${row.semester}` : null]
    .filter(Boolean)
    .join(" · ");
  const sharedCount = row.sharedCourses.length;
  const profileHref = `/users/${row.userId}?returnTo=%2Fdiscover` as Route;
  const hasSharedCourses = sharedCount > 0;

  /** Primary course when not listing shared chips — style as enrollment-only hint. */
  function PrimaryCourseHintChip({ code, name }: { code: string | null; name: string }) {
    return <SharedCourseChipForRow code={code} name={name} overlapMinutes={0} />;
  }

  return (
    <ClassmatesPersonRow
      avatarHref={profileHref}
      avatarUrl={row.avatarUrl}
      avatarSize={72}
      avatarLinkClassName={CLASSMATES_PERSON_ROW_AVATAR_RING_DISCOVER}
      profileAriaLabel={`View ${row.nickname}'s profile`}
      name={row.nickname}
      nameRowAdornment={
        <VerifiedBadge
          size="xs"
          school={row.school}
          verifiedStudent={row.verifiedStudent}
          status={row.studentVerificationStatus}
        />
      }
      titleAdornment={
        <>
          <UserGenderCardIcon gender={row.gender} className="shrink-0" />
          {row.connectionId ? (
            <span className="shrink-0 rounded-full border border-classmates-teal-border/80 bg-classmates-teal-soft px-2 py-0.5 text-[10px] font-semibold text-classmates-teal dark:bg-teal-950/40 dark:text-teal-200">
              Chatting
            </span>
          ) : null}
        </>
      }
      body={
        <>
          {/* — meta: major + semester */}
          {meta ? (
            <p className="mt-1 truncate text-[12px] font-medium leading-snug text-muted-foreground">{meta}</p>
          ) : null}

          {/* — bio: gives personality, fills empty space */}
          {row.bio ? (
            <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-foreground/80 dark:text-foreground/70">
              {row.bio}
            </p>
          ) : null}

          {/* — course match: inline chips, no heavy box */}
          {hasSharedCourses ? (
            <div
              className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5"
              aria-label="Courses you both take"
            >
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.07em] text-classmates-teal dark:text-teal-300">
                Shared
              </span>
              {row.sharedCourses.slice(0, 3).map((c) => (
                <SharedCourseChipForRow
                  key={c.id}
                  code={c.code}
                  name={c.name}
                  overlapMinutes={c.overlapMinutes}
                />
              ))}
              {sharedCount > 3 ? (
                <span className="text-[11px] font-medium text-muted-foreground">
                  +{sharedCount - 3} more
                </span>
              ) : null}
              {/* Full name hint when only one shared course with a code */}
              {sharedCount === 1 && row.sharedCourses[0]?.code ? (
                <span className="w-full truncate text-[11px] leading-snug text-muted-foreground">
                  {row.sharedCourses[0].name}
                </span>
              ) : null}
            </div>
          ) : (
            /* No mutual courses — show primary course as nearby hint */
            <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground/70 dark:text-zinc-500">
                Nearby
              </span>
              {row.primaryCourse.code ? (
                <PrimaryCourseHintChip
                  code={row.primaryCourse.code}
                  name={row.primaryCourse.name}
                />
              ) : null}
              <span className="min-w-0 truncate text-[11px] text-muted-foreground">
                {row.primaryCourse.name}
              </span>
            </div>
          )}
        </>
      }
      titleRowAction={
        <DiscoverMessageButton
          peerId={row.userId}
          courseId={row.primaryCourse.id}
          tone={hasSharedCourses ? "soft" : "subtle"}
          hasExistingChat={Boolean(row.connectionId)}
          className="h-9 min-h-9 max-w-full shrink-0 touch-manipulation justify-center gap-1.5 px-3.5 text-[12px] sm:max-w-none"
        />
      }
      action={
        hasSharedCourses ? (
          <p className="text-center text-[10px] font-semibold tabular-nums text-classmates-teal dark:text-teal-300 sm:text-right">
            {sharedCount === 1 ? "1 course in common" : `${sharedCount} courses in common`}
          </p>
        ) : undefined
      }
    />
  );
}

function postFieldCharCountClassName(current: number, max: number) {
  if (current > max) return "text-destructive";
  const remaining = max - current;
  const warnThreshold = Math.max(1, Math.ceil(max * 0.12));
  if (remaining <= warnThreshold) return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

function CreatePostSheet({
  open,
  enrolledCourses = [],
  onClose,
  onCreated,
}: {
  open: boolean;
  enrolledCourses?: EnrolledCourseOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const m = useAppMessages();
  const dl = m.discoverList;
  const buddy = m.discoverBuddy;
  const common = m.common;
  const [category, setCategory] = useState<ClassmatePostCategory>(ClassmatePostCategory.STUDY);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [expiryPreset, setExpiryPreset] = useState<PostExpiryPreset>("1w");
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<string>>(new Set());
  const [studyPurposes, setStudyPurposes] = useState<Set<StudyPurpose>>(new Set());
  const [studyTimeSlots, setStudyTimeSlots] = useState<Set<StudyTimeSlot>>(new Set());
  const [studyVenues, setStudyVenues] = useState<Set<StudyVenue>>(new Set());
  const [studyVenueOtherNote, setStudyVenueOtherNote] = useState("");
  const [mealVenueOtherNote, setMealVenueOtherNote] = useState("");
  const [languageOfferTags, setLanguageOfferTags] = useState<Set<LanguageTag>>(new Set());
  const [languageOfferLevels, setLanguageOfferLevels] = useState<
    Partial<Record<LanguageTag, LanguageProficiency>>
  >({});
  const [languageTargets, setLanguageTargets] = useState<Set<LanguageTag>>(new Set());
  const [sportTags, setSportTags] = useState<Set<SportTag>>(new Set());
  const [sportOtherNote, setSportOtherNote] = useState("");
  const [postImageUrls, setPostImageUrls] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isShared = category === ClassmatePostCategory.SHARED_COURSES;
  const isStudy = category === ClassmatePostCategory.STUDY;
  const isMeals = category === ClassmatePostCategory.MEALS;
  const isLanguage = category === ClassmatePostCategory.LANGUAGE;
  const isSports = category === ClassmatePostCategory.SPORTS;

  useEffect(() => {
    if (!open) return;
    setCategory(ClassmatePostCategory.STUDY);
    setTitle("");
    setBody("");
    setError(null);
    setExpiryPreset("1w");
    setSelectedCourseIds(new Set());
    setStudyPurposes(new Set());
    setStudyTimeSlots(new Set());
    setStudyVenues(new Set());
    setStudyVenueOtherNote("");
    setMealVenueOtherNote("");
    setLanguageOfferTags(new Set());
    setLanguageOfferLevels({});
    setLanguageTargets(new Set());
    setSportTags(new Set());
    setSportOtherNote("");
    setPostImageUrls([]);
  }, [open]);

  function toggleCourse(id: string) {
    setSelectedCourseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllCourses() {
    setSelectedCourseIds(new Set(enrolledCourses.map((c) => c.id)));
  }

  function toggleStudyPurpose(p: StudyPurpose) {
    setStudyPurposes((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  function toggleStudyTimeSlot(t: StudyTimeSlot) {
    setStudyTimeSlots((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  function toggleStudyVenue(v: StudyVenue) {
    setStudyVenues((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }

  function toggleLanguageOffer(tag: LanguageTag) {
    setLanguageOfferTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
    setLanguageOfferLevels((prev) => {
      if (tag in prev) {
        const next = { ...prev };
        delete next[tag];
        return next;
      }
      return { ...prev, [tag]: DEFAULT_LANGUAGE_OFFER_PROFICIENCY };
    });
  }

  function setLanguageOfferLevel(tag: LanguageTag, proficiency: LanguageProficiency) {
    setLanguageOfferLevels((prev) => ({ ...prev, [tag]: proficiency }));
  }

  function toggleLanguageTarget(tag: LanguageTag) {
    setLanguageTargets((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  function addSportPresetTag(tag: SportTag) {
    if (tag === "OTHER") return;
    setSportTags((prev) => {
      const next = new Set(prev);
      next.add(tag);
      return next;
    });
  }

  function removeSportPresetTag(tag: SportTag) {
    setSportTags((prev) => {
      const next = new Set(prev);
      next.delete(tag);
      return next;
    });
  }

  async function submit() {
    if (submitting) return;
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (isShared && selectedCourseIds.size === 0) {
      setError(dl.postErrorSelectCourse);
      return;
    }
    if (!trimmedTitle) {
      setError(dl.postErrorNeedTitle);
      return;
    }
    if (trimmedTitle.length > CLASSMATE_POST_TITLE_MAX_LEN) {
      setError(formatMessage(dl.postErrorTitleTooLong, { max: CLASSMATE_POST_TITLE_MAX_LEN }));
      return;
    }
    if (trimmedBody.length > CLASSMATE_POST_BODY_MAX_LEN) {
      setError(formatMessage(dl.postErrorBodyTooLong, { max: CLASSMATE_POST_BODY_MAX_LEN }));
      return;
    }
    if (isStudy && studyVenues.has("OTHER") && !studyVenueOtherNote.trim()) {
      setError(dl.postErrorStudyVenueOtherNote);
      return;
    }
    if (isStudy && studyVenueOtherNote.trim() && !studyVenues.has("OTHER")) {
      setError(dl.postErrorStudyVenueOtherRequiresOther);
      return;
    }
    if (isStudy && studyVenueOtherNote.trim().length > CLASSMATE_POST_STUDY_VENUE_OTHER_NOTE_MAX) {
      setError(
        formatMessage(dl.postErrorStudyVenueNoteTooLong, {
          max: CLASSMATE_POST_STUDY_VENUE_OTHER_NOTE_MAX,
        }),
      );
      return;
    }
    if (isMeals && mealVenueOtherNote.trim().length > CLASSMATE_POST_MEALS_VENUE_OTHER_NOTE_MAX) {
      setError(
        formatMessage(dl.postErrorMealsVenueNoteTooLong, {
          max: CLASSMATE_POST_MEALS_VENUE_OTHER_NOTE_MAX,
        }),
      );
      return;
    }
    if (isLanguage && languageOfferTags.size === 0 && languageTargets.size === 0) {
      setError(dl.postErrorLanguageNeedMeta);
      return;
    }
    if (isSports && sportTags.has("OTHER") && !sportOtherNote.trim()) {
      setError(dl.postErrorSportsOtherNote);
      return;
    }
    if (isSports && sportOtherNote.trim().length > CLASSMATE_POST_SPORT_OTHER_NOTE_MAX) {
      setError(
        formatMessage(dl.postErrorSportsNoteTooLong, {
          max: CLASSMATE_POST_SPORT_OTHER_NOTE_MAX,
        }),
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const studyPayload =
        isStudy &&
        (studyPurposes.size > 0 ||
          studyTimeSlots.size > 0 ||
          studyVenues.size > 0 ||
          (studyVenues.has("OTHER") && studyVenueOtherNote.trim().length > 0))
          ? {
              purposes: [...studyPurposes],
              timeSlots: [...studyTimeSlots],
              venues: [...studyVenues],
              ...(studyVenues.has("OTHER") && studyVenueOtherNote.trim()
                ? { venueOtherNote: studyVenueOtherNote.trim() }
                : {}),
            }
          : undefined;
      const mealsPayload =
        isMeals && mealVenueOtherNote.trim().length > 0
          ? { venueOtherNote: mealVenueOtherNote.trim() }
          : undefined;
      const languagePayload =
        isLanguage && (languageOfferTags.size > 0 || languageTargets.size > 0)
          ? {
              offers: [...languageOfferTags].map((tag) => ({
                tag,
                proficiency: languageOfferLevels[tag] ?? DEFAULT_LANGUAGE_OFFER_PROFICIENCY,
              })),
              targets: [...languageTargets],
            }
          : undefined;
      const sportPayload =
        isSports && (sportTags.size > 0 || sportOtherNote.trim().length > 0)
          ? {
              sportTags: [...sportTags],
              ...(sportOtherNote.trim() ? { sportOtherNote: sportOtherNote.trim() } : {}),
            }
          : undefined;

      const res = await apiFetch("/api/classmate-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: DEFAULT_DISCOVER_SERVED_CITY,
          category,
          title: trimmedTitle,
          body: trimmedBody,
          expiresAt: expiryPresetToDate(expiryPreset).toISOString(),
          ...(isShared && selectedCourseIds.size > 0
            ? { courseIds: [...selectedCourseIds] }
            : {}),
          ...(studyPayload ? { study: studyPayload } : {}),
          ...(mealsPayload ? { meals: mealsPayload } : {}),
          ...(languagePayload ? { language: languagePayload } : {}),
          ...(sportPayload ? { sport: sportPayload } : {}),
          ...(postImageUrls.length > 0 ? { imageUrls: postImageUrls } : {}),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to create post.");
      }
      setSubmitting(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : dl.postErrorCreateFailed);
      setSubmitting(false);
    }
  }

  return (
    <AppPushLayer
      open={open}
      onClose={onClose}
      zClassName="z-40"
      panelClassName="w-[min(100vw,28rem)] border-0 bg-background shadow-none dark:shadow-none"
    >
      <div className="flex h-full min-h-0 flex-col px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="mx-auto mb-3 h-1.5 w-12 shrink-0 rounded-full bg-border/80" />
        <div className="mb-3 flex shrink-0 items-start justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-foreground">
              {buddy.sheetTitlePrefix} {buddyTypeLabel(category, buddy)}
            </h3>
            <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{dl.postSheetSubtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            aria-label={common.close}
          >
            <X className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          <div className="rounded-2xl border border-border/70 bg-card/50 px-3 py-2.5">
            <p className="mb-2 text-[11px] font-medium text-muted-foreground">{buddy.sheetChooseBuddyType}</p>
            <div className="flex flex-wrap gap-1.5">
              {ALL_BUDDY_CATEGORIES.map((c) => {
                const active = c === category;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={cn(
                      "inline-flex items-center rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                      active
                        ? "border-classmates-blue-border bg-classmates-blue-soft text-classmates-blue"
                        : "border-[#E7E0D6]/90 bg-white text-foreground/78 dark:border-border/80 dark:bg-card dark:text-muted-foreground",
                    )}
                  >
                    {buddyTypeLabel(c, buddy)}
                  </button>
                );
              })}
            </div>
          </div>

          {isShared && enrolledCourses.length > 0 ? (
            <div className="rounded-2xl border border-border/70 bg-card/50 px-3 py-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[11px] font-medium text-muted-foreground">
                  {formatMessage(dl.postSheetCoursePicker, {
                    selected: selectedCourseIds.size,
                    total: enrolledCourses.length,
                  })}
                </p>
                <button
                  type="button"
                  className="text-[11px] font-medium text-classmates-blue hover:text-classmates-blue/80"
                  onClick={selectedCourseIds.size === enrolledCourses.length ? () => setSelectedCourseIds(new Set()) : selectAllCourses}
                >
                  {selectedCourseIds.size === enrolledCourses.length ? dl.postSheetDeselectAll : dl.postSheetSelectAll}
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {enrolledCourses.map((course) => {
                  const active = selectedCourseIds.has(course.id);
                  return (
                    <button
                      key={course.id}
                      type="button"
                      onClick={() => toggleCourse(course.id)}
                      className={cn(
                        "inline-flex items-center rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                        active
                          ? "border-classmates-blue-border bg-classmates-blue-soft text-classmates-blue"
                          : "border-[#E7E0D6]/90 bg-white text-foreground/78 dark:border-border/80 dark:bg-card dark:text-muted-foreground",
                      )}
                    >
                      {course.code ?? course.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : isShared && enrolledCourses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-amber-200/80 bg-amber-50/40 px-3 py-3 text-center text-[12px] text-muted-foreground">
              {dl.postSheetNeedEnroll}
            </div>
          ) : null}

          {isStudy ? (
            <div className="space-y-3 rounded-2xl border border-border/70 bg-card/50 px-3 py-2.5">
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                  {dl.postSheetStudyPurposeLabel}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {STUDY_PURPOSE_VALUES.map((p) => {
                    const active = studyPurposes.has(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => toggleStudyPurpose(p)}
                        className={cn(
                          "inline-flex items-center rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                          active
                            ? "border-classmates-blue-border bg-classmates-blue-soft text-classmates-blue"
                            : "border-[#E7E0D6]/90 bg-white text-foreground/78 dark:border-border/80 dark:bg-card dark:text-muted-foreground",
                        )}
                      >
                        {studyPurposeLabel(p, dl)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                  {dl.postSheetStudyTimeLabel}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {STUDY_TIME_SLOT_VALUES.map((t) => {
                    const active = studyTimeSlots.has(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleStudyTimeSlot(t)}
                        className={cn(
                          "inline-flex items-center rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                          active
                            ? "border-classmates-blue-border bg-classmates-blue-soft text-classmates-blue"
                            : "border-[#E7E0D6]/90 bg-white text-foreground/78 dark:border-border/80 dark:bg-card dark:text-muted-foreground",
                        )}
                      >
                        {studyTimeSlotLabel(t, dl)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                  {dl.postSheetStudyVenueLabel}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {STUDY_VENUE_VALUES.map((v) => {
                    const active = studyVenues.has(v);
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => toggleStudyVenue(v)}
                        className={cn(
                          "inline-flex items-center rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                          active
                            ? "border-classmates-blue-border bg-classmates-blue-soft text-classmates-blue"
                            : "border-[#E7E0D6]/90 bg-white text-foreground/78 dark:border-border/80 dark:bg-card dark:text-muted-foreground",
                        )}
                      >
                        {studyVenueLabel(v, dl)}
                      </button>
                    );
                  })}
                </div>
                {studyVenues.has("OTHER") ? (
                  <Input
                    value={studyVenueOtherNote}
                    onChange={(e) => setStudyVenueOtherNote(e.target.value)}
                    placeholder={dl.postSheetVenueOtherPlaceholder}
                    maxLength={CLASSMATE_POST_STUDY_VENUE_OTHER_NOTE_MAX}
                    className="mt-2 h-9 rounded-xl border-border/70 text-[13px]"
                  />
                ) : null}
              </div>
            </div>
          ) : null}

          {isMeals ? (
            <div className="space-y-3 rounded-2xl border border-border/70 bg-card/50 px-3 py-2.5">
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                  {dl.postSheetMealsVenueLabel}
                </p>
                <Input
                  value={mealVenueOtherNote}
                  onChange={(e) => setMealVenueOtherNote(e.target.value)}
                  placeholder={dl.postSheetMealsLocationPlaceholder}
                  maxLength={CLASSMATE_POST_MEALS_VENUE_OTHER_NOTE_MAX}
                  className="h-9 rounded-xl border-border/70 text-[13px]"
                  aria-describedby="discover-meals-location-hint"
                />
                <p
                  id="discover-meals-location-hint"
                  className="mt-1.5 text-[11px] leading-snug text-muted-foreground"
                >
                  {dl.postSheetMealsLocationHint}
                </p>
              </div>
            </div>
          ) : null}

          {isLanguage ? (
            <LanguageExchangePostFields
              dl={dl}
              languageOfferTags={languageOfferTags}
              languageOfferLevels={languageOfferLevels}
              languageTargets={languageTargets}
              defaultOfferProficiency={DEFAULT_LANGUAGE_OFFER_PROFICIENCY}
              toggleLanguageOffer={toggleLanguageOffer}
              setLanguageOfferLevel={setLanguageOfferLevel}
              toggleLanguageTarget={toggleLanguageTarget}
            />
          ) : null}

          {isSports ? (
            <SportsPostFieldCombobox
              dl={dl}
              sportTags={sportTags}
              sportOtherNote={sportOtherNote}
              onAddPresetTag={addSportPresetTag}
              onRemovePresetTag={removeSportPresetTag}
              onSetCustomNote={(note) => setSportOtherNote(note)}
              onClearCustomNote={() => setSportOtherNote("")}
            />
          ) : null}

          <div className="rounded-2xl border border-border/70 bg-card/50 px-3 py-2.5">
            <div className="mb-1.5 flex items-start justify-between gap-2">
              <p className="text-[11px] font-medium text-muted-foreground">{dl.postSheetTitleQuestion}</p>
              <p
                className={cn(
                  "shrink-0 text-[11px] font-normal tabular-nums leading-snug",
                  postFieldCharCountClassName(title.trim().length, CLASSMATE_POST_TITLE_MAX_LEN),
                )}
                aria-label={
                  title.trim().length <= CLASSMATE_POST_TITLE_MAX_LEN
                    ? formatMessage(dl.postCharCountRemaining, {
                        count: CLASSMATE_POST_TITLE_MAX_LEN - title.trim().length,
                      })
                    : undefined
                }
              >
                {formatMessage(dl.postCharCountCurrentMax, {
                  current: title.trim().length,
                  max: CLASSMATE_POST_TITLE_MAX_LEN,
                })}
              </p>
            </div>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={postPlaceholderForCategory(category, dl)}
              maxLength={CLASSMATE_POST_TITLE_MAX_LEN}
              className="h-11 rounded-xl border-border/70 text-[14px]"
            />
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/50 px-3 py-2.5">
            <div className="mb-1.5 flex items-start justify-between gap-2">
              <p className="text-[11px] font-medium text-muted-foreground">{dl.postSheetDetailsLabel}</p>
              <p
                className={cn(
                  "shrink-0 text-[11px] font-normal tabular-nums leading-snug",
                  postFieldCharCountClassName(body.trim().length, CLASSMATE_POST_BODY_MAX_LEN),
                )}
                aria-label={
                  body.trim().length <= CLASSMATE_POST_BODY_MAX_LEN
                    ? formatMessage(dl.postCharCountRemaining, {
                        count: CLASSMATE_POST_BODY_MAX_LEN - body.trim().length,
                      })
                    : undefined
                }
              >
                {formatMessage(dl.postCharCountCurrentMax, {
                  current: body.trim().length,
                  max: CLASSMATE_POST_BODY_MAX_LEN,
                })}
              </p>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={dl.postSheetDetailsPlaceholder}
              maxLength={CLASSMATE_POST_BODY_MAX_LEN}
              className="min-h-24 w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-[14px] outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </div>

          <ClassmatePostCreateImageRow
            urls={postImageUrls}
            onUrlsChange={setPostImageUrls}
            disabled={submitting}
            onError={setError}
          />

          <div className="rounded-2xl border border-border/70 bg-card/50 px-3 py-2.5">
            <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">{dl.postSheetExpiresLabel}</p>
            <div className="flex flex-wrap gap-2">
              <ExpiryOption
                label={dl.postExpiry3d}
                active={expiryPreset === "3d"}
                onClick={() => setExpiryPreset("3d")}
              />
              <ExpiryOption
                label={dl.postExpiry1w}
                active={expiryPreset === "1w"}
                onClick={() => setExpiryPreset("1w")}
              />
              <ExpiryOption
                label={dl.postExpiry1m}
                active={expiryPreset === "1m"}
                onClick={() => setExpiryPreset("1m")}
              />
              <ExpiryOption
                label={dl.postExpiryNever}
                active={expiryPreset === "never"}
                onClick={() => setExpiryPreset("never")}
              />
            </div>
          </div>

          {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
        </div>

        <div className="mt-4 flex shrink-0 gap-2">
          <Button type="button" variant="ghost" className="h-11 flex-1 rounded-xl" onClick={onClose}>
            {common.cancel}
          </Button>
          <Button
            type="button"
            className="h-11 flex-1 rounded-xl"
            onClick={() => void submit()}
            disabled={
              submitting ||
              !title.trim() ||
              (isShared && selectedCourseIds.size === 0) ||
              (isLanguage && languageOfferTags.size === 0 && languageTargets.size === 0) ||
              title.trim().length > CLASSMATE_POST_TITLE_MAX_LEN ||
              body.trim().length > CLASSMATE_POST_BODY_MAX_LEN
            }
          >
            {submitting ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                {dl.postSubmitting}
              </>
            ) : (
              <>
                <Edit3 className="mr-1.5 h-4 w-4" />
                {dl.postSubmitButton}
              </>
            )}
          </Button>
        </div>
      </div>
    </AppPushLayer>
  );
}

function postPlaceholderForCategory(category: ClassmatePostCategory, dl: AppMessages["discoverList"]) {
  switch (category) {
    case ClassmatePostCategory.SHARED_COURSES:
      return dl.postPlaceholderShared;
    case ClassmatePostCategory.STUDY:
      return dl.postPlaceholderStudy;
    case ClassmatePostCategory.MEALS:
      return dl.postPlaceholderMeals;
    case ClassmatePostCategory.LANGUAGE:
      return dl.postPlaceholderLanguage;
    case ClassmatePostCategory.SPORTS:
      return dl.postPlaceholderSports;
    default:
      return dl.postPlaceholderStudy;
  }
}

function ExpiryOption({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center rounded-full border px-3 text-[12px] font-medium transition-colors",
        active
          ? "border-classmates-blue-border bg-classmates-blue-soft text-classmates-blue"
          : "border-[#E7E0D6]/90 bg-white text-foreground/78",
      )}
    >
      {label}
    </button>
  );
}

function expiryPresetToDate(preset: PostExpiryPreset) {
  switch (preset) {
    case "3d":
      return endOfDay(addDays(new Date(), 3));
    case "1m":
      return endOfDay(addDays(new Date(), 30));
    case "never":
      return new Date("2099-12-31T23:59:59.999Z");
    default:
      return endOfDay(addDays(new Date(), 7));
  }
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}
