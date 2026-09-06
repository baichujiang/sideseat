"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import type { Route } from "next";
import { addDays } from "date-fns";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Edit3, Loader2, Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { BuddyRequestCard } from "@/components/discover/buddy-request-card";
import { DiscoverActivityCard } from "@/components/discover/discover-activity-card";
import { OfflineStateCard } from "@/components/offline/offline-state-card";
import { AppPushLayer } from "@/components/ui/app-push-layer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LinkButton } from "@/components/ui/link-button";
import type { DiscoverActivityRow } from "@/lib/discover/discover-activity-row";
import type { DiscoverPostClientRow } from "@/lib/discover/discover-post-row";
import { filterDiscoverFeedPosts } from "@/lib/discover/discover-feed-kind";
import { buddyTypeLabel, shouldShowBuddyCategoryLabel } from "@/lib/discover/buddy-type-labels";
import {
  DEFAULT_DISCOVER_SERVED_CITY,
  type DiscoverCityNameKey,
} from "@/lib/discover/discover-city-name-keys";
import { useSignInPrompt } from "@/components/auth/sign-in-prompt-dialog";
import { useAppMessages } from "@/hooks/use-app-locale";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useSessionHint } from "@/hooks/use-session-hint";
import { formatMessage } from "@/lib/i18n/messages";
import {
  CLASSMATE_POST_BODY_MAX_LEN,
  CLASSMATE_POST_MAX_TAGS,
  CLASSMATE_POST_TAG_MAX_LEN,
  CLASSMATE_POST_TITLE_MAX_LEN,
} from "@/lib/validators/classmate-posts";
import { cn } from "@/lib/utils";

type PostExpiryPreset = "3d" | "1w" | "1m" | "never";
type BuddyPostVisibility =
  | "SCHOOL_ONLY"
  | "CITY_INTERNATIONALS"
  | "VERIFIED_ONLY"
  | "COURSEMATES_ONLY";

export type { DiscoverPostClientRow } from "@/lib/discover/discover-post-row";

export type EnrolledCourseOption = { id: string; code: string | null; name: string };

