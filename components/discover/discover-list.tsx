"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import type { Route } from "next";
import { addDays } from "date-fns";
import { useEffect, useState } from "react";
import { Edit3, Loader2, Plus, Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ClassmatePostCategory,
  type LanguageProficiency,
  type LanguageTag,
} from "@prisma/client";

import {
  DiscoverBuddyTypeChips,
  type BuddyTypeChipValue,
} from "@/components/discover/discover-buddy-type-chips";
import { DiscoverFeed } from "@/components/discover/discover-feed";
import { DiscoverFeedTabs } from "@/components/discover/discover-feed-tabs";
import { applyBuddyFeedClientFilters } from "@/components/discover/discover-filter-sheet";
import { ClassmatePostCreateImageRow } from "@/components/discover/classmate-post-create-image-row";
import { displayableClassmatePostImageUrls } from "@/lib/discover/classmate-post-display-images";
import { LanguageExchangePostFields } from "@/components/discover/language-exchange-post-fields";
import { SportsPostFieldCombobox } from "@/components/discover/sports-post-field-combobox";
import { AppPushLayer } from "@/components/ui/app-push-layer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LinkButton } from "@/components/ui/link-button";
import type { DiscoverPostRow } from "@/lib/discover/discover-post-row";
import {
  discoverFeedKindToParam,
  filterDiscoverFeedPosts,
  parseDiscoverFeedKind,
  type DiscoverFeedKind,
} from "@/lib/discover/discover-feed-kind";
import { ALL_BUDDY_CATEGORIES, buddyTypeLabel } from "@/lib/discover/buddy-type-labels";
import {
  DEFAULT_DISCOVER_SERVED_CITY,
  type DiscoverCityNameKey,
} from "@/lib/discover/discover-city-name-keys";
import { useSignInPrompt } from "@/components/auth/sign-in-prompt-dialog";
import { useAppMessages } from "@/hooks/use-app-locale";
import { useSessionHint } from "@/hooks/use-session-hint";
import { formatMessage } from "@/lib/i18n/messages";
import {
  CLASSMATE_POST_BODY_MAX_LEN,
  CLASSMATE_POST_TITLE_MAX_LEN,
} from "@/lib/validators/classmate-posts";
import { cn } from "@/lib/utils";

type PostExpiryPreset = "3d" | "1w" | "1m" | "never";

export type { DiscoverPostRow } from "@/lib/discover/discover-post-row";

export type EnrolledCourseOption = { id: string; code: string | null; name: string };

export function DiscoverList({
  posts,
  savedCourseCount,
  enrolledCourses = [],
  servedCity,
}: {
  posts: DiscoverPostRow[];
  /** Saved courses count — used to suggest “Add a course” when the feed is empty. */
  savedCourseCount?: number;
  enrolledCourses?: EnrolledCourseOption[];
  /** Metro scope from Me → city preference (cookie). */
  servedCity?: DiscoverCityNameKey;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionHint = useSessionHint();
  const { openPrompt } = useSignInPrompt();
  const m = useAppMessages();
  const dl = m.discoverList;
  const buddy = m.discoverBuddy;

  const [feed, setFeed] = useState<DiscoverFeedKind>(() => parseDiscoverFeedKind(searchParams.get("feed")));
  const [searchQuery, setSearchQuery] = useState("");
  const [typeChip, setTypeChip] = useState<BuddyTypeChipValue>("all");
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
  const categoriesFilter = typeChip === "all" ? null : [typeChip];
  const filteredByType = applyBuddyFeedClientFilters(filteredByFeed, categoriesFilter);
  const q = searchQuery.trim().toLowerCase();
  const filteredPosts =
    q.length < 2
      ? filteredByType
      : filteredByType.filter((p) => {
          const courseBlob = (p.linkedCourses ?? []).map((c) => `${c.code ?? ""} ${c.name}`).join(" ");
          const blob = [p.title, p.body ?? "", p.nickname, buddyTypeLabel(p.category, buddy), courseBlob]
            .join(" ")
            .toLowerCase();
          return blob.includes(q);
        });

  const emptyCopy = feed === "today" ? buddy.emptyFeedToday : buddy.emptyFeed;
  const cityNameKey = servedCity ?? DEFAULT_DISCOVER_SERVED_CITY;

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-20 -mx-3 space-y-1.5 border-b border-classmates-edge/50 bg-classmates-warm/95 px-3 pb-2 pt-0 backdrop-blur-md supports-[backdrop-filter]:bg-classmates-warm/90 dark:border-border/40 dark:bg-background/90">
        <div className="flex items-center gap-2">
          <h1 className="page-screen-title shrink-0 text-[17px] leading-tight">{m.discover.screenTitle}</h1>
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              strokeWidth={2.25}
              aria-hidden
            />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={buddy.searchPlaceholder}
              aria-label={buddy.searchAria}
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
          <button
            type="button"
            onClick={() => {
              if (!sessionHint || sessionHint.isGuest || !sessionHint.signedIn) {
                openPrompt({ returnTo: "/discover" });
                return;
              }
              setPostOpen(true);
            }}
            aria-label={buddy.createRequestCtaAria}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-classmates-blue text-white shadow-sm transition hover:bg-classmates-blue/90"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          </button>
        </div>
        <DiscoverFeedTabs active={feed} onChange={setFeedKind} labels={buddy} />
        <DiscoverBuddyTypeChips value={typeChip} onChange={setTypeChip} labels={buddy} />
      </div>

      {filteredPosts.length === 0 ? (
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
        <DiscoverFeed posts={filteredPosts} cityNameKey={cityNameKey as DiscoverCityNameKey} />
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
  enrolledCourses = [],
  onClose,
  onCreated,
}: {
  open: boolean;
  servedCity: DiscoverCityNameKey;
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
  const [postImageUrls, setPostImageUrls] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isShared = category === ClassmatePostCategory.SHARED_COURSES;

  useEffect(() => {
    if (!open) return;
    setCategory(ClassmatePostCategory.STUDY);
    setTitle("");
    setBody("");
    setError(null);
    setExpiryPreset("1w");
    setSelectedCourseIds(new Set());
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
    setSubmitting(true);
    setError(null);
    const imageUrls = displayableClassmatePostImageUrls(postImageUrls);
    try {
      const res = await apiFetch("/api/classmate-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: servedCity,
          category,
          title: trimmedTitle,
          body: trimmedBody,
          expiresAt: expiryPresetToDate(expiryPreset).toISOString(),
          ...(isShared && selectedCourseIds.size > 0
            ? { courseIds: [...selectedCourseIds] }
            : {}),
          ...(imageUrls.length > 0 ? { imageUrls } : {}),
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
              className="min-h-28 w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-[14px] outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
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
              !body.trim() ||
              (isShared && selectedCourseIds.size === 0) ||
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
