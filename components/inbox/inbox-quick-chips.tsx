"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { BookOpen, CalendarClock, Search, UsersRound, X } from "lucide-react";

import { InboxChatsView } from "@/components/inbox/inbox-chats-view";
import { InboxCreateSheet } from "@/components/inbox/inbox-create-sheet";
import { OfflineStateCard } from "@/components/offline/offline-state-card";
import { inboxMyPlanChipPillClass } from "@/components/profile/me-settings-row";
import { Input } from "@/components/ui/input";
import { useAppMessages } from "@/hooks/use-app-locale";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { formatMessage } from "@/lib/i18n/messages";
import type { InboxMerged } from "@/lib/queries/inbox-merge";
import type { RecommendedClassmateRow } from "@/lib/queries/recommended-classmates";
import { cn } from "@/lib/utils";

type ContactRow = {
  peerId: string;
  connectionId: string;
  nickname: string | null;
  username: string;
  avatarUrl: string | null;
};

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <span
      className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-[#F43F5E] px-1 text-[10px] font-bold leading-none tabular-nums text-white shadow-[0_0_0_1.5px_#F0ECE6] dark:shadow-[0_0_0_1.5px_rgb(15,23,42,0.85)]"
      aria-hidden
    >
      {label}
    </span>
  );
}

const chipPillBaseClass =
  "relative flex h-10 min-h-[44px] min-w-0 w-full items-center justify-center overflow-visible rounded-full border px-2 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-[box-shadow,transform,opacity] active:scale-[0.98] active:opacity-90 [@media(hover:hover)]:hover:shadow-[0_2px_8px_rgba(15,23,42,0.08)]";

const chipPillPrimaryClass =
  "border-[#E8E1D8] bg-[#EFF6FF] text-[#2563EB] dark:border-blue-800/40 dark:bg-blue-950/35 dark:text-blue-300";

const chipPillMutedClass =
  "border-[#E8E1D8] bg-white text-[#6B7280] dark:border-border dark:bg-card dark:text-muted-foreground";

const inboxHeaderIconBtnClass =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/80 bg-white text-muted-foreground shadow-sm transition hover:bg-muted/50 hover:text-foreground dark:bg-card";

function InboxNavChip({
  href,
  label,
  title,
  ariaLabel,
  count,
  icon,
  variant = "muted",
}: {
  href: Route;
  label: string;
  title?: string;
  ariaLabel: string;
  count?: number;
  icon: ReactNode;
  variant?: "primary" | "muted" | "myPlan";
}) {
  return (
    <Link
      href={href}
      title={title}
      aria-label={ariaLabel}
      className={cn(
        chipPillBaseClass,
        variant === "myPlan"
          ? inboxMyPlanChipPillClass
          : variant === "primary"
            ? chipPillPrimaryClass
            : chipPillMutedClass,
      )}
    >
      <span className="inline-flex min-w-0 max-w-full items-center justify-center gap-1">
        <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center [&_svg]:h-[18px] [&_svg]:w-[18px]">
          {icon}
        </span>
        <span className="inline-flex min-w-0 items-center gap-0.5">
          <span className="truncate text-[14px] font-semibold leading-none">{label}</span>
          {typeof count === "number" && count > 0 ? (
            <CountBadge count={count} />
          ) : null}
        </span>
      </span>
    </Link>
  );
}

