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
  { href: "/inbox", label: "Contacts", icon: Inbox },
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

  return (
    <div
      style={
        isChatThread
          ? undefined
          : ({
              "--bottom-nav-clearance": "calc(5.75rem + env(safe-area-inset-bottom))",
            } as CSSProperties)
      }
      className={cn(
        "mx-auto flex max-w-md flex-col bg-background",
        isChatThread ? "h-dvh max-h-dvh overflow-hidden" : "min-h-dvh",
      )}
    >
      <main
        className={cn(
          "relative flex min-h-0 flex-1 flex-col",
          isChatThread
            ? "px-0 pb-0 pt-[max(0.25rem,env(safe-area-inset-top))]"
            : "px-4 pb-[var(--bottom-nav-clearance)] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5 sm:pt-4",
        )}
      >
        {children}
      </main>
      {isChatThread ? null : <PwaInstallBar />}
      {isChatThread ? null : (
        <nav
          className="fixed bottom-0 left-1/2 z-20 w-full max-w-md -translate-x-1/2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1"
          aria-label="Main navigation"
        >
          <div className="flex rounded-[1.75rem] border border-[#E7E0D6] bg-[#FAF9F6]/95 px-2 py-2 shadow-soft backdrop-blur-md supports-[backdrop-filter]:bg-[#FAF9F6]/90">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex min-h-[3rem] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5 text-[11px] font-medium leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    isActive
                      ? "bg-[#E8F1F0] text-[#111827] shadow-sm"
                      : "group text-[#5F6B7A] hover:bg-[#E8F1F0]/50 hover:text-[#111827]",
                  )}
                >
                  <span className="relative inline-flex shrink-0">
                    <Icon
                      className={cn(
                        "h-[1.125rem] w-[1.125rem]",
                        isActive ? "text-[#2563EB]" : "text-[#5F6B7A] group-hover:text-[#111827]",
                      )}
                      aria-hidden
                    />
                    {item.href === "/inbox" ? (
                      <span className="pointer-events-none absolute -right-2 -top-2">
                        <InboxUnreadBadge count={inboxUnreadTotal} />
                      </span>
                    ) : null}
                  </span>
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
