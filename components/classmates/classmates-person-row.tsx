"use client";

import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";

import { PresetAvatar } from "@/components/ui/preset-avatar";
import { cn } from "@/lib/utils";

/** Shared shell for course classmates, Discover people rows, and search hits. */
export const CLASSMATES_PERSON_ROW_CLASS = cn(
  "rounded-[24px] border border-[#E7E0D6] bg-white px-4 py-4 shadow-[0_4px_16px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] sm:px-5 sm:py-[1.125rem]",
  "dark:border-border dark:bg-card dark:shadow-[0_4px_14px_rgba(0,0,0,0.18)]",
  "[@media(hover:hover)]:hover:border-[#D4C9BA] [@media(hover:hover)]:hover:shadow-[0_6px_22px_rgba(15,23,42,0.08)]",
  "dark:[@media(hover:hover)]:hover:border-zinc-600",
);

/** Optional ring — Discover “shared courses” recommendation highlights. */
export const CLASSMATES_PERSON_ROW_AVATAR_RING_DISCOVER = cn(
  "ring-[3px] ring-classmates-blue-soft hover:ring-classmates-blue-border dark:ring-blue-950/60 dark:hover:ring-blue-500/35",
);

const avatarLinkClass = cn(
  "shrink-0 self-start rounded-full outline-none ring-offset-2 transition hover:opacity-90 active:opacity-80",
  "focus-visible:ring-2 focus-visible:ring-classmates-azure/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-card",
);

const contentLinkClass = cn(
  "block rounded-lg outline-none ring-offset-2",
  "focus-visible:ring-2 focus-visible:ring-classmates-azure/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-card",
);

export type ClassmatesPersonRowProps = {
  avatarHref: Route;
  /** Primary text block link; defaults to `avatarHref` (profile). */
  contentHref?: Route;
  avatarUrl: string | null;
  avatarSize?: 56 | 72;
  avatarLinkClassName?: string;
  profileAriaLabel: string;
  name: string;
  /** Merged onto the name span (e.g. post cards: `font-bold`). */
  nameClassName?: string;
  titleAdornment?: ReactNode;
  body?: ReactNode;
  /** Outside the main content link (intentions, large match cards, etc.). */
  footer?: ReactNode;
  /** Full-width row below the avatar + text flex (e.g. Discover post expiry + secondary CTA). */
  cardFooter?: ReactNode;
  /** Right column (e.g. message CTA). Omit when nothing should appear (e.g. your own post row). */
  action?: ReactNode;
  className?: string;
};

/**
 * One layout for “person in a list” surfaces: course classmates, Discover categories, search.
 * Keeps avatar + profile entry, main text link, optional footer, and an optional action column (full width on small screens).
 */
export function ClassmatesPersonRow({
  avatarHref,
  contentHref,
  avatarUrl,
  avatarSize = 56,
  avatarLinkClassName,
  profileAriaLabel,
  name,
  nameClassName,
  titleAdornment,
  body,
  footer,
  cardFooter,
  action,
  className,
}: ClassmatesPersonRowProps) {
  const mainHref = contentHref ?? avatarHref;

  return (
    <article className={cn(CLASSMATES_PERSON_ROW_CLASS, className)}>
      <div className="flex flex-row items-start gap-3 sm:gap-4">
        <Link
          href={avatarHref}
          className={cn(avatarLinkClass, avatarLinkClassName)}
          aria-label={profileAriaLabel}
        >
          <PresetAvatar id={avatarUrl} size={avatarSize} className="shrink-0" />
        </Link>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <Link href={mainHref} className={contentLinkClass}>
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  <span
                    className={cn(
                      "min-w-0 max-w-full text-[15px] font-semibold leading-tight tracking-tight text-classmates-ink dark:text-foreground",
                      nameClassName,
                    )}
                  >
                    {name}
                  </span>
                  {titleAdornment}
                </div>
                {body}
              </Link>
              {footer}
            </div>

            {action != null ? (
              <div className="w-full shrink-0 sm:w-auto sm:pt-0.5">{action}</div>
            ) : null}
          </div>
        </div>
      </div>
      {cardFooter}
    </article>
  );
}
