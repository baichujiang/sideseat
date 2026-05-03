"use client";

import Link from "next/link";
import type { Route } from "next";
import type { RefObject } from "react";
import { addDays, format } from "date-fns";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Coffee,
  Edit3,
  Dumbbell,
  Languages,
  Loader2,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { ClassmatePostCategory } from "@prisma/client";

import { DiscoverMessageButton } from "@/components/discover/discover-message-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { cn } from "@/lib/utils";

type SceneKind = "shared" | "study" | "meals" | "language" | "sports";
type PostExpiryPreset = "3d" | "1w" | "1m" | "never";

type CourseRef = {
  id: string;
  code: string | null;
  name: string;
};

type SharedCourse = CourseRef;

export type DiscoverRow = {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  major: string | null;
  semester: number | null;
  bio: string | null;
  school: string | null;
  languages: string[];
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
  avatarUrl: string | null;
  major: string | null;
  semester: number | null;
  school: string | null;
  languages: string[];
  verifiedStudent: boolean;
  studentVerificationStatus:
    | "UNVERIFIED"
    | "EMAIL_PENDING"
    | "VERIFIED"
    | "MANUAL_REVIEW_REQUIRED"
    | "REJECTED";
};

type UserSearchHit = {
  id: string;
  username: string;
  nickname: string | null;
  avatarUrl: string | null;
  major: string | null;
  semester: number | null;
  school: string | null;
  languages?: string[];
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
}: {
  rows: DiscoverRow[];
  posts: DiscoverPostRow[];
  /** When false (logged-out Discover tab), hide people search — the API requires a signed-in student context. */
  allowSearch?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [scene, setScene] = useState<SceneKind>("shared");
  const [schoolFilter, setSchoolFilter] = useState<string>("All");
  const [majorFilter, setMajorFilter] = useState<string>("All");
  const [languageFilter, setLanguageFilter] = useState<string>("All");
  const [semesterFilter, setSemesterFilter] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();

  const trimmed = query.trim();
  const searchActive = allowSearch && trimmed.length >= 2;
  const filterPeople = rows.map((row) => ({
    school: row.school,
    major: row.major,
    languages: row.languages,
    semester: row.semester,
    studentVerificationStatus: row.studentVerificationStatus,
  })).concat(
    posts.map((post) => ({
      school: post.school,
      major: post.major,
      languages: post.languages,
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
    new Set(filterPeople.flatMap((row) => row.languages).filter((language): language is string => Boolean(language))),
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
      <p className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-[13px] text-muted-foreground">
        Sign in to search classmates by name or @handle.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-5 gap-1.5">
        <SceneTab
          label="Shared courses"
          icon={<BookOpen className="h-7 w-7" strokeWidth={1.9} />}
          active={scene === "shared"}
          onClick={() => setScene("shared")}
        />
        <SceneTab
          label="Study"
          icon={<BookOpen className="h-7 w-7" strokeWidth={1.9} />}
          active={scene === "study"}
          onClick={() => setScene("study")}
        />
        <SceneTab
          label="Meals"
          icon={<Coffee className="h-7 w-7" strokeWidth={1.9} />}
          active={scene === "meals"}
          onClick={() => setScene("meals")}
        />
        <SceneTab
          label="Language"
          icon={<Languages className="h-7 w-7" strokeWidth={1.9} />}
          active={scene === "language"}
          onClick={() => setScene("language")}
        />
        <SceneTab
          label="Sports"
          icon={<Dumbbell className="h-7 w-7" strokeWidth={1.9} />}
          active={scene === "sports"}
          onClick={() => setScene("sports")}
        />
      </div>

      {activeChips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {activeChips.map((chip) => (
            <span
              key={chip}
              className="inline-flex items-center rounded-full bg-foreground/5 px-2.5 py-1 text-[11px] font-medium text-foreground/80"
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
        />
      )}

      {filtersOpen ? (
        <div className="fixed inset-0 z-40 flex items-end bg-foreground/10 backdrop-blur-[1px]">
          <button
            type="button"
            aria-label="Close filters"
            className="absolute inset-0"
            onClick={() => setFiltersOpen(false)}
          />
          <div className="relative w-full rounded-t-[1.75rem] border border-border/60 bg-background px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl">
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
                className="text-[12px] font-medium text-muted-foreground"
              >
                Reset
              </button>
            </div>

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
            />

            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full bg-primary text-[14px] font-semibold text-primary-foreground shadow-sm"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}

      <CreatePostSheet
        open={postOpen}
        scene={scene}
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
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex h-[4.6rem] min-w-0 flex-col items-center justify-center overflow-hidden rounded-[1rem] border px-1.5 py-1.5 text-center text-[10px] font-medium leading-tight transition-all",
        active
          ? "border-primary/40 bg-primary/[0.08] text-primary shadow-[0_6px_16px_-10px_rgba(37,99,235,0.45)]"
          : "border-border/70 bg-card text-foreground/82 shadow-[0_2px_12px_-8px_rgba(15,23,42,0.12)]",
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute inset-x-0 top-1.5 bottom-6 inline-flex items-center justify-center",
          active ? "text-primary" : "text-foreground/70",
        )}
      >
        {icon}
      </span>
      <span className="relative z-[1] mt-auto block whitespace-normal text-center leading-[1.1]">
        {label}
      </span>
    </button>
  );
}

function matchesScene(row: DiscoverRow, scene: SceneKind) {
  const bio = row.bio?.toLowerCase() ?? "";
  const reasons = row.primaryReason.toLowerCase();
  const languages = row.languages.map((language) => language.toUpperCase());

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
  if (scene === "shared") return false;
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
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/70 bg-card text-foreground/80",
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
  return (
    <div className="flex items-center gap-2">
      <div className="relative min-w-0 flex-1">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground"
          strokeWidth={2.25}
        />
        <Input
          ref={inputRef}
          placeholder="Search classmates"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 rounded-2xl pl-11 pr-10 text-[15px]"
          inputMode="search"
          autoComplete="off"
        />
        {value ? (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={2.25} />
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onOpenFilters}
        className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 text-[12px] font-medium text-foreground shadow-[0_2px_12px_-4px_rgba(15,23,42,0.06)]"
      >
        <SlidersHorizontal className="h-4 w-4 text-muted-foreground" strokeWidth={2.25} />
        Filter
      </button>
    </div>
  );
}

function RecommendationSurface({
  rows,
  posts,
  scene,
  onOpenPost,
}: {
  rows: DiscoverRow[];
  posts: DiscoverPostRow[];
  scene: SceneKind;
  onOpenPost: () => void;
}) {
  const showingShared = scene === "shared";
  const hasItems = showingShared ? rows.length > 0 : posts.length > 0;

  if (!hasItems) {
    return (
      <div className="space-y-3">
        <SceneHeader scene={scene} onOpenPost={!showingShared ? onOpenPost : undefined} />
        <div className="rounded-2xl border border-border bg-card px-4 py-6 text-center text-[13px] text-muted-foreground">
          {showingShared
            ? "No classmates match this category yet."
            : "No posts in this category yet. Be the first to share what you're looking for."}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <SceneHeader scene={scene} onOpenPost={!showingShared ? onOpenPost : undefined} />

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {showingShared
          ? rows.map((r, i) => (
              <RecommendationRow
                key={r.userId}
                row={r}
                isLast={i === rows.length - 1}
                scene={scene}
              />
            ))
          : posts.map((post, i) => (
              <PostRow key={post.id} post={post} isLast={i === posts.length - 1} />
            ))}
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
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 text-[12px] font-medium text-foreground shadow-[0_2px_12px_-4px_rgba(15,23,42,0.06)]"
        >
          <Plus className="h-4 w-4 text-muted-foreground" strokeWidth={2.25} />
          Post
        </button>
      ) : null}
    </div>
  );
}

function sceneHeading(scene: SceneKind) {
  switch (scene) {
    case "study":
      return "Study together";
    case "meals":
      return "Meals and coffee";
    case "language":
      return "Language exchange";
    case "sports":
      return "Sports";
    default:
      return "Recommended classmates";
  }
}

function sceneDescription(scene: SceneKind) {
  switch (scene) {
    case "study":
      return "Posts from students actively looking for study partners and review sessions.";
    case "meals":
      return "Students posting about lunch, coffee, or a quick break after class.";
    case "language":
      return "Students looking for language exchange or conversation practice.";
    case "sports":
      return "Posts about sports, gym buddies, and active meetups around campus.";
    default:
      return "People you already overlap with through shared courses.";
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
      fetch(`/api/users/search?q=${encodeURIComponent(query)}`, {
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
      <div className="rounded-2xl border border-border bg-card px-4 py-6 text-center text-[13px] text-muted-foreground">
        Searching…
      </div>
    );
  }

  if (!searching && hits.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card px-4 py-6 text-center text-[13px] text-muted-foreground">
        No one matches &ldquo;{query}&rdquo; at your school.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      {hits.map((hit, i) => (
        <UserSearchRow key={hit.id} hit={hit} isLast={i === hits.length - 1} />
      ))}
    </div>
  );
}

function UserSearchRow({ hit, isLast }: { hit: UserSearchHit; isLast: boolean }) {
  const name = hit.nickname?.trim() || hit.username;
  const meta = [hit.major, hit.semester ? `sem ${hit.semester}` : null]
    .filter(Boolean)
    .join(" · ");
  const profileHref = `/users/${hit.id}?returnTo=%2Fdiscover` as Route;

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-3 py-3 transition hover:bg-muted/20",
        !isLast && "border-b border-border",
      )}
    >
      <Link href={profileHref} className="shrink-0">
        <PresetAvatar id={hit.avatarUrl} size={52} className="shrink-0" />
      </Link>

      <Link href={profileHref} className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium">{name}</span>
          <VerifiedBadge
            size="xs"
            school={hit.school}
            verifiedStudent={hit.verifiedStudent}
            status={hit.studentVerificationStatus}
          />
          {hit.hasActiveConnection ? (
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              chatting
            </span>
          ) : null}
        </div>
        <p className="truncate text-[11.5px] text-muted-foreground">
          @{hit.username}
          {meta ? <span> · {meta}</span> : null}
        </p>
        {hit.sharedCourseCount > 0 ? (
          <p className="mt-0.5 text-[11px] text-primary/90">
            {hit.sharedCourseCount}{" "}
            {hit.sharedCourseCount === 1 ? "shared course" : "shared courses"}
          </p>
        ) : null}
      </Link>

      <DiscoverMessageButton peerId={hit.id} />
    </div>
  );
}

function RecommendationRow({
  row,
  isLast,
  scene,
}: {
  row: DiscoverRow;
  isLast: boolean;
  scene: SceneKind;
}) {
  const meta = [row.major, row.semester ? `sem ${row.semester}` : null]
    .filter(Boolean)
    .join(" · ");
  const sharedCount = row.sharedCourses.length;
  const sharedLabel =
    sharedCount === 1 ? "1 shared course" : `${sharedCount} shared courses`;
  const profileHref = `/users/${row.userId}?returnTo=%2Fdiscover` as Route;

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-3 py-3 transition hover:bg-muted/20",
        !isLast && "border-b border-border",
      )}
    >
      <Link href={profileHref} className="shrink-0">
        <PresetAvatar id={row.avatarUrl} size={52} className="shrink-0" />
      </Link>

      <Link href={profileHref} className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium">{row.nickname}</span>
          <VerifiedBadge
            size="xs"
            school={row.school}
            verifiedStudent={row.verifiedStudent}
            status={row.studentVerificationStatus}
          />
          {row.connectionId ? (
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              chatting
            </span>
          ) : null}
        </div>

        {meta ? (
          <p className="truncate text-xs text-muted-foreground">{meta}</p>
        ) : null}

        {scene === "shared" ? (
          <p className="mt-1 text-xs font-medium text-foreground/85">{sharedLabel}</p>
        ) : null}

        {scene === "shared" && row.sharedCourses.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {row.sharedCourses.slice(0, 3).map((c) => (
              <span
                key={c.id}
                className="inline-flex max-w-full items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                title={c.name}
              >
                <span className="truncate">{c.code ?? c.name}</span>
              </span>
            ))}
            {row.sharedCourses.length > 3 ? (
              <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] text-muted-foreground">
                +{row.sharedCourses.length - 3}
              </span>
            ) : null}
          </div>
        ) : null}
      </Link>

      <DiscoverMessageButton peerId={row.userId} courseId={row.primaryCourse.id} />
    </div>
  );
}

