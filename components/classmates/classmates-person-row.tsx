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
  /**
   * First row only: sits to the right of the truncated name (e.g. school verification).
   * Use `titleAdornment` for gender / pills on the next line.
   */
  nameRowAdornment?: ReactNode;
  /** Second row under the name (e.g. gender icon, “chatting” chips). */
  titleAdornment?: ReactNode;
  body?: ReactNode;
  /** Outside the main content link (intentions, large match cards, etc.). */
  footer?: ReactNode;
  /** Full-width row below the avatar + text flex (e.g. Discover post expiry + secondary CTA). */
  cardFooter?: ReactNode;
  /**
   * Pinned to the top-right of the card (e.g. Discover post save). Adds horizontal reserve so
   * the header text does not run under the control.
   */
  cardTopRightAction?: ReactNode;
  /** Right column (e.g. message CTA). Omit when nothing should appear (e.g. your own post row). */
  action?: ReactNode;
  /**
   * Renders to the right of the heading column (outside the profile link), aligned with the top.
   * Use for compact list CTAs (e.g. Discover people rows). Pair optional `action` for extra
   * non-button content shown below the main body block.
   */
  titleRowAction?: ReactNode;
  className?: string;
  /** When true, avatar and main blocks are non-links (e.g. dev-only example post cards). */
  disableNavigation?: boolean;
};

/**
 * One layout for “person in a list” surfaces: course classmates, Discover categories, search.
 * Keeps avatar + profile entry, main text link, optional footer, and an optional action column
 * (full width on small screens), or `titleRowAction` for a trailing CTA on the name row (e.g. Discover
 * people rows). Use `cardTopRightAction` for controls pinned to the card corner (e.g. post save).
 * `nameRowAdornment` stays on the name row; `titleAdornment` renders on the line below.
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
  nameRowAdornment,
  titleAdornment,
  body,
  footer,
  cardFooter,
  cardTopRightAction,
  action,
  titleRowAction,
  className,
  disableNavigation = false,
}: ClassmatesPersonRowProps) {
  const mainHref = contentHref ?? avatarHref;

  const headingBlock = (
    <div className="min-w-0 space-y-0.5">
      <div className="flex min-w-0 items-center gap-x-1.5">
        <span
          className={cn(
            "min-w-0 shrink truncate text-[15px] font-semibold leading-tight tracking-tight text-classmates-ink dark:text-foreground",
            nameClassName,
          )}
        >
          {name}
        </span>
        {nameRowAdornment != null ? (
          <span className="inline-flex shrink-0 items-center gap-x-1">{nameRowAdornment}</span>
        ) : null}
      </div>
      {titleAdornment != null ? (
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">{titleAdornment}</div>
      ) : null}
    </div>
  );

  return (
    <article
      className={cn(CLASSMATES_PERSON_ROW_CLASS, className, cardTopRightAction != null && "relative")}
    >
      {cardTopRightAction != null ? (
        <div className="pointer-events-auto absolute right-2 top-2 z-20 sm:right-3 sm:top-3">
          {cardTopRightAction}
        </div>
      ) : null}
      <div
        className={cn(
          "flex flex-row items-start gap-3 sm:gap-4",
          cardTopRightAction != null && "pr-11 sm:pr-12",
        )}
      >
        {disableNavigation ? (
          <span
            className={cn(avatarLinkClass, avatarLinkClassName, "cursor-default hover:opacity-100")}
            aria-label={profileAriaLabel}
          >
            <PresetAvatar id={avatarUrl} size={avatarSize} className="shrink-0" />
          </span>
        ) : (
          <Link
            href={avatarHref}
            className={cn(avatarLinkClass, avatarLinkClassName)}
            aria-label={profileAriaLabel}
          >
            <PresetAvatar id={avatarUrl} size={avatarSize} className="shrink-0" />
          </Link>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {titleRowAction != null ? (
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex min-w-0 flex-row items-start gap-2">
                {disableNavigation ? (
                  <span
                    className={cn(contentLinkClass, "min-w-0 flex-1 cursor-default overflow-hidden")}
                  >
                    {headingBlock}
                  </span>
                ) : (
                  <Link href={mainHref} className={cn(contentLinkClass, "min-w-0 flex-1 overflow-hidden")}>
                    {headingBlock}
                  </Link>
                )}
                <div className="shrink-0 pt-0.5">{titleRowAction}</div>
              </div>
              {body != null ? (
                disableNavigation ? (
                  <span className={cn(contentLinkClass, "cursor-default")}>{body}</span>
                ) : (
                  <Link href={mainHref} className={contentLinkClass}>
                    {body}
                  </Link>
                )
              ) : null}
              {footer}
              {action != null ? <div className="w-full pt-0.5 sm:flex sm:justify-end">{action}</div> : null}
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                {disableNavigation ? (
                  <div className={cn(contentLinkClass, "cursor-default")}>
                    {headingBlock}
                    {body}
                  </div>
                ) : (
                  <Link href={mainHref} className={contentLinkClass}>
                    {headingBlock}
                    {body}
                  </Link>
                )}
                {footer}
              </div>

              {action != null ? (
                <div className="w-full shrink-0 sm:w-auto sm:pt-0.5">{action}</div>
              ) : null}
            </div>
          )}
        </div>
      </div>
      {cardFooter}
    </article>
  );
}
