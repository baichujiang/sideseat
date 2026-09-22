"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import Link from "next/link";
import type { Route } from "next";
import { Search, Users, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { QuickEnrollButton } from "@/components/courses/quick-enroll-button";
import { SaveBookmarkButton } from "@/components/courses/save-bookmark-button";
import { Input } from "@/components/ui/input";
import { useAppMessages } from "@/hooks/use-app-locale";
import { formatMessage, type CoursesMessages } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

type SearchHit = {
  id: string;
  code: string | null;
  name: string;
  memberCount: number;
  enrolled: boolean;
  saved: boolean;
};

/**
 * The primary course-finding surface on `/courses`.
 *
 * Rationale: "find classmates through the courses I take" is the core mode of
 * the app. Course search therefore deserves to be the first thing the user
 * sees on the Courses tab — a tall, always-visible search bar at the top.
 *
 * Behaviour:
 *   - Idle (query empty or < 2 chars): renders the `children` fallback, which
 *     is the viewer's Enrolled + Saved lists.
 *   - Active (query ≥ 2 chars): fetches `/api/courses/search` (250ms debounce)
 *     and shows rich result rows. The child lists are hidden to keep the eye
 *     on the single task at hand.
 *
 * Each result row gives three independent affordances so the user never has
 * to save a course just to act on it:
 *   - View   → /courses/[id] (see the enrollment count, and — once enrolled —
 *              the full classmate list)
 *   - Save   → bookmark toggle
 *   - Enroll → /courses/add?prefillCourseId=... (the schedule form with times)
 */
export function CourseSearchSurface({
  children,
  guestMode = false,
  school,
}: {
  children: ReactNode;
  /** When true, hide Save/Enroll — guests get login after tapping into a course detail. */
  guestMode?: boolean;
  school?: string;
}) {
  const { courses: co } = useAppMessages();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const trimmed = q.trim();
  const active = trimmed.length >= 2;

  useEffect(() => {
    if (!active) {
      setHits([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const id = window.setTimeout(() => {
      const params = new URLSearchParams({ q: trimmed });
      if (school) params.set("school", school);
      apiFetch(`/api/courses/search?${params.toString()}`, {
        signal: controller.signal,
      })
        .then((r) => r.json())
        .then((payload: { data?: { hits?: SearchHit[] } }) => {
          setHits(payload.data?.hits ?? []);
        })
        .catch((err) => {
          if ((err as { name?: string }).name !== "AbortError") setHits([]);
        })
        .finally(() => setSearching(false));
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(id);
    };
  }, [trimmed, active, school]);

  return (
    <div className="space-y-5">
      <SearchBar
        id="course-catalog-search"
        inputRef={inputRef}
        value={q}
        onChange={setQ}
        copy={co}
        onClear={() => {
          setQ("");
          inputRef.current?.focus();
        }}
      />

      {active ? (
        <ResultsList query={trimmed} hits={hits} searching={searching} guestMode={guestMode} copy={co} />
      ) : (
        children
      )}
    </div>
  );
}

type SearchBarProps = {
  id?: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
  copy: CoursesMessages;
};

function SearchBar({
  id,
  inputRef,
  value,
  onChange,
  onClear,
  copy,
}: SearchBarProps) {
  return (
    <div
      className={cn(
        "relative flex items-center gap-3 rounded-[1.25rem] border border-[#E7E0D6] bg-white px-4 py-3.5 sm:px-5 sm:py-4",
        "shadow-[0_3px_14px_rgba(15,23,42,0.045)] dark:border-border dark:bg-card",
      )}
    >
      <Search className="h-5 w-5 shrink-0 text-[#8A94A6] dark:text-muted-foreground" strokeWidth={2.25} aria-hidden />
      <Input
        id={id}
        ref={inputRef}
        type="text"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        placeholder={copy.catalogSearchPlaceholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-auto min-h-0 flex-1 border-0 bg-transparent p-0 text-[16px] font-medium leading-snug tracking-tight text-[#111827] shadow-none sm:text-[17px]",
          "placeholder:text-[#8A94A6] focus-visible:ring-0 dark:text-foreground dark:placeholder:text-muted-foreground",
        )}
      />
      {value.length > 0 ? (
        <button
          type="button"
          onClick={onClear}
          aria-label={copy.catalogClearSearchAria}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#8A94A6] transition hover:bg-[#F3F0EA] hover:text-[#111827] dark:hover:bg-muted"
        >
          <X className="h-4 w-4" strokeWidth={2.25} />
        </button>
      ) : null}
    </div>
  );
}

function ResultsList({
  query,
  hits,
  searching,
  guestMode,
  copy,
}: {
  query: string;
  hits: SearchHit[];
  searching: boolean;
  guestMode: boolean;
  copy: CoursesMessages;
}) {
  if (searching && hits.length === 0) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card px-4 py-6 text-center text-[12.5px] text-muted-foreground">
        {copy.catalogSearching}
      </div>
    );
  }

  if (!searching && hits.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
        <p className="text-[13.5px] font-medium text-foreground">
          {formatMessage(copy.catalogNoMatchTitle, { query })}
        </p>
        <p className="mt-1 text-[11.5px] text-muted-foreground">{copy.catalogNoMatchHint}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="px-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {hits.length === 1
          ? copy.catalogResultsOne
          : formatMessage(copy.catalogResultsMany, { count: hits.length })}
      </p>
      <ul className="divide-y divide-border/50 overflow-hidden rounded-[1.25rem] border border-border/60 bg-card shadow-[0_2px_14px_-3px_rgba(15,23,42,0.06)]">
        {hits.map((hit) => (
          <SearchHitRow key={hit.id} hit={hit} guestMode={guestMode} copy={copy} />
        ))}
      </ul>
    </div>
  );
}

function SearchHitRow({
  hit,
  guestMode,
  copy,
}: {
  hit: SearchHit;
  guestMode: boolean;
  copy: CoursesMessages;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-3.5 sm:px-4 sm:py-4">
      <Link
        href={`/courses/${hit.id}?returnTo=%2Fcourses` as Route}
        className="min-w-0 flex-1"
      >
        <p className="truncate text-[15px] font-semibold leading-snug tracking-tight">
          {hit.code ? (
            <span className="mr-1.5 text-primary">{hit.code}</span>
          ) : null}
          <span className="text-foreground">{hit.name}</span>
        </p>
        <p className="mt-1 flex items-center gap-1 text-[12px] text-muted-foreground">
          <Users className="h-3.5 w-3.5 shrink-0 opacity-90" strokeWidth={2.25} />
          <span>
            {hit.memberCount === 1
              ? copy.chatClassmatesOne
              : formatMessage(copy.chatClassmatesMany, { count: hit.memberCount })}
          </span>
        </p>
      </Link>

      {guestMode ? null : hit.enrolled ? (
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[10.5px] font-semibold text-muted-foreground">
          {copy.catalogEnrolledBadge}
        </span>
      ) : (
        <div className="flex shrink-0 items-center gap-1.5">
          <SaveBookmarkButton
            courseId={hit.id}
            initialSaved={hit.saved}
            variant="icon"
          />
          <QuickEnrollButton courseId={hit.id} />
        </div>
      )}
    </li>
  );
}