export function DiscoverList({
  posts,
  activities = [],
  savedCourseCount,
  enrolledCourses = [],
  servedCity,
  viewerSession,
}: {
  posts: DiscoverPostClientRow[];
  activities?: DiscoverActivityRow[];
  /** Saved courses count — used to suggest “Add a course” when the feed is empty. */
  savedCourseCount?: number;
  enrolledCourses?: EnrolledCourseOption[];
  /** Metro scope from Me → city preference (cookie). */
  servedCity?: DiscoverCityNameKey;
  /** Server-confirmed auth state; avoids treating a slow client refresh as logged out. */
  viewerSession?: { signedIn: boolean; isGuest: boolean };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionHint = useSessionHint();
  const { openPrompt } = useSignInPrompt();
  const m = useAppMessages();
  const isOnline = useOnlineStatus();
  const dl = m.discoverList;
  const buddy = m.discoverBuddy;

  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  const createParam = searchParams.get("create");

  useEffect(() => {
    if (!searchOpen) return;
    const id = window.requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>("#discover-search-input")?.focus({
        preventScroll: true,
      });
    });
    return () => window.cancelAnimationFrame(id);
  }, [searchOpen]);

  const filteredByFeed = filterDiscoverFeedPosts(posts, "for-you");
  const activeSearchQuery = searchOpen ? searchQuery : "";
  const q = activeSearchQuery.trim().toLowerCase();
  const filteredPosts =
    q.length < 2
      ? filteredByFeed
      : filteredByFeed.filter((p) => {
          const courseBlob = (p.linkedCourses ?? []).map((c) => `${c.code ?? ""} ${c.name}`).join(" ");
          const blob = [
            p.title,
            p.body ?? "",
            p.nickname,
            ...p.tags,
            shouldShowBuddyCategoryLabel(p.category) ? buddyTypeLabel(p.category, buddy) : "",
            courseBlob,
          ]
            .join(" ")
            .toLowerCase();
          return blob.includes(q);
        });

  const filteredActivities =
    q.length < 2
      ? activities
      : activities.filter((a) => {
          const blob = [a.title, a.description ?? "", a.location, a.organizerNickname]
            .join(" ")
            .toLowerCase();
          return blob.includes(q);
        });

  const emptyCopy = buddy.emptyFeed;
  const cityNameKey = servedCity ?? DEFAULT_DISCOVER_SERVED_CITY;
  const searchPlaceholder = buddy.searchPlaceholder;
  const searchAria = buddy.searchAria;

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery("");
  };

  const toggleSearch = () => {
    if (searchOpen) {
      closeSearch();
      return;
    }
    setSearchOpen(true);
  };

  const openCreateFlow = useCallback(() => {
    if (!isOnline) return;
    const session = viewerSession ?? sessionHint;
    if (!session) return;
    if (session.isGuest || !session.signedIn) {
      openPrompt({ returnTo: "/discover?create=post" });
      return;
    }
    setPostOpen(true);
  }, [isOnline, openPrompt, sessionHint, viewerSession]);

  useEffect(() => {
    if (createParam !== "post") return;
    openCreateFlow();

    const url = new URL(window.location.href);
    url.searchParams.delete("create");
    window.history.replaceState(null, "", url.toString());
  }, [createParam, openCreateFlow]);

  useEffect(() => {
    window.addEventListener("sideseat:discover-create-post", openCreateFlow);
    return () => {
      window.removeEventListener("sideseat:discover-create-post", openCreateFlow);
    };
  }, [openCreateFlow]);

  return (
    <div className="space-y-3">
      <header className="min-w-0 space-y-2">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div
            className="pointer-events-none invisible flex items-center justify-start gap-1.5"
            aria-hidden
          >
            <span className="inline-flex h-9 w-9 shrink-0" />
          </div>
          <h1 className="page-screen-title min-w-0 truncate text-center">{m.discover.screenTitle}</h1>
          <div className="flex shrink-0 items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={toggleSearch}
              aria-label={searchAria}
              aria-pressed={searchOpen}
              className={cn(
                "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/80 bg-white text-muted-foreground shadow-sm transition hover:bg-muted/50 hover:text-foreground dark:bg-card",
                searchOpen && "border-classmates-blue-border text-classmates-blue",
              )}
            >
              <Search className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            </button>
          </div>
        </div>

        {searchOpen ? (
          <div className="relative min-w-0">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              strokeWidth={2}
              aria-hidden
            />
            <Input
              id="discover-search-input"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchPlaceholder}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label={searchAria}
              className="h-9 min-w-0 w-full rounded-full border-border/80 bg-white py-0 pl-9 pr-9 text-[13px] shadow-sm dark:bg-card"
            />
            {searchQuery.trim().length > 0 ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label={m.common.close}
                className="absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              </button>
            ) : null}
          </div>
        ) : null}

      </header>

      {!isOnline ? (
        <OfflineStateCard
          title={m.offline.needsInternetTitle}
          description={m.offline.discoverNeedsInternetBody}
        />
      ) : filteredPosts.length === 0 && filteredActivities.length === 0 ? (
          <div className="rounded-2xl border border-[#E7E0D6] bg-white px-4 py-6 text-center text-[13px] text-muted-foreground shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
            {emptyCopy}
            {enrolledCourses.length === 0 && savedCourseCount === 0 ? (
              <div className="mt-4 flex justify-center">
                <LinkButton href={"/courses/add" as Route} size="sm">
                  {dl.addCourse}
                </LinkButton>
              </div>
            ) : null}
          </div>
      ) : (
        <UnifiedPlanFeed posts={filteredPosts} activities={filteredActivities} />
      )}

      <CreatePostSheet
        open={postOpen}
        servedCity={cityNameKey}
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

