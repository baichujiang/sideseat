"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { useAppMessages } from "@/hooks/use-app-locale";
import { resolveBackHref } from "@/lib/nav/back";
import { cn } from "@/lib/utils";

/**
 * Unified "Back" affordance used at the top-left of every non-root page.
 *
 * Pass `fallback` (logical parent). Optionally pass `returnTo` from the page's
 * `searchParams` — when omitted, `href` can still carry an explicit target.
 */
export function BackLink({
  href,
  returnTo,
  fallback,
  label,
  className,
}: {
  /** Explicit target; when set with `returnTo`, `returnTo` wins after resolution. */
  href?: Route | string;
  /** Raw `?returnTo=` from the URL (server-passed). */
  returnTo?: string | null;
  /** Default when `returnTo` is missing or unsafe (required). */
  fallback: string;
  label?: string;
  className?: string;
}) {
  const m = useAppMessages();
  const pathname = usePathname();
  const resolved = resolveBackHref(returnTo ?? (typeof href === "string" ? href : null), fallback, pathname);
  const resolvedLabel = label ?? m.common.back;

  return (
    <Link
      href={resolved as Route}
      aria-label={resolvedLabel}
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#E7E0D6] bg-white text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-[#D4C9BA] hover:bg-[#FAF8F5] active:bg-[#F3EFE8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:border-border dark:bg-card dark:shadow-none dark:hover:bg-muted/60 dark:active:bg-muted/80 dark:focus-visible:ring-blue-400/40",
        className,
      )}
    >
      <ChevronLeft className="h-5 w-5" strokeWidth={2.25} aria-hidden />
    </Link>
  );
}
