"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import Link from "next/link";
import type { Route } from "next";
import type { RefObject } from "react";
import { addDays, format } from "date-fns";
import { useEffect, useRef, useState } from "react";
import {
  BookUser,
  Clock,
  Edit3,
  Dumbbell,
  Languages,
  Link2,
  Loader2,
  NotebookPen,
  Plus,
  Search,
  SlidersHorizontal,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ClassmatePostCategory,
  type LanguageProficiency,
  type LanguageTag,
  type UserGender,
} from "@prisma/client";

import {
  ClassmatesPersonRow,
  CLASSMATES_PERSON_ROW_AVATAR_RING_DISCOVER,
} from "@/components/classmates/classmates-person-row";
import { DiscoverMessageButton } from "@/components/discover/discover-message-button";
import { AppPushLayer } from "@/components/ui/app-push-layer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LinkButton } from "@/components/ui/link-button";
import { UserGenderCardIcon } from "@/components/ui/user-gender-icon";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { LANGUAGE_TAG_LABEL } from "@/lib/constants/languages";
import {
  buildViewerCourseMatchIndex,
  courseMatchesViewer,
  type ViewerCourseMatchIndex,
} from "@/lib/discover/viewer-course-match";
import { SCENE_TAB_PALETTE, type SceneTabPalette } from "@/lib/discover/scene-palette";
import { cn } from "@/lib/utils";

type SceneKind = "shared" | "study" | "meals" | "language" | "sports";
type PostExpiryPreset = "3d" | "1w" | "1m" | "never";

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

export type DiscoverPostRow = {
  id: string;
  category: ClassmatePostCategory;
  city: string;
  title: string;
  body: string | null;
  expiresAt: Date;
  isOwn: boolean;
  userId: string;
  nickname: string;
  gender: UserGender;
  avatarUrl: string | null;
  major: string | null;
  semester: number | null;
  school: string | null;
  languages: Array<{ tag: LanguageTag; proficiency: LanguageProficiency }>;
  verifiedStudent: boolean;
  studentVerificationStatus:
    | "UNVERIFIED"
    | "EMAIL_PENDING"
    | "VERIFIED"
    | "MANUAL_REVIEW_REQUIRED"
    | "REJECTED";
  linkedCourses?: Array<{ id: string; code: string | null; name: string }>;
};

export type EnrolledCourseOption = { id: string; code: string | null; name: string };

type UserSearchHit = {
  id: string;
  username: string;
  nickname: string | null;
  gender: UserGender;
  avatarUrl: string | null;
  major: string | null;
  semester: number | null;
  school: string | null;
  languages?: LanguageTag[];
  verifiedStudent: boolean;
  studentVerificationStatus:
    | "UNVERIFIED"
    | "EMAIL_PENDING"
    | "VERIFIED"
    | "MANUAL_REVIEW_REQUIRED"
    | "REJECTED";
  sharedCourseCount: number;
  hasActiveConnection: boolean;
};