function UnifiedPlanFeed({
  posts,
  activities,
}: {
  posts: DiscoverPostClientRow[];
  activities: DiscoverActivityRow[];
}) {
  const items = [
    ...posts.map((post) => ({
      id: `post-${post.id}`,
      sortAt: (post.startsAt ?? post.createdAt).getTime(),
      content: <BuddyRequestCard post={post} />,
    })),
    ...activities.map((activity) => ({
      id: `activity-${activity.id}`,
      sortAt: new Date(activity.startAtISO).getTime(),
      content: <DiscoverActivityCard activity={activity} />,
    })),
  ].sort((a, b) => b.sortAt - a.sortAt);

  return <div className="space-y-3">{items.map((item) => <div key={item.id}>{item.content}</div>)}</div>;
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
  servedCity,
  enrolledCourses,
  onClose,
  onCreated,
}: {
  open: boolean;
  servedCity: DiscoverCityNameKey;
  enrolledCourses: EnrolledCourseOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const m = useAppMessages();
  const dl = m.discoverList;
  const common = m.common;
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<BuddyPostVisibility>("CITY_INTERNATIONALS");
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<string>>(new Set());
  const [hasSchedule, setHasSchedule] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [location, setLocation] = useState("");
  const [hasCapacityLimit, setHasCapacityLimit] = useState(false);
  const [capacity, setCapacity] = useState(4);
  const [expiryPreset, setExpiryPreset] = useState<PostExpiryPreset>("1w");
  const [submitting, setSubmitting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalizedTags = extractBuddyHashtags(`${title}\n${body}`);
  const enrolledCourseIdsKey = useMemo(
    () => enrolledCourses.map((course) => course.id).join("\0"),
    [enrolledCourses],
  );

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setBody("");
    setVisibility("CITY_INTERNATIONALS");
    setSelectedCourseIds(new Set(enrolledCourses.map((course) => course.id)));
    const start = new Date(Date.now() + 60 * 60 * 1000);
    const end = new Date(Date.now() + 2 * 60 * 60 * 1000);
    setHasSchedule(false);
    setStartsAt(toLocalDateTimeInput(start));
    setEndsAt(toLocalDateTimeInput(end));
    setLocation("");
    setHasCapacityLimit(false);
    setCapacity(4);
    setError(null);
    setPosted(false);
    setExpiryPreset("1w");
  }, [enrolledCourseIdsKey, enrolledCourses, open]);

  async function submit() {
    if (submitting || posted) return;
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle) {
      setError(dl.postErrorNeedTitle);
      return;
    }
    if (!trimmedBody) {
      setError(dl.postErrorNeedBody);
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
    if (visibility === "COURSEMATES_ONLY" && selectedCourseIds.size === 0) {
      setError(dl.postErrorSelectCourse);
      return;
    }
    const parsedStart = hasSchedule ? new Date(startsAt) : null;
    const parsedEnd = hasSchedule ? new Date(endsAt) : null;
    if (
      hasSchedule &&
      (!parsedStart ||
        !parsedEnd ||
        Number.isNaN(parsedStart.getTime()) ||
        Number.isNaN(parsedEnd.getTime()) ||
        parsedStart.getTime() < Date.now() - 60_000 ||
        parsedEnd <= parsedStart)
    ) {
      setError(dl.planScheduleError);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch("/api/classmate-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: servedCity,
          title: trimmedTitle,
          body: trimmedBody,
          tags: normalizedTags,
          visibility,
          replyPreference: "DIRECT_MESSAGE",
          courseIds: visibility === "COURSEMATES_ONLY" ? [...selectedCourseIds] : [],
          startsAt: parsedStart?.toISOString(),
          endsAt: parsedEnd?.toISOString(),
          location: hasSchedule ? location.trim() || undefined : undefined,
          capacity: hasSchedule && hasCapacityLimit ? capacity : undefined,
          expiresAt: expiryPresetToDate(expiryPreset).toISOString(),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to create post.");
      }
      setSubmitting(false);
      setPosted(true);
      window.setTimeout(() => onCreated(), 420);
    } catch (err) {
      setError(err instanceof Error ? err.message : dl.postErrorCreateFailed);
      setSubmitting(false);
    }
  }

  return (
    <AppPushLayer
      open={open}
      onClose={posted ? () => undefined : onClose}
      zClassName="z-40"
      panelClassName="w-[min(100vw,28rem)] border-0 bg-background shadow-none dark:shadow-none"
      listenForEscape={!posted}
    >
      <div className="flex h-full min-h-0 flex-col px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="mx-auto mb-3 h-1.5 w-12 shrink-0 rounded-full bg-border/80" />
        {posted ? (
          <div
            className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center animate-in fade-in zoom-in-95 duration-300"
            role="status"
            aria-live="polite"
          >
            <CheckCircle2 className="h-12 w-12 text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} />
            <p className="text-[16px] font-semibold text-foreground">{common.done}</p>
          </div>
        ) : null}

        <div className={cn("mb-3 flex shrink-0 items-start justify-between gap-3", posted && "hidden")}>
          <div>
            <h3 className="text-[15px] font-semibold text-foreground">{dl.postSheetHeading}</h3>
            <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{dl.postSheetSubtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition active:scale-95 hover:bg-muted"
            aria-label={common.close}
          >
            <X className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>

        <div className={cn("min-h-0 flex-1 space-y-3 overflow-y-auto", posted && "hidden")}>
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
              placeholder={dl.postSheetTitlePlaceholder}
              maxLength={CLASSMATE_POST_TITLE_MAX_LEN}
              className="h-11 rounded-xl border-border/70 text-[14px] placeholder:text-muted-foreground/80"
            />
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/50 px-3 py-2.5">
            <label className="flex min-h-10 items-center justify-between gap-3 text-[13px] font-medium text-foreground">
              <span>{dl.planScheduleToggle}</span>
              <input
                type="checkbox"
                checked={hasSchedule}
                onChange={(event) => setHasSchedule(event.target.checked)}
                className="h-4 w-4 accent-primary"
              />
            </label>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{dl.planScheduleHint}</p>
            {hasSchedule ? (
              <div className="mt-3 space-y-2.5 border-t border-border/60 pt-3">
                <label className="block text-[11px] font-medium text-muted-foreground">
                  {dl.planStartsLabel}
                  <Input
                    type="datetime-local"
                    value={startsAt}
                    min={toLocalDateTimeInput(new Date())}
                    onChange={(event) => setStartsAt(event.target.value)}
                    className="mt-1 h-10 rounded-xl border-border/70 text-[13px]"
                  />
                </label>
                <label className="block text-[11px] font-medium text-muted-foreground">
                  {dl.planEndsLabel}
                  <Input
                    type="datetime-local"
                    value={endsAt}
                    min={startsAt}
                    onChange={(event) => setEndsAt(event.target.value)}
                    className="mt-1 h-10 rounded-xl border-border/70 text-[13px]"
                  />
                </label>
                <label className="block text-[11px] font-medium text-muted-foreground">
                  {dl.planLocationLabel}
                  <Input
                    value={location}
                    maxLength={120}
                    onChange={(event) => setLocation(event.target.value)}
                    placeholder={dl.planLocationPlaceholder}
                    className="mt-1 h-10 rounded-xl border-border/70 text-[13px]"
                  />
                </label>
                <label className="flex min-h-9 items-center justify-between gap-3 text-[12px] font-medium text-foreground">
                  <span>{dl.planCapacityToggle}</span>
                  <input
                    type="checkbox"
                    checked={hasCapacityLimit}
                    onChange={(event) => setHasCapacityLimit(event.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                </label>
                {hasCapacityLimit ? (
                  <label className="block text-[11px] font-medium text-muted-foreground">
                    {formatMessage(dl.planCapacityLabel, { count: capacity })}
                    <Input
                      type="number"
                      min={2}
                      max={500}
                      value={capacity}
                      onChange={(event) => setCapacity(Math.min(500, Math.max(2, Number(event.target.value) || 2)))}
                      className="mt-1 h-10 rounded-xl border-border/70 text-[13px]"
                    />
                  </label>
                ) : null}
              </div>
            ) : null}
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
              className="min-h-28 w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-[14px] text-foreground outline-none transition placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
            {normalizedTags.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {normalizedTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex max-w-full items-center rounded-full border border-classmates-blue-border bg-classmates-blue-soft px-2 py-0.5 text-[11px] font-medium text-classmates-blue"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/50 px-3 py-2.5">
            <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
              {dl.postSheetVisibilityLabel}
            </p>
            <div className="flex flex-wrap gap-2">
              <ExpiryOption
                label={dl.postVisibilityCityInternationals}
                active={visibility === "CITY_INTERNATIONALS"}
                onClick={() => setVisibility("CITY_INTERNATIONALS")}
              />
              <ExpiryOption
                label={dl.postVisibilityVerifiedOnly}
                active={visibility === "VERIFIED_ONLY"}
                onClick={() => setVisibility("VERIFIED_ONLY")}
              />
              <ExpiryOption
                label={dl.postVisibilitySchoolOnly}
                active={visibility === "SCHOOL_ONLY"}
                onClick={() => setVisibility("SCHOOL_ONLY")}
              />
              {enrolledCourses.length > 0 ? (
                <ExpiryOption
                  label={dl.postVisibilityCoursematesOnly}
                  active={visibility === "COURSEMATES_ONLY"}
                  onClick={() => setVisibility("COURSEMATES_ONLY")}
                />
              ) : null}
            </div>
            {visibility === "COURSEMATES_ONLY" ? (
              <div className="mt-2 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-muted-foreground">
                    {formatMessage(dl.postSheetCoursePicker, {
                      selected: selectedCourseIds.size,
                      total: enrolledCourses.length,
                    })}
                  </p>
                  <button
                    type="button"
                    className="text-[11px] font-medium text-classmates-blue"
                    onClick={() =>
                      setSelectedCourseIds((current) =>
                        current.size === enrolledCourses.length
                          ? new Set()
                          : new Set(enrolledCourses.map((course) => course.id)),
                      )
                    }
                  >
                    {selectedCourseIds.size === enrolledCourses.length
                      ? dl.postSheetDeselectAll
                      : dl.postSheetSelectAll}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {enrolledCourses.map((course) => {
                    const active = selectedCourseIds.has(course.id);
                    const label = course.code ? `${course.code} · ${course.name}` : course.name;
                    return (
                      <button
                        key={course.id}
                        type="button"
                        onClick={() =>
                          setSelectedCourseIds((current) => {
                            const next = new Set(current);
                            if (next.has(course.id)) {
                              next.delete(course.id);
                            } else {
                              next.add(course.id);
                            }
                            return next;
                          })
                        }
                        className={cn(
                          "max-w-full rounded-full border px-2.5 py-1 text-[11px] font-medium transition active:scale-[0.98]",
                          active
                            ? "border-classmates-blue-border bg-classmates-blue-soft text-classmates-blue"
                            : "border-border/80 bg-background text-muted-foreground",
                        )}
                      >
                        <span className="block max-w-[15rem] truncate">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

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

        <div className={cn("mt-4 flex shrink-0 gap-2", posted && "hidden")}>
          <Button
            type="button"
            variant="ghost"
            className="h-11 flex-1 rounded-xl transition active:scale-[0.98]"
            onClick={onClose}
          >
            {common.cancel}
          </Button>
          <Button
            type="button"
            className="h-11 flex-1 rounded-xl transition active:scale-[0.98]"
            onClick={() => void submit()}
            disabled={
              submitting ||
              posted ||
              !title.trim() ||
              !body.trim() ||
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

function extractBuddyHashtags(value: string) {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const match of value.matchAll(/#([\p{L}\p{N}_-]+)/gu)) {
    const tag = match[1].slice(0, CLASSMATE_POST_TAG_MAX_LEN).toLocaleLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
    if (tags.length >= CLASSMATE_POST_MAX_TAGS) break;
  }
  return tags;
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
        "inline-flex h-9 items-center rounded-full border px-3 text-[12px] font-medium transition-[transform,colors] active:scale-[0.97]",
        active
          ? "border-primary/35 bg-primary/10 text-primary"
          : "border-border/80 bg-background text-foreground/78 hover:bg-muted/60",
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

function toLocalDateTimeInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
