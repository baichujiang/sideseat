"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
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

const navItemTone: Partial<
  Record<
    Route,
    {
      activeTab: string;
      activeIcon: string;
      activeLabel: string;
      inactiveHover: string;
      inactiveIcon: string;
      inactiveLabel: string;
    }
  >
> = {
  "/courses": {
    activeTab: "bg-[#FFF0D9] text-[#B45309] shadow-[0_1px_2px_rgba(180,83,9,0.10)]",
    activeIcon: "text-[#D97706]",
    activeLabel: "text-[#B45309]",
    inactiveHover: "hover:bg-[#FFF7ED] hover:text-[#9A5B13]",
    inactiveIcon: "text-[#D29B5A] group-hover:text-[#C27117]",
    inactiveLabel: "text-[#9C7A4D] group-hover:text-[#9A5B13]",
  },
  "/discover": {
    activeTab: "bg-classmates-blue-soft/90 text-classmates-blue shadow-[0_1px_2px_rgba(37,99,235,0.08)]",
    activeIcon: "text-classmates-blue",
    activeLabel: "text-classmates-blue",
    inactiveHover: "hover:bg-[#EEF6FF] hover:text-[#2563EB]",
    inactiveIcon: "text-[#72A7E8] group-hover:text-[#2563EB]",
    inactiveLabel: "text-[#5E88B8] group-hover:text-[#2563EB]",
  },
};

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
      <EdgeSwipeBack getBounds={swipeBounds} />
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
          className="fixed bottom-0 left-1/2 z-20 w-full max-w-md -translate-x-1/2 border-t border-classmates-edge bg-classmates-warm-alt/95 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl supports-[backdrop-filter]:bg-classmates-warm-alt/92"
          aria-label="Main navigation"
        >
          <div className="flex rounded-[1.5rem] border border-classmates-edge bg-classmates-warm-alt/95 px-1 py-1 shadow-soft backdrop-blur-xl supports-[backdrop-filter]:bg-classmates-warm-alt/90">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const tone = navItemTone[item.href];

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex min-h-[3rem] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[20px] px-1.5 py-1.5 text-[11px] font-semibold leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    isActive
                      ? tone?.activeTab ?? "bg-classmates-mint/85 text-classmates-ink shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                      : tone?.inactiveHover ?? "group text-classmates-sub hover:bg-classmates-mint/55 hover:text-classmates-ink",
                    !isActive && !tone && "group text-classmates-sub hover:bg-classmates-mint/55 hover:text-classmates-ink",
                  )}
                >
                  <span className="relative inline-flex shrink-0">
                    <Icon
                      className={cn(
                        "h-5 w-5",
                        isActive
                          ? tone?.activeIcon ?? "text-classmates-ink"
                          : tone?.inactiveIcon ?? "text-classmates-sub group-hover:text-classmates-ink",
                      )}
                      strokeWidth={isActive ? 2.25 : 2}
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
                      "truncate",
                      isActive
                        ? tone?.activeLabel ?? "text-classmates-ink"
                        : tone?.inactiveLabel ?? "text-classmates-sub group-hover:text-classmates-ink",
                    )}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
