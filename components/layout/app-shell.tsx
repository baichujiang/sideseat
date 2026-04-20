"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { BookOpen, Compass, Home, Inbox, UserRound } from "lucide-react";

import { cn } from "@/lib/utils";

const navItems = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/courses", label: "Courses", icon: BookOpen },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/profile", label: "Profile", icon: UserRound },
] satisfies Array<{ href: Route; label: string; icon: typeof Home }>;

/** Mobile shell: bottom tab bar only (no top nav bar). */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-background">
      <main className="relative flex-1 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5 sm:pt-4">
        {children}
      </main>
      <nav
        className="fixed bottom-0 left-1/2 z-20 w-full max-w-md -translate-x-1/2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1"
        aria-label="Main navigation"
      >
        <div className="flex rounded-[1.75rem] border border-border bg-background/95 px-2 py-2 shadow-soft backdrop-blur-md supports-[backdrop-filter]:bg-background/90">
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
                    ? "bg-secondary text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                )}
              >
                <Icon className="h-[1.125rem] w-[1.125rem] shrink-0" aria-hidden />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
