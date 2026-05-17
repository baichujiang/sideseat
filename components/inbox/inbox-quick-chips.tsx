"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { CalendarClock, MoreHorizontal, Search, Sparkles } from "lucide-react";

import { InboxChatsView } from "@/components/inbox/inbox-chats-view";
import { InboxCreateSheet } from "@/components/inbox/inbox-create-sheet";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAppMessages } from "@/hooks/use-app-locale";
import { formatMessage } from "@/lib/i18n/messages";
import type { InboxMerged } from "@/lib/queries/inbox-merge";
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
    <span className="flex min-h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#F43F5E] px-1.5 text-[11px] font-semibold leading-none text-white">
      {label}
    </span>
  );
}

export function InboxChatsShell({
  title,
  subtitle,
  userId,
  merged,
  unreadTotal,
  plansNeedingYourAction,
  scheduleShareProposalsPending,
  activePostCount,
  initialContacts,
  showCreateSheet,
}: {
  title: string;
  subtitle: string;
  userId: string;
  merged: InboxMerged[];
  unreadTotal: number;
  plansNeedingYourAction: number;
  scheduleShareProposalsPending: number;
  activePostCount: number;
  initialContacts: ContactRow[];
  showCreateSheet: boolean;
}) {
  const m = useAppMessages();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);

  const unreadAria =
    unreadTotal > 0
      ? formatMessage(m.inbox.chipNewAriaWithUnread, { count: unreadTotal })
      : m.inbox.chipNewAria;

  const scheduleRequestsAria =
    scheduleShareProposalsPending > 0
      ? formatMessage(m.inbox.chipScheduleRequestsAriaWithCount, {
          count: scheduleShareProposalsPending,
        })
      : m.inbox.chipScheduleRequestsAria;

  return (
    <div className="space-y-3">
      <header className="px-0.5">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="min-w-0">
            <h1 className="page-screen-title">{title}</h1>
            <p className="page-screen-subtitle mt-0.5">{subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
            <Link
              href={"/inbox/unread" as Route}
              title={m.inbox.chipNewLinkTitle}
              aria-label={unreadAria}
              className={cn(
                "inline-flex h-9 max-w-full items-center gap-1.5 rounded-full border border-classmates-blue-border/80 bg-classmates-blue-soft px-3 py-1.5 text-[13px] font-semibold text-classmates-blue-body transition-opacity active:opacity-80",
                "[@media(hover:hover)]:hover:opacity-90 dark:border-blue-800/50 dark:bg-blue-950/35 dark:text-blue-100",
              )}
            >
              <Sparkles className="h-4 w-4 shrink-0 text-[#2563EB]" strokeWidth={2} aria-hidden />
              <span className="truncate">{m.inbox.chipNew}</span>
              <CountBadge count={unreadTotal} />
            </Link>

            {scheduleShareProposalsPending > 0 ? (
              <Link
                href={"/inbox/schedule-requests" as Route}
                title={m.inbox.chipScheduleRequestsLinkTitle}
                aria-label={scheduleRequestsAria}
                className={cn(
                  "inline-flex h-9 max-w-full items-center gap-1.5 rounded-full border border-amber-200/90 bg-amber-50 px-3 py-1.5 text-[13px] font-semibold text-amber-950 transition-opacity active:opacity-80",
                  "[@media(hover:hover)]:hover:opacity-90 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-100",
                )}
              >
                <CalendarClock className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" strokeWidth={2} aria-hidden />
                <span className="truncate">{m.inbox.chipScheduleRequests}</span>
                <CountBadge count={scheduleShareProposalsPending} />
              </Link>
            ) : null}

            {plansNeedingYourAction > 0 ? (
              <Link
                href={"/profile/my-plan" as Route}
                title={m.inbox.chipPlansLinkTitle}
                aria-label={
                  plansNeedingYourAction > 0
                    ? formatMessage(m.inbox.chipPlansAriaWithCount, { count: plansNeedingYourAction })
                    : m.inbox.chipPlansAria
                }
                className={cn(
                  "inline-flex h-9 max-w-full items-center gap-1.5 rounded-full border border-border/80 bg-muted/50 px-3 py-1.5 text-[13px] font-semibold text-foreground transition-opacity active:opacity-80",
                  "[@media(hover:hover)]:hover:opacity-90",
                )}
              >
                <span className="truncate">{m.inbox.chipPlans}</span>
                <CountBadge count={plansNeedingYourAction} />
              </Link>
            ) : null}

            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={searchOpen ? m.inbox.headerSearchCloseAria : m.inbox.headerSearchOpenAria}
              aria-pressed={searchOpen}
              className="h-9 w-9 shrink-0 rounded-full border-border"
              onClick={() => setSearchOpen((v) => !v)}
            >
              <Search className="h-4 w-4" strokeWidth={2} aria-hidden />
            </Button>

            <Popover open={moreOpen} onOpenChange={setMoreOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={m.inbox.headerMoreMenuAria}
                  className="h-9 w-9 shrink-0 rounded-full border-border"
                >
                  <MoreHorizontal className="h-4 w-4" strokeWidth={2} aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-1.5">
                <nav className="flex flex-col gap-0.5" aria-label={m.inbox.headerMoreMenuAria}>
                  <MenuCountLink
                    href={"/inbox/schedule-requests" as Route}
                    label={m.inbox.headerMenuScheduleRequests}
                    count={scheduleShareProposalsPending}
                    onNavigate={() => setMoreOpen(false)}
                  />
                  <MenuCountLink
                    href={"/profile/my-plan" as Route}
                    label={m.inbox.headerMenuMyPlan}
                    count={plansNeedingYourAction}
                    onNavigate={() => setMoreOpen(false)}
                  />
                  <MenuCountLink
                    href={"/profile/my-posts" as Route}
                    label={m.inbox.headerMenuMyPosts}
                    count={activePostCount}
                    onNavigate={() => setMoreOpen(false)}
                  />
                  <MenuCountLink
                    href={"/profile/saved-posts" as Route}
                    label={m.inbox.headerMenuSavedPosts}
                    onNavigate={() => setMoreOpen(false)}
                  />
                </nav>
              </PopoverContent>
            </Popover>

            {showCreateSheet ? <InboxCreateSheet initialContacts={initialContacts} /> : null}
          </div>
        </div>
      </header>

      <InboxChatsView
        userId={userId}
        merged={merged}
        query={query}
        onQueryChange={setQuery}
        showSearchField={searchOpen}
      />
    </div>
  );
}

function MenuCountLink({
  href,
  label,
  count,
  onNavigate,
}: {
  href: Route;
  label: string;
  count?: number;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors active:bg-muted [@media(hover:hover)]:hover:bg-muted/80"
    >
      <span>{label}</span>
      {typeof count === "number" && count > 0 ? (
        <span className="tabular-nums text-[12px] text-muted-foreground">{count > 99 ? "99+" : count}</span>
      ) : null}
    </Link>
  );
}
