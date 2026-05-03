import Link from "next/link";
import type { Route } from "next";
import { ChevronLeft } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Unified "Back" affordance used at the top-left of every non-root page.
 *
 * Visual contract (keep consistent across pages):
 *   - 40×40 hit target (h-10 w-10), rounded-full, hover/active tint.
 *   - ChevronLeft icon, 24px.
 *   - Always the first element in the page header.
 *
 * Tab root pages (`/home`, `/inbox`, `/discover`, `/courses`, `/profile`)
 * should NOT render this component; the bottom tab bar is their navigation.
 */
export function BackLink({
  href,
  label = "Back",
  className,
}: {
  href: Route | string;
  label?: string;
  className?: string;
}) {
  return (
    <Link
      href={href as Route}
      aria-label={label}
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted active:bg-muted/80",
        className,
      )}
    >
      <ChevronLeft className="h-6 w-6" strokeWidth={2} />
    </Link>
  );
}
