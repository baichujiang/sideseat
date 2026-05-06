import { Users } from "lucide-react";

import { cn } from "@/lib/utils";

const chipClass =
  "inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#F0FDFA] px-3 py-1.5 text-sm font-semibold text-[#0F766E] dark:border dark:border-teal-800/50 dark:bg-teal-950/40 dark:text-teal-100";

/**
 * Course hero — how many people (classmates) are in scope; icon + words so it’s self-explanatory.
 * On narrow viewports we always show `label`; from `md:` up, optional `compactHeadline` (e.g. "9")
 * keeps the header row calmer — `title` carries the full meaning on hover.
 */
export function CourseClassmatesCountChip({
  label,
  title,
  compactHeadline,
  className,
}: {
  /** e.g. "9 classmates", "Just you", "No one yet" */
  label: string;
  /** Shown in native tooltip on hover when using compact headline */
  title: string;
  /** If set: full `label` below md, icon + this from md breakpoint up */
  compactHeadline?: string;
  className?: string;
}) {
  return (
    <span title={title} aria-label={label} className={cn(chipClass, className)}>
      <Users className="h-[15px] w-[15px] shrink-0" strokeWidth={2.25} aria-hidden />
      {compactHeadline ? (
        <>
          <span className="min-w-0 leading-snug md:hidden">{label}</span>
          <span className="hidden min-w-0 tabular-nums leading-none md:inline">{compactHeadline}</span>
        </>
      ) : (
        <span className="min-w-0 leading-snug">{label}</span>
      )}
    </span>
  );
}
