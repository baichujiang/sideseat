import { cn } from "@/lib/utils";

/**
 * School/program and related profile inputs — soft border, warm fill, blue focus ring.
 * Keep in sync with how fields read in the Me /profile edit sheet.
 */
export const profileSettingsControlClassName =
  "box-border h-11 min-h-11 w-full rounded-[20px] border border-classmates-edge bg-classmates-warm-alt px-3.5 py-0 text-[14px] leading-snug text-foreground shadow-none transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground/60 focus:border-classmates-azure focus:bg-classmates-surface focus:outline-none focus:ring-[3px] focus:ring-classmates-azure/25 focus-visible:border-classmates-azure focus-visible:bg-classmates-surface focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-classmates-azure/25 dark:border-border dark:bg-background/70 dark:focus:bg-card dark:focus-visible:bg-card";

/** Small uppercase label above a settings-style field (peer “About” / form field). */
export const profileFieldMicroLabelClassName =
  "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-classmates-sub dark:text-zinc-400";

export function profileSettingsInputClassName(extra?: string) {
  return cn(profileSettingsControlClassName, extra);
}
