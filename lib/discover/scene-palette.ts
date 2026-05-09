import { ClassmatePostCategory } from "@prisma/client";

export type SceneTabPalette = "teal" | "indigo" | "amber" | "violet" | "rose";

export const SCENE_TAB_PALETTE: Record<
  SceneTabPalette,
  {
    surface: string;
    surfaceActive: string;
    icon: string;
    iconActive: string;
    label: string;
    labelActive: string;
  }
> = {
  teal: {
    surface:
      "border-teal-200/85 bg-gradient-to-b from-teal-50/95 via-white to-white shadow-[0_2px_8px_-2px_rgba(13,148,136,0.12),inset_0_1px_0_rgba(255,255,255,0.65)] dark:border-teal-500/28 dark:from-teal-950/42 dark:via-zinc-900/40 dark:to-zinc-950/80 dark:shadow-[0_2px_12px_-4px_rgba(45,212,191,0.08)]",
    surfaceActive:
      "border-teal-400/75 bg-gradient-to-br from-teal-100 via-emerald-50 to-teal-50 shadow-[0_8px_24px_-6px_rgba(13,148,136,0.38),inset_0_1px_0_rgba(255,255,255,0.55)] ring-2 ring-teal-400/25 ring-offset-2 ring-offset-background dark:border-teal-400/50 dark:from-teal-900/58 dark:via-emerald-950/45 dark:to-teal-950/52 dark:ring-teal-400/20 dark:ring-offset-zinc-950 dark:shadow-[0_10px_28px_-8px_rgba(45,212,191,0.18)]",
    icon: "text-teal-600 dark:text-teal-400",
    iconActive: "text-teal-800 dark:text-teal-200",
    label: "text-teal-950/88 dark:text-teal-100/90",
    labelActive: "text-teal-950 dark:text-teal-50",
  },
  indigo: {
    surface:
      "border-indigo-200/82 bg-gradient-to-b from-indigo-50/92 via-white to-white shadow-[0_2px_8px_-2px_rgba(79,70,229,0.11),inset_0_1px_0_rgba(255,255,255,0.65)] dark:border-indigo-500/26 dark:from-indigo-950/40 dark:via-zinc-900/40 dark:to-zinc-950/80",
    surfaceActive:
      "border-indigo-400/72 bg-gradient-to-br from-indigo-100 via-sky-50 to-indigo-50 shadow-[0_8px_24px_-6px_rgba(79,70,229,0.34)] ring-2 ring-indigo-400/25 ring-offset-2 ring-offset-background dark:border-indigo-400/48 dark:from-indigo-900/55 dark:via-sky-950/38 dark:to-indigo-950/50 dark:ring-indigo-400/22 dark:ring-offset-zinc-950 dark:shadow-[0_10px_28px_-8px_rgba(129,140,248,0.16)]",
    icon: "text-indigo-600 dark:text-indigo-400",
    iconActive: "text-indigo-800 dark:text-indigo-200",
    label: "text-indigo-950/88 dark:text-indigo-100/90",
    labelActive: "text-indigo-950 dark:text-indigo-50",
  },
  amber: {
    surface:
      "border-amber-200/85 bg-gradient-to-b from-amber-50/95 via-white to-white shadow-[0_2px_8px_-2px_rgba(245,158,11,0.14),inset_0_1px_0_rgba(255,255,255,0.65)] dark:border-amber-500/26 dark:from-amber-950/38 dark:via-zinc-900/40 dark:to-zinc-950/80",
    surfaceActive:
      "border-amber-400/72 bg-gradient-to-br from-amber-100 via-orange-50 to-amber-50 shadow-[0_8px_24px_-6px_rgba(245,158,11,0.36)] ring-2 ring-amber-400/28 ring-offset-2 ring-offset-background dark:border-amber-400/48 dark:from-amber-900/52 dark:via-orange-950/35 dark:to-amber-950/48 dark:ring-amber-400/22 dark:ring-offset-zinc-950",
    icon: "text-amber-600 dark:text-amber-400",
    iconActive: "text-amber-900 dark:text-amber-200",
    label: "text-amber-950/90 dark:text-amber-100/90",
    labelActive: "text-amber-950 dark:text-amber-50",
  },
  violet: {
    surface:
      "border-violet-200/82 bg-gradient-to-b from-violet-50/93 via-white to-white shadow-[0_2px_8px_-2px_rgba(139,92,246,0.12),inset_0_1px_0_rgba(255,255,255,0.65)] dark:border-violet-500/26 dark:from-violet-950/40 dark:via-zinc-900/40 dark:to-zinc-950/80",
    surfaceActive:
      "border-violet-400/70 bg-gradient-to-br from-violet-100 via-fuchsia-50 to-violet-50 shadow-[0_8px_24px_-6px_rgba(139,92,246,0.32)] ring-2 ring-violet-400/25 ring-offset-2 ring-offset-background dark:border-violet-400/45 dark:from-violet-900/54 dark:via-fuchsia-950/34 dark:to-violet-950/50 dark:ring-violet-400/20 dark:ring-offset-zinc-950",
    icon: "text-violet-600 dark:text-violet-400",
    iconActive: "text-violet-900 dark:text-violet-200",
    label: "text-violet-950/88 dark:text-violet-100/90",
    labelActive: "text-violet-950 dark:text-violet-50",
  },
  rose: {
    surface:
      "border-rose-200/82 bg-gradient-to-b from-rose-50/93 via-white to-white shadow-[0_2px_8px_-2px_rgba(244,63,94,0.12),inset_0_1px_0_rgba(255,255,255,0.65)] dark:border-rose-500/26 dark:from-rose-950/38 dark:via-zinc-900/40 dark:to-zinc-950/80",
    surfaceActive:
      "border-rose-400/68 bg-gradient-to-br from-rose-100 via-orange-50 to-rose-50 shadow-[0_8px_24px_-6px_rgba(244,63,94,0.30)] ring-2 ring-rose-400/25 ring-offset-2 ring-offset-background dark:border-rose-400/45 dark:from-rose-900/50 dark:via-orange-950/32 dark:to-rose-950/46 dark:ring-rose-400/20 dark:ring-offset-zinc-950",
    icon: "text-rose-600 dark:text-rose-400",
    iconActive: "text-rose-900 dark:text-rose-200",
    label: "text-rose-950/88 dark:text-rose-100/90",
    labelActive: "text-rose-950 dark:text-rose-50",
  },
};