export function InboxChatsShell({
  userId,
  merged,
  plansNeedingYourAction,
  initialContacts,
  showCreateSheet,
  recommendedClassmates = [],
}: {
  userId: string;
  merged: InboxMerged[];
  plansNeedingYourAction: number;
  initialContacts: ContactRow[];
  showCreateSheet: boolean;
  recommendedClassmates?: RecommendedClassmateRow[];
}) {
  const m = useAppMessages();
  const isOnline = useOnlineStatus();
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const groupUnread = useMemo(
    () => merged.filter((i) => i.kind === "group").reduce((sum, i) => sum + i.unreadCount, 0),
    [merged],
  );
  const courseUnread = useMemo(
    () => merged.filter((i) => i.kind === "course").reduce((sum, i) => sum + i.unreadCount, 0),
    [merged],
  );

  useEffect(() => {
    if (!searchOpen) return;
    const id = window.requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>("#inbox-chats-search-input")?.focus({
        preventScroll: true,
      });
    });
    return () => window.cancelAnimationFrame(id);
  }, [searchOpen]);

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery("");
  };

  const toggleSearch = () => {
    if (searchOpen) {
      closeSearch();
      return;
    }
    if (!isOnline) return;
    setSearchOpen(true);
  };

  const upcomingPlanAria =
    plansNeedingYourAction > 0
      ? formatMessage(m.inbox.chipUpcomingPlanAriaWithCount, { count: plansNeedingYourAction })
      : m.inbox.chipUpcomingPlanAria;

  const studyGroupAria =
    groupUnread > 0
      ? formatMessage(m.inbox.chipStudyGroupAriaWithUnread, { count: groupUnread })
      : m.inbox.chipStudyGroupAria;

  const courseChatsAria =
    courseUnread > 0
      ? formatMessage(m.inbox.chipCourseChatsAriaWithUnread, { count: courseUnread })
      : m.inbox.chipCourseChatsAria;

  return (
    <div className="space-y-3">
      <header className="min-w-0 space-y-2">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div
            className="pointer-events-none invisible flex items-center justify-start gap-1.5"
            aria-hidden
          >
            <span className="inline-flex h-9 w-9 shrink-0" />
            {showCreateSheet ? <span className="inline-flex h-9 w-9 shrink-0" /> : null}
          </div>
          <h1 className="page-screen-title min-w-0 truncate text-center">{m.inbox.screenTitle}</h1>
          <div className="flex shrink-0 items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={toggleSearch}
              aria-label={m.inbox.searchAria}
              aria-pressed={searchOpen}
              disabled={!isOnline}
              title={!isOnline ? m.offline.onlineRequiredAction : undefined}
              className={cn(
                inboxHeaderIconBtnClass,
                searchOpen && "border-classmates-blue-border text-classmates-blue",
                !isOnline && "cursor-not-allowed opacity-55",
              )}
            >
              <Search className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            </button>
            {showCreateSheet && isOnline ? <InboxCreateSheet initialContacts={initialContacts} /> : null}
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
              id="inbox-chats-search-input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={m.inbox.searchPlaceholder}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label={m.inbox.searchAria}
              className="h-9 min-w-0 w-full rounded-full border-border/80 bg-white py-0 pl-9 pr-9 text-[13px] shadow-sm dark:bg-card"
            />
            {query.trim().length > 0 ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={m.inbox.headerSearchCloseAria}
                className="absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              </button>
            ) : null}
          </div>
        ) : null}

        {isOnline ? (
          <nav
            className="grid w-full min-w-0 grid-cols-3 gap-1.5"
            aria-label={m.inbox.screenTitle}
          >
            <InboxNavChip
              href={`/profile/my-plan?returnTo=${encodeURIComponent("/inbox")}` as Route}
              label={m.inbox.chipUpcomingPlan}
              title={m.inbox.chipUpcomingPlanLinkTitle}
              ariaLabel={upcomingPlanAria}
              count={plansNeedingYourAction}
              variant="myPlan"
              icon={<CalendarClock strokeWidth={2} aria-hidden />}
            />
            <InboxNavChip
              href={"/inbox/study-groups" as Route}
              label={m.inbox.chipStudyGroup}
              title={m.inbox.chipStudyGroupLinkTitle}
              ariaLabel={studyGroupAria}
              count={groupUnread}
              variant="muted"
              icon={<UsersRound strokeWidth={2} aria-hidden />}
            />
            <InboxNavChip
              href={"/inbox/course-chats" as Route}
              label={m.inbox.chipCourseChats}
              title={m.inbox.chipCourseChatsLinkTitle}
              ariaLabel={courseChatsAria}
              count={courseUnread}
              variant="muted"
              icon={<BookOpen strokeWidth={2} aria-hidden />}
            />
          </nav>
        ) : null}
      </header>

      {!isOnline ? (
        <OfflineStateCard
          title={m.offline.needsInternetTitle}
          description={m.offline.inboxNeedsInternetBody}
        />
      ) : (
        <InboxChatsView
          userId={userId}
          merged={merged}
          query={searchOpen ? query : ""}
          recommendedClassmates={recommendedClassmates}
        />
      )}
    </div>
  );
}
