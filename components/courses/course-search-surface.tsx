"use client";

import Link from "next/link";
import type { Route } from "next";
import { Search, Users, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { QuickEnrollButton } from "@/components/courses/quick-enroll-button";
import { SaveBookmarkButton } from "@/components/courses/save-bookmark-button";
import { Input } from "@/components/ui/input";
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
      fetch(`/api/courses/search?${params.toString()}`, {
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
  }, [trimmed, active]);

  return (
    <div className="space-y-4">
      <SearchBar
        ref={inputRef}
        value={q}
        onChange={setQ}
        onClear={() => {
          setQ("");
          inputRef.current?.focus();
        }}
      />

      {active ? (
        <ResultsList
          query={trimmed}
          hits={hits}
          searching={searching}
          guestMode={guestMode}
        />
      ) : (
        children
      )}
    </div>
  );
}

type SearchBarProps = {
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
};

function SearchBar({
  ref,
  value,
  onChange,
  onClear,
}: SearchBarProps & { ref: React.RefObject<HTMLInputElement | null> }) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground"
        strokeWidth={2.25}
        aria-hidden
      />
      <Input
        ref={ref}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        placeholder="Search courses — code, name, keyword…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-12 rounded-2xl border-border bg-card pl-11 pr-11 text-[15px]",
          "shadow-[0_2px_12px_-4px_rgba(15,23,42,0.06)]",
          "placeholder:text-muted-foreground/80",
        )}
      />
      {value.length > 0 ? (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.25} />
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
}: {
  query: string;
  hits: SearchHit[];
  searching: boolean;
  guestMode: boolean;
}) {
  if (searching && hits.length === 0) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card px-4 py-6 text-center text-[12.5px] text-muted-foreground">
        Searching…
      </div>
    );
  }

  if (!searching && hits.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
        <p className="text-[13.5px] font-medium text-foreground">
          No courses match &ldquo;{query}&rdquo;
        </p>
        <p className="mt-1 text-[11.5px] text-muted-foreground">
          Try a course code (e.g. IN2064) or part of the name.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="px-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {hits.length} {hits.length === 1 ? "result" : "results"}
      </p>
      <ul className="divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_2px_16px_-4px_rgba(15,23,42,0.06)]">
        {hits.map((hit) => (
          <SearchHitRow key={hit.id} hit={hit} guestMode={guestMode} />
        ))}
      </ul>
    </div>
  );
}

function SearchHitRow({
  hit,
  guestMode,
}: {
  hit: SearchHit;
  guestMode: boolean;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Link
        href={`/courses/${hit.id}?returnTo=%2Fcourses` as Route}
        className="min-w-0 flex-1"
      >
        <p className="truncate text-[14.5px] font-semibold leading-tight">
          {hit.code ? (
            <span className="mr-1.5 text-primary">{hit.code}</span>
          ) : null}
          <span className="text-foreground">{hit.name}</span>
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-[11.5px] text-muted-foreground">
          <Users className="h-3 w-3" strokeWidth={2.25} />
          <span>
            {hit.memberCount}{" "}
            {hit.memberCount === 1 ? "classmate" : "classmates"}
          </span>
        </p>
      </Link>

      {guestMode ? null : hit.enrolled ? (
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[10.5px] font-semibold text-muted-foreground">
          Enrolled
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
