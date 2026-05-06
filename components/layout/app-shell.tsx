"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";
import { BookOpen, Calendar, Inbox, UsersRound, UserRound } from "lucide-react";

import { InboxUnreadBadge } from "@/components/inbox/inbox-unread-badge";
import { PwaInstallBar } from "@/components/pwa/pwa-install-bar";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/home", label: "Home", icon: Calendar },
  { href: "/courses", label: "Courses", icon: BookOpen },
  { href: "/discover", label: "Classmates", icon: UsersRound },
  { href: "/inbox", label: "Chats", icon: Inbox },
  { href: "/profile", label: "Me", icon: UserRound },
] satisfies Array<{ href: Route; label: string; icon: typeof Calendar }>;

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
  /** Full-height drill-ins: hide tab bar (chat thread, course chat, peer profile). */
  const isChatThread =
    /^\/connections\/[^/]+$/.test(pathname) ||
    /^\/users\/[^/]+$/.test(pathname) ||
    /^\/courses\/[^/]+\/chat$/.test(pathname);

  const isDiscover = pathname === "/discover" || pathname.startsWith("/discover/");
  const shellSurface = isDiscover && !isChatThread ? "bg-classmates-warm" : "bg-background";

  return (
    <div
      style={
        isChatThread
          ? undefined
          : ({
              "--bottom-nav-clearance": "calc(160px + env(safe-area-inset-bottom))",
            } as CSSProperties)
      }
      className={cn(
        "mx-auto flex max-w-md flex-col",
        shellSurface,
        isChatThread ? "h-dvh max-h-dvh overflow-hidden" : "min-h-dvh",
      )}
    >
      <main
        className={cn(
          "relative flex min-h-0 flex-1 flex-col",
          shellSurface,
          isChatThread
            ? "px-0 pb-0 pt-[max(0.25rem,env(safe-area-inset-top))]"
            : "px-3 pb-[var(--bottom-nav-clearance)] pt-3 sm:px-3",
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
              const classmatesTabActive = isActive && item.href === "/discover";

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex min-h-[3rem] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[20px] px-1.5 py-1.5 text-[11px] font-semibold leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    classmatesTabActive
                      ? "bg-classmates-blue-soft/90 text-classmates-blue shadow-[0_1px_2px_rgba(37,99,235,0.08)]"
                      : isActive
                        ? "bg-classmates-mint/85 text-classmates-ink shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                        : "group text-classmates-sub hover:bg-classmates-mint/55 hover:text-classmates-ink",
                  )}
                >
                  <span className="relative inline-flex shrink-0">
                    <Icon
                      className={cn(
                        "h-5 w-5",
                        classmatesTabActive
                          ? "text-classmates-blue"
                          : isActive
                            ? "text-classmates-ink"
                            : "text-classmates-sub group-hover:text-classmates-ink",
                      )}
                      strokeWidth={isActive ? 2.25 : 2}
                      aria-hidden
                    />
                    {item.href === "/inbox" ? (
                      <span className="pointer-events-none absolute -right-1 -top-1">
                        <InboxUnreadBadge count={inboxUnreadTotal} variant="countBrand" />
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "truncate",
                      classmatesTabActive
                        ? "text-classmates-blue"
                        : isActive
                          ? "text-classmates-ink"
                          : "text-classmates-sub group-hover:text-classmates-ink",
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