function PostRow({ post, isLast }: { post: DiscoverPostRow; isLast: boolean }) {
  const meta = [post.major, post.semester ? `sem ${post.semester}` : null]
    .filter(Boolean)
    .join(" · ");
  const postPath = `/discover/posts/${post.id}`;
  const postDetailHref =
    `${postPath}?returnTo=${encodeURIComponent("/discover")}` as Route;
  const profileHref = (
    post.isOwn
      ? postDetailHref
      : `/users/${post.userId}?returnTo=${encodeURIComponent(postPath)}`
  ) as Route;

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-3 py-3 transition hover:bg-muted/20",
        !isLast && "border-b border-border",
      )}
    >
      <Link href={profileHref} className="shrink-0">
        <PresetAvatar id={post.avatarUrl} size={52} className="shrink-0" />
      </Link>

      <Link href={postDetailHref} className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium">{post.nickname}</span>
          <VerifiedBadge
            size="xs"
            school={post.school}
            verifiedStudent={post.verifiedStudent}
            status={post.studentVerificationStatus}
          />
          {post.isOwn ? (
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              your post
            </span>
          ) : null}
        </div>
        {meta ? (
          <p className="truncate text-xs text-muted-foreground">{meta}</p>
        ) : null}
        <p className="mt-1 text-[12px] font-medium leading-snug text-foreground/90">{post.title}</p>
        {post.body ? (
          <p className="mt-0.5 text-[12px] leading-snug text-foreground/75">{post.body}</p>
        ) : null}
        <p className="mt-1 text-[10.5px] text-muted-foreground">
          {isNeverExpiry(post.expiresAt)
            ? "No expiry"
            : `Active until ${format(new Date(post.expiresAt), "MMM d")}`}
        </p>
      </Link>

      <DiscoverMessageButton peerId={post.userId} returnTo={postPath} />
    </div>
  );
}

