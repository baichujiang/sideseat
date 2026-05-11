/**
 * Shared list-row chrome for Me page sections (matches TipSupportCard collapsed summary).
 */

import { cn } from "@/lib/utils";

export const meSettingsRowDetailsSummaryClass =
  "flex cursor-pointer list-none items-center justify-between gap-2.5 px-3 py-2.5 transition-colors active:bg-classmates-warm-alt dark:active:bg-muted/30 [&::-webkit-details-marker]:hidden [@media(hover:hover)]:hover:bg-classmates-warm-alt dark:[@media(hover:hover)]:hover:bg-muted/25";

/** Standalone Tip card `<summary>` (slightly softer hover than in-list). */
export const meSettingsRowCardSummaryClass =
  "flex cursor-pointer list-none items-center justify-between gap-2.5 px-3 py-2.5 transition-colors active:bg-classmates-warm-alt/80 dark:active:bg-muted/30 [&::-webkit-details-marker]:hidden [@media(hover:hover)]:hover:bg-classmates-warm-alt/60 dark:[@media(hover:hover)]:hover:bg-muted/20";

export const meSettingsRowButtonClass =
  "flex w-full cursor-pointer items-center justify-between gap-2.5 px-3 py-2.5 text-left transition-colors active:bg-classmates-warm-alt dark:active:bg-muted/30 [@media(hover:hover)]:hover:bg-classmates-warm-alt dark:[@media(hover:hover)]:hover:bg-muted/25";

export const meSettingsRowLinkClass =
  "flex items-center justify-between gap-2.5 px-3 py-2.5 transition-colors active:bg-classmates-warm-alt dark:active:bg-muted/30 [@media(hover:hover)]:hover:bg-classmates-warm-alt dark:[@media(hover:hover)]:hover:bg-muted/25";

export const meSettingsRowLeadClass = "flex min-w-0 flex-1 items-center gap-2.5";

export const meSettingsRowIconShellClass =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full";

/**
 * Me list-row left icons: same shape (round + soft diagonal gradient + icon tint), distinct hues per row.
 */
export const meSettingsRowTipIconShellClass = cn(
  meSettingsRowIconShellClass,
  "bg-gradient-to-br from-amber-400/20 to-rose-400/20 text-amber-600 dark:from-amber-400/15 dark:to-rose-400/15 dark:text-amber-400",
);

export const meSettingsRowInstallIconShellClass = cn(
  meSettingsRowIconShellClass,
  "bg-gradient-to-br from-emerald-400/20 to-teal-400/20 text-emerald-700 dark:from-emerald-400/15 dark:to-teal-400/15 dark:text-emerald-400",
);

/** Sky → indigo reads better than sky → blue at 16px; pairs with “write / send feedback” icon. */
export const meSettingsRowFeedbackIconSurfaceClass =
  "bg-gradient-to-br from-sky-400/22 to-indigo-400/18 text-sky-700 dark:from-sky-400/15 dark:to-indigo-400/14 dark:text-sky-300";

export const meSettingsRowFeedbackIconShellClass = cn(
  meSettingsRowIconShellClass,
  meSettingsRowFeedbackIconSurfaceClass,
);

/** Me toolbar feedback control (matches list row hue, slightly larger). */
export const meSettingsRowFeedbackIconShellLargeClass = cn(
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-sky-500/25 shadow-sm dark:border-sky-400/20",
  meSettingsRowFeedbackIconSurfaceClass,
);

export const meSettingsRowAccountIconShellClass = cn(
  meSettingsRowIconShellClass,
  "bg-gradient-to-br from-violet-400/20 to-indigo-400/20 text-violet-700 dark:from-violet-400/15 dark:to-indigo-400/15 dark:text-violet-400",
);

export const meSettingsRowLogoutIconSurfaceClass =
  "bg-gradient-to-br from-rose-400/20 to-orange-400/18 text-rose-700 dark:from-rose-400/15 dark:to-orange-400/12 dark:text-rose-400";

export const meSettingsRowLogoutIconShellClass = cn(
  meSettingsRowIconShellClass,
  meSettingsRowLogoutIconSurfaceClass,
);

/** Preferences screen row (matches other account list icons at h-10). */
export const meSettingsRowLogoutIconShellLargeClass = cn(
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
  meSettingsRowLogoutIconSurfaceClass,
);

export const meSettingsRowTitleClass =
  "truncate text-[13px] font-semibold leading-tight text-foreground";

export const meSettingsRowSubtitleClass =
  "truncate text-[11px] leading-snug text-muted-foreground";

export const meSettingsRowChevronClass = "h-4 w-4 shrink-0 text-muted-foreground/50";

export const meSettingsRowChevronDownClass =
  "h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform duration-200 group-open:rotate-180";

export function MeSettingsRowLabel({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="min-w-0 flex-1 text-left">
      <p className={meSettingsRowTitleClass}>{title}</p>
      {subtitle != null && subtitle.trim() ? (
        <p className={meSettingsRowSubtitleClass}>{subtitle}</p>
      ) : null}
    </div>
  );
}
