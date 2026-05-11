"use client";

import Link from "next/link";
import type { Route } from "next";
import { ChevronLeft } from "lucide-react";

import { useAppMessages } from "@/hooks/use-app-locale";
import { cn } from "@/lib/utils";

/**
 * Unified "Back" affordance used at the top-left of every non-root page.
 *
 * Visual contract (keep consistent across pages):
 *   - 40×40 tap target, rounded-full, white pill + warm hairline border (mobile-friendly).
 *   - ChevronLeft icon.
 *   - Always the first element in the page header.
 *
 * Tab root pages (`/home`, `/inbox`, `/discover`, `/courses`, `/profile`)
 * should NOT render this component; the bottom tab bar is their navigation.
 */
export function BackLink({
  href,
  label,
  className,
}: {
  href: Route | string;
  /** Falls back to locale-aware `common.back` when omitted. */
  label?: string;
  className?: string;
}) {
  const m = useAppMessages();
  const resolved = label ?? m.common.back;

  return (
    <Link
      href={href as Route}
      aria-label={resolved}
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#E7E0D6] bg-white text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-[#D4C9BA] hover:bg-[#FAF8F5] active:bg-[#F3EFE8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:border-border dark:bg-card dark:shadow-none dark:hover:bg-muted/60 dark:active:bg-muted/80 dark:focus-visible:ring-blue-400/40",
        className,
      )}
    >
      <ChevronLeft className="h-5 w-5" strokeWidth={2.25} aria-hidden />
    </Link>
  );
}