export function DiscoverList({
  rows,
  posts,
  allowSearch = true,
  savedCourseCount,
  enrolledCourses = [],
}: {
  rows: DiscoverRow[];
  posts: DiscoverPostRow[];
  /** When false (logged-out Discover tab), hide people search — the API requires a signed-in student context. */
  allowSearch?: boolean;
  /** Saved courses count — used to suggest “Add a course” when the shared tab is empty. */
  savedCourseCount?: number;
  enrolledCourses?: EnrolledCourseOption[];
}) {
  const [query, setQuery] = useState("");
  const searchParams = useSearchParams();
  const validScenes: SceneKind[] = ["shared", "study", "meals", "language", "sports"];
  const paramScene = searchParams.get("tab") as SceneKind | null;
  const [scene, setSceneState] = useState<SceneKind>(
    paramScene && validScenes.includes(paramScene) ? paramScene : "shared",
  );
  const router = useRouter();

  const setScene = (s: SceneKind) => {
    setSceneState(s);
    const url = new URL(window.location.href);
    if (s === "shared") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", s);
    }
    window.history.replaceState(null, "", url.toString());
  };

  const [schoolFilter, setSchoolFilter] = useState<string>("All");
  const [majorFilter, setMajorFilter] = useState<string>("All");
  const [languageFilter, setLanguageFilter] = useState<string>("All");
  const [semesterFilter, setSemesterFilter] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const viewerCourseMatchIndex = buildViewerCourseMatchIndex(enrolledCourses);

  const trimmed = query.trim();
  const searchActive = allowSearch && trimmed.length >= 2;
  const filterPeople = rows
    .map((row) => ({
      school: row.school,
      major: row.major,
      languageTags: row.languages.map((l) => l.tag),
      semester: row.semester,
      studentVerificationStatus: row.studentVerificationStatus,
    }))
    .concat(
      posts.map((post) => ({
        school: post.school,
        major: post.major,
        languageTags: post.languages.map((l) => l.tag),
        semester: post.semester,
        studentVerificationStatus: post.studentVerificationStatus,
      })),
    );
  const schoolOptions = Array.from(
    new Set(filterPeople.map((row) => row.school).filter((school): school is string => Boolean(school))),
  ).sort();
  const majorOptions = Array.from(
    new Set(filterPeople.map((row) => row.major).filter((major): major is string => Boolean(major))),
  ).sort();
  const languageOptions = Array.from(
    new Set(
      filterPeople.flatMap((row) => row.languageTags).filter((language): language is LanguageTag => Boolean(language)),
    ),
  ).sort();
  const semesterOptions = Array.from(
    new Set(filterPeople.map((row) => row.semester).filter((semester): semester is number => Boolean(semester))),
  ).sort((a, b) => a - b);

  const filteredRows = rows.filter((row) => passesFilters(row, {
    schoolFilter,
    majorFilter,
    languageFilter,
    semesterFilter,
    statusFilter,
  }));
  const filteredPosts = posts.filter((post) => passesFilters(post, {
    schoolFilter,
    majorFilter,
    languageFilter,
    semesterFilter,
    statusFilter,
  }));
  const sceneRows = filteredRows.filter((row) => matchesScene(row, scene));
  const scenePosts = filteredPosts
    .filter((post) => matchesPostScene(post, scene))
    .sort((a, b) => {
      if (a.isOwn !== b.isOwn) return a.isOwn ? -1 : 1;
      return new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime();
    });

  const activeChips = [
    schoolFilter !== "All" ? schoolFilter : null,
    majorFilter !== "All" ? majorFilter : null,
    languageFilter !== "All" ? languageFilter : null,
    semesterFilter !== "All" ? `Sem ${semesterFilter}` : null,
    statusFilter !== "All" ? statusFilter : null,
  ].filter((value): value is string => Boolean(value));

  if (!allowSearch) {
    return (
      <p className="rounded-2xl border border-dashed border-classmates-teal-border/60 bg-classmates-teal-soft/60 px-4 py-6 text-center text-[13px] text-classmates-teal">
        Sign in to search classmates by name or @handle.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-5 gap-2">
        <SceneTab
          label="Shared courses"
          icon={<BookUser className="h-[1.45rem] w-[1.45rem] sm:h-6 sm:w-6" strokeWidth={1.9} aria-hidden />}
          palette="teal"
          active={scene === "shared"}
          onClick={() => setScene("shared")}
        />
        <SceneTab
          label="Study"
          icon={<NotebookPen className="h-[1.45rem] w-[1.45rem] sm:h-6 sm:w-6" strokeWidth={1.9} aria-hidden />}
          palette="indigo"
          active={scene === "study"}
          onClick={() => setScene("study")}
        />
        <SceneTab
          label="Meals"
          icon={<UtensilsCrossed className="h-[1.45rem] w-[1.45rem] sm:h-6 sm:w-6" strokeWidth={1.9} aria-hidden />}
          palette="amber"
          active={scene === "meals"}
          onClick={() => setScene("meals")}
        />
        <SceneTab
          label="Language"
          icon={<Languages className="h-[1.45rem] w-[1.45rem] sm:h-6 sm:w-6" strokeWidth={1.9} aria-hidden />}
          palette="violet"
          active={scene === "language"}
          onClick={() => setScene("language")}
        />
        <SceneTab
          label="Sports"
          icon={<Dumbbell className="h-[1.45rem] w-[1.45rem] sm:h-6 sm:w-6" strokeWidth={1.9} aria-hidden />}
          palette="rose"
          active={scene === "sports"}
          onClick={() => setScene("sports")}
        />
      </div>

      {activeChips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {activeChips.map((chip) => (
            <span
              key={chip}
              className="inline-flex items-center rounded-full border border-classmates-teal-border/70 bg-classmates-teal-soft px-2.5 py-1 text-[11px] font-medium text-classmates-teal"
            >
              {chip}
            </span>
          ))}
        </div>
      ) : null}

      <SearchBar
        value={query}
        onChange={setQuery}
        onClear={() => {
          setQuery("");
          inputRef.current?.focus();
        }}
        inputRef={inputRef}
        onOpenFilters={() => setFiltersOpen(true)}
      />

      {searchActive ? (
        <UserSearchResults query={trimmed} />
      ) : (
        <RecommendationSurface
          rows={sceneRows}
          posts={scenePosts}
          scene={scene}
          onOpenPost={() => setPostOpen(true)}
          savedCourseCount={savedCourseCount}
          viewerCourseMatchIndex={viewerCourseMatchIndex}
        />
      )}

      <AppPushLayer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        zClassName="z-40"
        panelClassName="w-[min(100vw,28rem)] border-0 bg-classmates-warm-alt shadow-none dark:shadow-none"
      >
        <div className="flex h-full min-h-0 flex-col px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="shrink-0">
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-border/80" />
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-foreground">Filter classmates</h3>
              <button
                type="button"
                onClick={() => {
                  setSchoolFilter("All");
                  setMajorFilter("All");
                  setLanguageFilter("All");
                  setSemesterFilter("All");
                  setStatusFilter("All");
                }}
                className="text-[12px] font-medium text-classmates-blue hover:text-classmates-blue/80"
              >
                Reset
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            <FilterSection
              label="School"
              options={["All", ...schoolOptions]}
              value={schoolFilter}
              onChange={setSchoolFilter}
            />
            <FilterSection
              label="Major"
              options={["All", ...majorOptions]}
              value={majorFilter}
              onChange={setMajorFilter}
            />
            <FilterSection
              label="Language"
              options={["All", ...languageOptions]}
              value={languageFilter}
              onChange={setLanguageFilter}
              renderLabel={(v) => (v === "All" ? "All" : LANGUAGE_TAG_LABEL[v as LanguageTag] ?? v)}
            />
            <FilterSection
              label="Semester"
              options={["All", ...semesterOptions.map((value) => String(value))]}
              value={semesterFilter}
              onChange={setSemesterFilter}
              renderLabel={(value) => (value === "All" ? "All" : `Sem ${value}`)}
            />
            <FilterSection
              label="Status"
              options={["All", "Verified", "Pending", "Unverified"]}
              value={statusFilter}
              onChange={setStatusFilter}
              renderLabel={(v) => (v === "Pending" ? "Verifying" : v)}
            />
          </div>

          <button
            type="button"
            onClick={() => setFiltersOpen(false)}
            className="mt-auto shrink-0 inline-flex h-11 w-full items-center justify-center rounded-full bg-classmates-blue text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-classmates-blue/90 active:bg-classmates-blue/95"
          >
            Done
          </button>
        </div>
      </AppPushLayer>

      <CreatePostSheet
        open={postOpen}
        scene={scene}
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

function SceneTab({
  label,
  icon,
  palette,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  palette: SceneTabPalette;
  active: boolean;
  onClick: () => void;
}) {
  const p = SCENE_TAB_PALETTE[palette];

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "relative flex h-[4.35rem] min-w-0 flex-col items-center justify-center overflow-hidden rounded-xl border px-0.5 pb-1 pt-0.5 text-center text-[9px] font-medium leading-tight transition-all duration-200 ease-out sm:h-[4.5rem] sm:rounded-[1rem] sm:text-[10px]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-classmates-azure/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "active:scale-[0.97]",
        active ? p.surfaceActive : p.surface,
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0.5 bottom-[1.45rem] inline-flex items-center justify-center transition-colors duration-200 sm:bottom-[1.5rem]",
          active ? p.iconActive : p.icon,
        )}
      >
        {icon}
      </span>
      <span
        className={cn(
          "relative z-[1] mt-auto block max-w-[100%] whitespace-normal px-0.5 text-center leading-[1.12] transition-colors duration-200",
          active ? cn("font-semibold", p.labelActive) : p.label,
        )}
      >
        {label}
      </span>
    </button>
  );
}