/** My posts / list rows — same five palettes as Classmates tabs, tuned for wide cards. */
export const SCENE_LIST_ROW: Record<
  SceneTabPalette,
  {
    card: string;
    cardHover: string;
    iconWrap: string;
    categoryChip: string;
  }
> = {
  teal: {
    card:
      "border-teal-200/88 bg-gradient-to-br from-teal-50/95 via-white to-white shadow-[0_4px_18px_-6px_rgba(13,148,136,0.14),inset_0_1px_0_rgba(255,255,255,0.65)] dark:border-teal-500/30 dark:from-teal-950/42 dark:via-zinc-900/35 dark:to-zinc-950/90",
    cardHover:
      "[@media(hover:hover)]:hover:border-teal-300 [@media(hover:hover)]:hover:shadow-[0_8px_26px_-8px_rgba(13,148,136,0.22)] dark:[@media(hover:hover)]:hover:border-teal-500/45",
    iconWrap:
      "border-teal-300/60 bg-gradient-to-br from-teal-100/95 to-teal-50/55 text-teal-800 dark:border-teal-500/35 dark:from-teal-900/50 dark:to-teal-950/35 dark:text-teal-200",
    categoryChip:
      "border-teal-400/50 bg-teal-50/95 font-semibold text-teal-900 dark:border-teal-500/40 dark:bg-teal-950/45 dark:text-teal-100",
  },
  indigo: {
    card:
      "border-indigo-200/85 bg-gradient-to-br from-indigo-50/94 via-white to-white shadow-[0_4px_18px_-6px_rgba(79,70,229,0.13)] dark:border-indigo-500/28 dark:from-indigo-950/40 dark:via-zinc-900/35 dark:to-zinc-950/90",
    cardHover:
      "[@media(hover:hover)]:hover:border-indigo-300 [@media(hover:hover)]:hover:shadow-[0_8px_26px_-8px_rgba(79,70,229,0.2)] dark:[@media(hover:hover)]:hover:border-indigo-500/42",
    iconWrap:
      "border-indigo-300/58 bg-gradient-to-br from-indigo-100/92 to-indigo-50/50 text-indigo-800 dark:border-indigo-500/32 dark:from-indigo-900/48 dark:to-indigo-950/32 dark:text-indigo-200",
    categoryChip:
      "border-indigo-400/48 bg-indigo-50/95 font-semibold text-indigo-950 dark:border-indigo-500/38 dark:bg-indigo-950/45 dark:text-indigo-100",
  },
  amber: {
    card:
      "border-amber-200/88 bg-gradient-to-br from-amber-50/96 via-white to-white shadow-[0_4px_18px_-6px_rgba(245,158,11,0.15)] dark:border-amber-500/28 dark:from-amber-950/38 dark:via-zinc-900/35 dark:to-zinc-950/90",
    cardHover:
      "[@media(hover:hover)]:hover:border-amber-300 [@media(hover:hover)]:hover:shadow-[0_8px_26px_-8px_rgba(245,158,11,0.22)] dark:[@media(hover:hover)]:hover:border-amber-500/42",
    iconWrap:
      "border-amber-300/58 bg-gradient-to-br from-amber-100/94 to-amber-50/52 text-amber-900 dark:border-amber-500/32 dark:from-amber-900/50 dark:to-amber-950/32 dark:text-amber-200",
    categoryChip:
      "border-amber-400/50 bg-amber-50/95 font-semibold text-amber-950 dark:border-amber-500/38 dark:bg-amber-950/45 dark:text-amber-100",
  },
  violet: {
    card:
      "border-violet-200/85 bg-gradient-to-br from-violet-50/94 via-white to-white shadow-[0_4px_18px_-6px_rgba(139,92,246,0.13)] dark:border-violet-500/28 dark:from-violet-950/40 dark:via-zinc-900/35 dark:to-zinc-950/90",
    cardHover:
      "[@media(hover:hover)]:hover:border-violet-300 [@media(hover:hover)]:hover:shadow-[0_8px_26px_-8px_rgba(139,92,246,0.2)] dark:[@media(hover:hover)]:hover:border-violet-500/42",
    iconWrap:
      "border-violet-300/58 bg-gradient-to-br from-violet-100/92 to-violet-50/50 text-violet-900 dark:border-violet-500/32 dark:from-violet-900/50 dark:to-violet-950/32 dark:text-violet-200",
    categoryChip:
      "border-violet-400/48 bg-violet-50/95 font-semibold text-violet-950 dark:border-violet-500/38 dark:bg-violet-950/45 dark:text-violet-100",
  },
  rose: {
    card:
      "border-rose-200/85 bg-gradient-to-br from-rose-50/94 via-white to-white shadow-[0_4px_18px_-6px_rgba(244,63,94,0.13)] dark:border-rose-500/28 dark:from-rose-950/38 dark:via-zinc-900/35 dark:to-zinc-950/90",
    cardHover:
      "[@media(hover:hover)]:hover:border-rose-300 [@media(hover:hover)]:hover:shadow-[0_8px_26px_-8px_rgba(244,63,94,0.2)] dark:[@media(hover:hover)]:hover:border-rose-500/42",
    iconWrap:
      "border-rose-300/58 bg-gradient-to-br from-rose-100/92 to-rose-50/50 text-rose-900 dark:border-rose-500/32 dark:from-rose-900/48 dark:to-rose-950/32 dark:text-rose-200",
    categoryChip:
      "border-rose-400/48 bg-rose-50/95 font-semibold text-rose-950 dark:border-rose-500/38 dark:bg-rose-950/45 dark:text-rose-100",
  },
};

export function classmatePostCategoryToPalette(c: ClassmatePostCategory): SceneTabPalette {
  switch (c) {
    case ClassmatePostCategory.SHARED_COURSES:
      return "teal";
    case ClassmatePostCategory.STUDY:
      return "indigo";
    case ClassmatePostCategory.MEALS:
      return "amber";
    case ClassmatePostCategory.LANGUAGE:
      return "violet";
    case ClassmatePostCategory.SPORTS:
      return "rose";
  }
}