function sceneToCategory(scene: SceneKind): ClassmatePostCategory {
  switch (scene) {
    case "study":
      return ClassmatePostCategory.STUDY;
    case "meals":
      return ClassmatePostCategory.MEALS;
    case "language":
      return ClassmatePostCategory.LANGUAGE;
    case "sports":
      return ClassmatePostCategory.SPORTS;
    default:
      return ClassmatePostCategory.STUDY;
  }
}

function passesFilters(
  value: {
    school: string | null;
    major: string | null;
    languages: string[];
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
  if (filters.languageFilter !== "All" && !value.languages.includes(filters.languageFilter)) return false;
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
  onClose,
  onCreated,
}: {
  open: boolean;
  scene: SceneKind;
  onClose: () => void;
  onCreated: () => void;
}) {
  const canPost = scene !== "shared";
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [expiryPreset, setExpiryPreset] = useState<PostExpiryPreset>("1w");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setBody("");
    setError(null);
    setExpiryPreset("1w");
  }, [open, scene]);

  if (!open || !canPost) return null;

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/classmate-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: "Munich",
          category: sceneToCategory(scene),
          title,
          body,
          expiresAt: expiryPresetToDate(expiryPreset).toISOString(),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to create post.");
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create post.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-foreground/10 backdrop-blur-[1px]">
      <button type="button" aria-label="Close post sheet" className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full rounded-t-[1.75rem] border border-border/60 bg-background px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl">
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-border/80" />
        <div className="mb-3 flex items-start justify-between gap-3">
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

        <div className="space-y-3">
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
        </div>

        {error ? <p className="mt-3 text-[12px] text-destructive">{error}</p> : null}

        <div className="mt-4 flex gap-2">
          <Button type="button" variant="ghost" className="h-11 flex-1 rounded-xl" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" className="h-11 flex-1 rounded-xl" onClick={() => void submit()} disabled={submitting}>
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
    </div>
  );
}

function postPlaceholder(scene: SceneKind) {
  switch (scene) {
    case "study":
      return "Looking for someone to review IN2064 this week";
    case "meals":
      return "Anyone up for lunch after class near Garching?";
    case "language":
      return "Want to practice German over coffee";
    case "sports":
      return "Looking for a basketball buddy this weekend";
    default:
      return "Share what you're looking for";
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
          ? "border-primary bg-primary/10 text-primary"
          : "border-border/70 bg-background text-foreground/78",
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