function matchesScene(row: DiscoverRow, scene: SceneKind) {
  const bio = row.bio?.toLowerCase() ?? "";
  const reasons = row.primaryReason.toLowerCase();
  const languages = row.languages.map((l) => l.tag.toUpperCase());

  if (scene === "shared") {
    return true;
  }

  if (scene === "study") {
    return (
      reasons.includes("study") ||
      reasons.includes("exam") ||
      bio.includes("study") ||
      bio.includes("exam") ||
      bio.includes("paper") ||
      bio.includes("whiteboard") ||
      bio.includes("library")
    );
  }

  if (scene === "meals") {
    return (
      reasons.includes("eat") ||
      bio.includes("coffee") ||
      bio.includes("lunch") ||
      bio.includes("meal") ||
      bio.includes("after class")
    );
  }

  if (scene === "language") {
    return languages.length >= 2 || bio.includes("language");
  }

  return (
    bio.includes("basketball") ||
    bio.includes("football") ||
    bio.includes("soccer") ||
    bio.includes("running") ||
    bio.includes("gym") ||
    bio.includes("hiking") ||
    bio.includes("sport")
  );
}

function matchesPostScene(post: DiscoverPostRow, scene: SceneKind) {
  return post.category === sceneToCategory(scene);
}

function FilterSection({
  label,
  options,
  value,
  onChange,
  renderLabel,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  renderLabel?: (value: string) => string;
}) {
  return (
    <div className="space-y-2 py-2.5">
      <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = option === value;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              className={cn(
                "inline-flex h-9 items-center rounded-full border px-3 text-[12px] font-medium transition-colors",
                active
                  ? "border-classmates-blue-border bg-classmates-blue-soft text-classmates-blue"
                  : "border-[#E7E0D6]/90 bg-white text-foreground/80",
              )}
            >
              {renderLabel ? renderLabel(option) : option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SearchBar({
  value,
  onChange,
  onClear,
  inputRef,
  onOpenFilters,
}: {
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  onOpenFilters: () => void;
}) {
  const hasValue = value.length > 0;
  return (
    <div className="relative min-w-0">
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground"
        strokeWidth={2.25}
        aria-hidden
      />
      <Input
        ref={inputRef}
        placeholder="Search classmates"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-11 w-full rounded-2xl border-[#E7E0D6]/90 bg-white pl-11 text-[15px] shadow-sm",
          hasValue ? "pr-[5.25rem]" : "pr-14",
        )}
        inputMode="search"
        autoComplete="off"
      />
      <div className="pointer-events-none absolute inset-y-0 right-1.5 z-10 flex items-center gap-1">
        <div className="pointer-events-auto flex items-center gap-1">
          {hasValue ? (
            <button
              type="button"
              onClick={onClear}
              aria-label="Clear search"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" strokeWidth={2.25} />
            </button>
          ) : null}
          <span className="h-5 w-px shrink-0 bg-border/55" aria-hidden />
          <button
            type="button"
            onClick={onOpenFilters}
            aria-label="Filter classmates"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <SlidersHorizontal className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

function RecommendationSurface({
  rows,
  posts,
  scene,
  onOpenPost,
  savedCourseCount,
  viewerCourseMatchIndex,
}: {
  rows: DiscoverRow[];
  posts: DiscoverPostRow[];
  scene: SceneKind;
  onOpenPost: () => void;
  savedCourseCount?: number;
  viewerCourseMatchIndex: ViewerCourseMatchIndex;
}) {
  const showingShared = scene === "shared";
  const hasItems = showingShared ? rows.length > 0 || posts.length > 0 : posts.length > 0;

  if (!hasItems) {
    return (
      <div className="space-y-3">
        <SceneHeader scene={scene} onOpenPost={onOpenPost} />
        <div className="rounded-2xl border border-[#E7E0D6] bg-white px-4 py-6 text-center text-[13px] text-muted-foreground shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
          {showingShared
            ? "No recommendations or posts yet. Tap Post to say what you're looking for in shared courses, or check back as more classmates join."
            : "No posts in this category yet. Be the first to share what you're looking for."}
          {showingShared && savedCourseCount === 0 ? (
            <div className="mt-4 flex justify-center">
              <LinkButton href={"/courses/add" as Route} size="sm">
                Add a course
              </LinkButton>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <SceneHeader scene={scene} onOpenPost={onOpenPost} />

      <div className="space-y-2.5">
        {showingShared ? (
          <>
            {posts.map((post) => (
              <PostRow
                key={post.id}
                post={post}
                scene={scene}
                viewerCourseMatchIndex={viewerCourseMatchIndex}
              />
            ))}
            {rows.map((r) => (
              <RecommendationRow key={r.userId} row={r} scene={scene} />
            ))}
          </>
        ) : (
          posts.map((post) => (
            <PostRow
              key={post.id}
              post={post}
              scene={scene}
              viewerCourseMatchIndex={viewerCourseMatchIndex}
            />
          ))
        )}
      </div>
    </div>
  );
}

function SceneHeader({
  scene,
  onOpenPost,
}: {
  scene: SceneKind;
  onOpenPost?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-1">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          {sceneHeading(scene)}
        </h3>
        <p className="text-[12px] leading-snug text-muted-foreground">
          {sceneDescription(scene)}
        </p>
      </div>
      {onOpenPost ? (
        <button
          type="button"
          onClick={onOpenPost}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-classmates-blue px-4 text-[13px] font-semibold text-white shadow-[0_4px_14px_-3px_rgba(37,99,235,0.35)] transition-all hover:scale-[1.03] hover:shadow-[0_6px_20px_-3px_rgba(37,99,235,0.4)] active:scale-[0.97]"
        >
          <Plus className="h-[18px] w-[18px]" strokeWidth={2.5} />
          Post
        </button>
      ) : null}
    </div>
  );
}

function sceneHeading(scene: SceneKind) {
  switch (scene) {
    case "shared":
      return "Shared courses";
    case "study":
      return "Study together";
    case "meals":
      return "Meals and coffee";
    case "language":
      return "Language exchange";
    case "sports":
      return "Sports";
  }
}

function sceneDescription(scene: SceneKind) {
  switch (scene) {
    case "shared":
      return "Post what you want in courses you share, plus people ranked by same-class overlap.";
    case "study":
      return "Posts from students actively looking for study partners and review sessions.";
    case "meals":
      return "Students posting about lunch, coffee, or a quick break after class.";
    case "language":
      return "Students looking for language exchange or conversation practice.";
    case "sports":
      return "Posts about sports, gym buddies, and active meetups around campus.";
  }
}

/**
 * Free-text user search. Debounced ~200ms and aborts in-flight requests when
 * the user types again — keeps keystrokes feeling immediate even on slower
 * networks and avoids stale results racing fresh ones.
 */
function UserSearchResults({ query }: { query: string }) {
  const [hits, setHits] = useState<UserSearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let active = true;
    const ac = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      apiFetch(`/api/users/search?q=${encodeURIComponent(query)}`, {
        signal: ac.signal,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((payload) => {
          if (!active) return;
          const list = (payload?.data?.hits ?? []) as UserSearchHit[];
          setHits(list);
        })
        .catch(() => {
          /* swallow aborts */
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 200);

    return () => {
      active = false;
      ac.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  if (searching && hits.length === 0) {
    return (
      <div className="rounded-2xl border border-[#E7E0D6] bg-white px-4 py-6 text-center text-[13px] text-muted-foreground shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
        Searching…
      </div>
    );
  }

  if (!searching && hits.length === 0) {
    return (
      <div className="rounded-2xl border border-[#E7E0D6] bg-white px-4 py-6 text-center text-[13px] text-muted-foreground shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
        No one matches &ldquo;{query}&rdquo; at your school.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {hits.map((hit) => (
        <UserSearchRow key={hit.id} hit={hit} />
      ))}
    </div>
  );
}

function UserSearchRow({ hit }: { hit: UserSearchHit }) {
  const name = hit.nickname?.trim() || hit.username;
  const meta = [hit.major, hit.semester ? `sem ${hit.semester}` : null]
    .filter(Boolean)
    .join(" · ");
  const profileHref = `/users/${hit.id}?returnTo=%2Fdiscover` as Route;

  return (
    <ClassmatesPersonRow
      avatarHref={profileHref}
      avatarUrl={hit.avatarUrl}
      profileAriaLabel={`View ${name}'s profile`}
      name={name}
      titleAdornment={
        <>
          <VerifiedBadge
            size="xs"
            school={hit.school}
            verifiedStudent={hit.verifiedStudent}
            status={hit.studentVerificationStatus}
          />
          <UserGenderCardIcon gender={hit.gender} className="shrink-0" />
          {hit.hasActiveConnection ? (
            <span className="shrink-0 rounded-full border border-classmates-teal-border/80 bg-classmates-teal-soft px-2 py-0.5 text-[10px] font-semibold text-classmates-teal">
              chatting
            </span>
          ) : null}
        </>
      }
      body={
        <>
          <p className="mt-1 truncate text-[12px] leading-snug text-muted-foreground">
            @{hit.username}
            {meta ? <span> · {meta}</span> : null}
          </p>
          {hit.sharedCourseCount > 0 ? (
            <p className="mt-1 text-[11px] font-medium text-classmates-blue">
              {hit.sharedCourseCount}{" "}
              {hit.sharedCourseCount === 1 ? "shared course" : "shared courses"}
            </p>
          ) : null}
        </>
      }
      action={
        <DiscoverMessageButton
          peerId={hit.id}
          tone="subtle"
          hasExistingChat={hit.hasActiveConnection}
          className="w-full justify-center sm:w-auto"
        />
      }
    />
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

function RecommendationRow({ row, scene }: { row: DiscoverRow; scene: SceneKind }) {
  const meta = [row.major, row.semester ? `sem ${row.semester}` : null]
    .filter(Boolean)
    .join(" · ");
  const sharedCount = row.sharedCourses.length;
  const profileHref = `/users/${row.userId}?returnTo=%2Fdiscover` as Route;
  const isSharedScene = scene === "shared";
  const hasSharedCourses = isSharedScene && sharedCount > 0;

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
      titleAdornment={
        <>
          <VerifiedBadge
            size="xs"
            school={row.school}
            verifiedStudent={row.verifiedStudent}
            status={row.studentVerificationStatus}
          />
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
          ) : isSharedScene ? (
            /* In shared scene but no confirmed shared courses — show primary course */
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
          ) : null}
        </>
      }
      action={
        <div className="flex w-full flex-col items-stretch gap-1.5 sm:items-end">
          {hasSharedCourses ? (
            <p className="text-center text-[10px] font-semibold tabular-nums text-classmates-teal dark:text-teal-300 sm:text-right">
              {sharedCount === 1 ? "1 course in common" : `${sharedCount} courses in common`}
            </p>
          ) : null}
          <DiscoverMessageButton
            peerId={row.userId}
            courseId={row.primaryCourse.id}
            tone={hasSharedCourses ? "soft" : "subtle"}
            hasExistingChat={Boolean(row.connectionId)}
            className="w-full justify-center sm:w-auto"
          />
        </div>
      }
    />
  );
}

function PostRow({
  post,
  scene,
  viewerCourseMatchIndex,
}: {
  post: DiscoverPostRow;
  scene: SceneKind;
  viewerCourseMatchIndex: ViewerCourseMatchIndex;
}) {
  const meta = [post.major, post.semester ? `sem ${post.semester}` : null]
    .filter(Boolean)
    .join(" · ");
  const postPath = `/discover/posts/${post.id}`;
  const returnTo = scene === "shared" ? "/discover" : `/discover?tab=${scene}`;
  const postDetailHref =
    `${postPath}?returnTo=${encodeURIComponent(returnTo)}` as Route;

  return (
    <ClassmatesPersonRow
      avatarHref={postDetailHref}
      contentHref={postDetailHref}
      avatarUrl={post.avatarUrl}
      profileAriaLabel={
        post.isOwn ? "View your post" : `View ${post.nickname}'s post`
      }
      name={post.nickname}
      titleAdornment={
        <>
          <VerifiedBadge
            size="xs"
            school={post.school}
            verifiedStudent={post.verifiedStudent}
            status={post.studentVerificationStatus}
          />
          <UserGenderCardIcon gender={post.gender} className="shrink-0" />
          {post.isOwn ? (
            <span className="shrink-0 rounded-full border border-classmates-blue-border/80 bg-classmates-blue-soft px-2 py-0.5 text-[10px] font-semibold text-classmates-blue">
              your post
            </span>
          ) : null}
        </>
      }
      body={
        <>
          {meta ? (
            <p className="mt-1 truncate text-[12px] leading-snug text-muted-foreground">{meta}</p>
          ) : null}
          <p className="mt-1 text-[12px] font-medium leading-snug text-foreground/90">{post.title}</p>
          {post.body ? (
            <p className="mt-0.5 text-[12px] leading-snug text-foreground/75">{post.body}</p>
          ) : null}
          {post.linkedCourses && post.linkedCourses.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {post.linkedCourses.map((c) => {
                const matchesViewer = courseMatchesViewer(c, viewerCourseMatchIndex);
                return (
                  <span
                    key={c.id}
                    className={cn(
                      "inline-flex max-w-[11rem] items-center gap-1 truncate rounded-full px-2 py-0.5 text-[10px] tabular-nums",
                      matchesViewer
                        ? "border-2 border-dashed border-classmates-teal-border bg-classmates-teal-soft/70 font-semibold text-classmates-teal dark:border-teal-500/55 dark:bg-teal-950/35 dark:text-teal-200"
                        : "border border-classmates-blue-border/60 bg-classmates-blue-soft/50 font-medium text-classmates-blue",
                    )}
                    title={
                      matchesViewer
                        ? `${c.name} — same course as yours (code or enrollment)`
                        : c.name
                    }
                  >
                    {matchesViewer ? (
                      <Link2 className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
                    ) : null}
                    <span className="truncate">{c.code ?? c.name}</span>
                  </span>
                );
              })}
            </div>
          ) : null}
          <p className="mt-1 text-[10.5px] text-muted-foreground">
            {isNeverExpiry(post.expiresAt)
              ? "No expiry"
              : `Active until ${format(new Date(post.expiresAt), "MMM d")}`}
          </p>
        </>
      }
      action={
        <DiscoverMessageButton
          peerId={post.userId}
          returnTo={postPath}
          tone="subtle"
          hasExistingChat={false}
          insightPostId={post.isOwn ? undefined : post.id}
          className="w-full justify-center sm:w-auto"
        />
      }
    />
  );
}

function sceneToCategory(scene: SceneKind): ClassmatePostCategory {
  switch (scene) {
    case "shared":
      return ClassmatePostCategory.SHARED_COURSES;
    case "study":
      return ClassmatePostCategory.STUDY;
    case "meals":
      return ClassmatePostCategory.MEALS;
    case "language":
      return ClassmatePostCategory.LANGUAGE;
    case "sports":
      return ClassmatePostCategory.SPORTS;
  }
}

function passesFilters(
  value: {
    school: string | null;
    major: string | null;
    languages: Array<{ tag: LanguageTag; proficiency: LanguageProficiency }>;
    semester: number | null;
    studentVerificationStatus:
      | "UNVERIFIED"
      | "EMAIL_PENDING"
      | "VERIFIED"
      | "MANUAL_REVIEW_REQUIRED"
      | "REJECTED";
  },
  filters: {
    schoolFilter: string;
    majorFilter: string;
    languageFilter: string;
    semesterFilter: string;
    statusFilter: string;
  },
) {
  if (filters.schoolFilter !== "All" && value.school !== filters.schoolFilter) return false;
  if (filters.majorFilter !== "All" && value.major !== filters.majorFilter) return false;
  if (
    filters.languageFilter !== "All" &&
    !value.languages.some((l) => l.tag === filters.languageFilter)
  ) {
    return false;
  }
  if (filters.semesterFilter !== "All" && value.semester !== Number(filters.semesterFilter)) return false;
  if (filters.statusFilter === "Verified" && value.studentVerificationStatus !== "VERIFIED") return false;
  if (
    filters.statusFilter === "Pending" &&
    value.studentVerificationStatus !== "EMAIL_PENDING" &&
    value.studentVerificationStatus !== "MANUAL_REVIEW_REQUIRED"
  ) {
    return false;
  }
  if (
    filters.statusFilter === "Unverified" &&
    value.studentVerificationStatus !== "UNVERIFIED" &&
    value.studentVerificationStatus !== "REJECTED"
  ) {
    return false;
  }
  return true;
}

function CreatePostSheet({
  open,
  scene,
  enrolledCourses = [],
  onClose,
  onCreated,
}: {
  open: boolean;
  scene: SceneKind;
  enrolledCourses?: EnrolledCourseOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [expiryPreset, setExpiryPreset] = useState<PostExpiryPreset>("1w");
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSharedScene = scene === "shared";

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setBody("");
    setError(null);
    setExpiryPreset("1w");
    setSelectedCourseIds(new Set());
  }, [open, scene]);

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

  async function submit() {
    if (submitting) return;
    const trimmedTitle = title.trim();
    if (isSharedScene && selectedCourseIds.size === 0) {
      setError("Select at least one course to share.");
      return;
    }
    if (!trimmedTitle) {
      setError("Add a short title so classmates know what you’re looking for.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch("/api/classmate-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: "Munich",
          category: sceneToCategory(scene),
          title: trimmedTitle,
          body: body.trim(),
          expiresAt: expiryPresetToDate(expiryPreset).toISOString(),
          ...(isSharedScene && selectedCourseIds.size > 0
            ? { courseIds: [...selectedCourseIds] }
            : {}),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to create post.");
      }
      setSubmitting(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create post.");
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
            <h3 className="text-[15px] font-semibold text-foreground">Post in {sceneHeading(scene)}</h3>
            <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
              Share a short note about who or what you&apos;re looking for.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          {isSharedScene && enrolledCourses.length > 0 ? (
            <div className="rounded-2xl border border-border/70 bg-card/50 px-3 py-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[11px] font-medium text-muted-foreground">
                  Which courses? ({selectedCourseIds.size}/{enrolledCourses.length})
                </p>
                <button
                  type="button"
                  className="text-[11px] font-medium text-classmates-blue hover:text-classmates-blue/80"
                  onClick={selectedCourseIds.size === enrolledCourses.length ? () => setSelectedCourseIds(new Set()) : selectAllCourses}
                >
                  {selectedCourseIds.size === enrolledCourses.length ? "Deselect all" : "Select all"}
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
          ) : isSharedScene && enrolledCourses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-amber-200/80 bg-amber-50/40 px-3 py-3 text-center text-[12px] text-muted-foreground">
              You need to enroll in at least one course before posting here.
            </div>
          ) : null}

          <div className="rounded-2xl border border-border/70 bg-card/50 px-3 py-2.5">
            <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">What are you looking for?</p>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={postPlaceholder(scene)}
              className="h-11 rounded-xl border-border/70 text-[14px]"
            />
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/50 px-3 py-2.5">
            <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Optional details</p>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Add a little context if helpful."
              className="min-h-24 w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-[14px] outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/50 px-3 py-2.5">
            <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Expires</p>
            <div className="flex flex-wrap gap-2">
              <ExpiryOption
                label="3 days"
                active={expiryPreset === "3d"}
                onClick={() => setExpiryPreset("3d")}
              />
              <ExpiryOption
                label="1 week"
                active={expiryPreset === "1w"}
                onClick={() => setExpiryPreset("1w")}
              />
              <ExpiryOption
                label="1 month"
                active={expiryPreset === "1m"}
                onClick={() => setExpiryPreset("1m")}
              />
              <ExpiryOption
                label="Never"
                active={expiryPreset === "never"}
                onClick={() => setExpiryPreset("never")}
              />
            </div>
          </div>

          {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
        </div>

        <div className="mt-4 flex shrink-0 gap-2">
          <Button type="button" variant="ghost" className="h-11 flex-1 rounded-xl" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            className="h-11 flex-1 rounded-xl"
            onClick={() => void submit()}
            disabled={submitting || !title.trim() || (isSharedScene && selectedCourseIds.size === 0)}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Posting…
              </>
            ) : (
              <>
                <Edit3 className="mr-1.5 h-4 w-4" />
                Post
              </>
            )}
          </Button>
        </div>
      </div>
    </AppPushLayer>
  );
}

function postPlaceholder(scene: SceneKind) {
  switch (scene) {
    case "shared":
      return "Looking for a study partner in Linear Algebra (MA0902)";
    case "study":
      return "Looking for someone to review IN2064 this week";
    case "meals":
      return "Anyone up for lunch after class near Garching?";
    case "language":
      return "Want to practice German over coffee";
    case "sports":
      return "Looking for a basketball buddy this weekend";
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

function isNeverExpiry(value: Date) {
  return new Date(value).getUTCFullYear() >= 2099;
}
