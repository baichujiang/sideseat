"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { BookOpen, Calendar, Inbox, UsersRound, UserRound } from "lucide-react";

import { EdgeSwipeBack } from "@/components/layout/edge-swipe-back";
import { InboxUnreadBadge } from "@/components/inbox/inbox-unread-badge";
import { PwaInstallBar } from "@/components/pwa/pwa-install-bar";
import { apiFetch } from "@/lib/auth/api-fetch";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/home", label: "Home", icon: Calendar },
  { href: "/courses", label: "Courses", icon: BookOpen },
  { href: "/discover", label: "Classmates", icon: UsersRound },
  { href: "/inbox", label: "Chats", icon: Inbox },
  { href: "/profile", label: "Me", icon: UserRound },
] satisfies Array<{ href: Route; label: string; icon: typeof Calendar }>;

/** Flat bar: light tint only (no nested “card” / shadow), like native tab selection. */
const navActiveTab =
  "rounded-[0.65rem] bg-classmates-blue/10 text-classmates-ink dark:bg-blue-500/15 dark:text-foreground";
const navInactiveTab =
  "group rounded-[0.65rem] text-classmates-sub active:bg-black/[0.04] dark:active:bg-white/[0.06] [@media(hover:hover)]:hover:bg-black/[0.04] dark:[@media(hover:hover)]:hover:bg-white/[0.06] [@media(hover:hover)]:hover:text-classmates-ink";

/** Mobile shell: bottom tab bar only (no top nav bar). */
export function AppShell({
  children,
  inboxUnreadTotal = 0,
}: {
  children: React.ReactNode;
  /** Total unread DM + course-room messages (same as inbox bundle). */
  inboxUnreadTotal?: number;
}) {
  const pathname = usePathname();
  const shellRef = useRef<HTMLDivElement>(null);
  const swipeBounds = useCallback(() => shellRef.current?.getBoundingClientRect() ?? null, []);
  const [liveUnreadTotal, setLiveUnreadTotal] = useState(inboxUnreadTotal);

  useEffect(() => {
    setLiveUnreadTotal(inboxUnreadTotal);
  }, [inboxUnreadTotal]);

  const refreshUnreadTotal = useCallback(async () => {
    const response = await apiFetch("/api/inbox/unread-total", {
      cache: "no-store",
    }).catch(() => null);
    if (!response?.ok) return;

    const payload = await response.json().catch(() => null);
    const next = payload?.data?.unreadTotal;
    if (typeof next === "number") {
      setLiveUnreadTotal(next);
    }
  }, []);

  useEffect(() => {
    void refreshUnreadTotal();

    const id = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void refreshUnreadTotal();
      }
    }, 10000);
    const onFocus = () => void refreshUnreadTotal();
    const onUnreadChanged = () => void refreshUnreadTotal();

    window.addEventListener("focus", onFocus);
    window.addEventListener("sideseat:inbox-unread-changed", onUnreadChanged);
    document.addEventListener("visibilitychange", onUnreadChanged);

    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("sideseat:inbox-unread-changed", onUnreadChanged);
      document.removeEventListener("visibilitychange", onUnreadChanged);
    };
  }, [refreshUnreadTotal]);

  useEffect(() => {
    void refreshUnreadTotal();
  }, [pathname, refreshUnreadTotal]);

  /** Full-height drill-ins: hide tab bar (chat thread, course chat, peer profile). */
  const isChatThread =
    /^\/connections\/[^/]+$/.test(pathname) ||
    /^\/users\/[^/]+$/.test(pathname) ||
    /^\/courses\/[^/]+\/chat$/.test(pathname) ||
    /^\/groups\/[^/]+$/.test(pathname);

  const isDiscover = pathname === "/discover" || pathname.startsWith("/discover/");
  const shellSurface = isDiscover && !isChatThread ? "bg-classmates-warm" : "bg-background";

  return (
    <div
      ref={shellRef}
      style={
        isChatThread
          ? undefined
          : ({
              "--bottom-nav-clearance": "calc(160px + env(safe-area-inset-bottom))",
            } as CSSProperties)
      }
      className={cn(
        "mx-auto flex min-w-0 max-w-md flex-col",
        shellSurface,
        "h-dvh max-h-dvh overflow-hidden",
      )}
    >
      <Suspense fallback={null}>
        <EdgeSwipeBack getBounds={swipeBounds} />
      </Suspense>
      <main
        className={cn(
          "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden",
          shellSurface,
          isChatThread
            ? "px-0 pb-0 pt-[max(0.25rem,env(safe-area-inset-top))]"
            : "overflow-y-auto overscroll-y-contain px-3 pb-[var(--bottom-nav-clearance)] pt-3 sm:px-3",
        )}
      >
        {children}
      </main>
      {isChatThread ? null : <PwaInstallBar />}
      {isChatThread ? null : (
        <nav
          className="fixed bottom-0 left-1/2 z-20 flex w-full max-w-md -translate-x-1/2 items-stretch border-t border-classmates-edge/80 bg-classmates-warm-alt/95 px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl supports-[backdrop-filter]:bg-classmates-warm-alt/92 dark:border-border/50 dark:bg-background/92"
          aria-label="Main navigation"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-[3rem] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1 text-[10px] font-semibold leading-tight transition-[background-color,color] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isActive ? navActiveTab : navInactiveTab,
                )}
              >
                <span className="relative inline-flex shrink-0">
                  <Icon
                    className={cn(
                      "h-5 w-5 transition-colors duration-200",
                      isActive
                        ? "text-classmates-blue dark:text-blue-400"
                        : "text-classmates-sub group-hover:text-classmates-ink",
                    )}
                    strokeWidth={isActive ? 2.5 : 2}
                    aria-hidden
                  />
                  {item.href === "/inbox" ? (
                    <span className="pointer-events-none absolute -right-1 -top-1">
                      <InboxUnreadBadge count={liveUnreadTotal} variant="countBrand" />
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "truncate transition-colors duration-200",
                    isActive
                      ? "font-semibold text-classmates-ink dark:text-foreground"
                      : "text-classmates-sub group-hover:text-classmates-ink",
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
