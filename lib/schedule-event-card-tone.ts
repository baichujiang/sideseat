/**
 * Visual tones for schedule / calendar event blocks (SideSeat home calendar).
 * Solid fills + soft borders — not dashed “placeholder” chrome.
 */

export type ScheduleEventToneKey =
  | "draftNew"
  | "study"
  /** Enrolled class sessions — same blue family as study, distinct from category-colored calendar events. */
  | "enrolledCourse"
  | "course"
  | "meal"
  | "sports"
  | "language"
  | "personal"
  | "planPending"
  | "available"
  | "pendingRequest"
  | "busy"
  | "declined";

type ToneStyle = {
  card: string;
  cardSelected: string;
  /** Time row + icons (no font-size). */
  accentColor: string;
  accentColorSelected: string;
  title: string;
  titleSelected: string;
  /** Full-height left accent strip (calendar / schedule cards). */
  rail: string;
  railSelected: string;
};

/**
 * Left accent on short-overlap glass cards: use selected-state rail when it is a solid strip.
 * Selected cards often use `bg-white/40` for the rail on a saturated fill — on translucent glass
 * that reads as invisible, so fall back to the default `rail` (same hue family, full opacity).
 */
export function scheduleShortOverlapRailClass(tone: Pick<ToneStyle, "rail" | "railSelected">): string {
  if (/bg-white\//.test(tone.railSelected)) return tone.rail;
  return tone.railSelected;
}

/** Default study title before the user names the event — reads as provisional on the grid. */
export function isDraftNewEventTitle(title: string): boolean {
  return title.trim().toLowerCase() === "new event";
}

/** Tailwind class sets per tone (light + dark). */
export const SCHEDULE_EVENT_TONE_STYLES: Record<ScheduleEventToneKey, ToneStyle> = {
  /** Creating / not yet named — dashed frame + wash (not a solid “saved” block). */
  draftNew: {
    card: "rounded-sm border border-dashed border-[#93C5FD] bg-[#EFF6FF]/60 dark:border-blue-400/50 dark:bg-blue-950/25",
    cardSelected:
      "rounded-sm border-2 border-dashed border-[#2563EB] bg-[#EFF6FF]/85 shadow-[0_2px_10px_rgba(37,99,235,0.14)] dark:border-blue-400 dark:bg-blue-950/40",
    accentColor: "text-[#2563EB] dark:text-blue-300",
    accentColorSelected: "text-[#1D4ED8] dark:text-blue-200",
    title: "truncate font-semibold text-[#111827] dark:text-foreground",
    titleSelected: "truncate font-semibold text-[#111827] dark:text-foreground",
    rail: "bg-[#2563EB] dark:bg-blue-400",
    railSelected: "bg-[#1D4ED8] dark:bg-blue-300",
  },
  study: {
    card: "rounded-sm border border-[#BFDBFE] bg-[#EFF6FF] shadow-[0_2px_8px_rgba(37,99,235,0.10)] dark:border-blue-500/40 dark:bg-blue-950/35",
    cardSelected:
      "rounded-sm border border-[#1D4ED8] bg-[#2563EB] shadow-[0_4px_12px_rgba(37,99,235,0.22)] dark:border-blue-400 dark:bg-blue-600",
    accentColor: "text-[#2563EB] dark:text-blue-300",
    accentColorSelected: "text-white/90",
    title: "truncate font-semibold text-[#111827] dark:text-foreground",
    titleSelected: "truncate font-semibold text-white",
    rail: "bg-[#1D4ED8] dark:bg-blue-400",
    railSelected: "bg-white/40",
  },
  enrolledCourse: {
    card: "rounded-sm border border-[#BFDBFE] bg-[#EFF6FF] shadow-[0_2px_8px_rgba(37,99,235,0.10)] dark:border-blue-500/40 dark:bg-blue-950/35",
    cardSelected:
      "rounded-sm border border-[#1D4ED8] bg-[#2563EB] shadow-[0_4px_12px_rgba(37,99,235,0.22)] dark:border-blue-400 dark:bg-blue-600",
    accentColor: "text-[#2563EB] dark:text-blue-300",
    accentColorSelected: "text-white/90",
    title: "truncate font-semibold text-[#111827] dark:text-foreground",
    titleSelected: "truncate font-semibold text-white",
    rail: "bg-[#1D4ED8] dark:bg-blue-400",
    railSelected: "bg-white/40",
  },
  meal: {
    card: "rounded-sm border border-[#FED7AA] bg-[#FFF7ED] shadow-[0_2px_8px_rgba(234,88,12,0.08)] dark:border-orange-500/35 dark:bg-orange-950/30",
    cardSelected:
      "rounded-sm border border-[#EA580C] bg-[#EA580C] shadow-[0_4px_12px_rgba(234,88,12,0.2)] dark:bg-orange-600",
    accentColor: "text-[#EA580C] dark:text-orange-300",
    accentColorSelected: "text-white/90",
    title: "truncate font-semibold text-[#111827] dark:text-foreground",
    titleSelected: "truncate font-semibold text-white",
    rail: "bg-[#C2410C] dark:bg-orange-400",
    railSelected: "bg-white/40",
  },
  sports: {
    card: "rounded-sm border border-[#BBF7D0] bg-[#F0FDF4] shadow-[0_2px_8px_rgba(22,163,74,0.08)] dark:border-emerald-500/35 dark:bg-emerald-950/30",
    cardSelected:
      "rounded-sm border border-[#16A34A] bg-[#16A34A] shadow-[0_4px_12px_rgba(22,163,74,0.2)] dark:bg-emerald-600",
    accentColor: "text-[#16A34A] dark:text-emerald-300",
    accentColorSelected: "text-white/90",
    title: "truncate font-semibold text-[#111827] dark:text-foreground",
    titleSelected: "truncate font-semibold text-white",
    rail: "bg-[#15803D] dark:bg-emerald-400",
    railSelected: "bg-white/40",
  },
  language: {
    card: "rounded-sm border border-[#99F6E4] bg-[#F0FDFA] shadow-[0_2px_8px_rgba(15,118,110,0.08)] dark:border-teal-500/35 dark:bg-teal-950/30",
    cardSelected:
      "rounded-sm border border-[#0F766E] bg-[#0F766E] shadow-[0_4px_12px_rgba(15,118,110,0.2)] dark:bg-teal-600",
    accentColor: "text-[#0F766E] dark:text-teal-300",
    accentColorSelected: "text-white/90",
    title: "truncate font-semibold text-[#111827] dark:text-foreground",
    titleSelected: "truncate font-semibold text-white",
    rail: "bg-[#0D9488] dark:bg-teal-400",
    railSelected: "bg-white/40",
  },
  personal: {
    card: "rounded-sm border border-[#E5E7EB] bg-[#F3F4F6] shadow-[0_2px_8px_rgba(107,114,128,0.08)] dark:border-zinc-600 dark:bg-zinc-900/50",
    cardSelected:
      "rounded-sm border border-[#6B7280] bg-[#6B7280] shadow-[0_4px_12px_rgba(75,85,99,0.2)] dark:bg-zinc-600",
    accentColor: "text-[#6B7280] dark:text-zinc-400",
    accentColorSelected: "text-white/90",
    title: "truncate font-semibold text-[#111827] dark:text-foreground",
    titleSelected: "truncate font-semibold text-white",
    rail: "bg-[#4B5563] dark:bg-zinc-500",
    railSelected: "bg-white/35",
  },
  planPending: {
    card: "rounded-sm border border-[#FDE68A] bg-[#FEF3C7] shadow-[0_2px_8px_rgba(217,119,6,0.1)] dark:border-amber-500/35 dark:bg-amber-950/30",
    cardSelected:
      "rounded-sm border border-[#D97706] bg-[#D97706] shadow-[0_4px_12px_rgba(217,119,6,0.22)] dark:bg-amber-600",
    accentColor: "text-[#D97706] dark:text-amber-300",
    accentColorSelected: "text-white/90",
    title: "truncate font-semibold text-[#111827] dark:text-foreground",
    titleSelected: "truncate font-semibold text-white",
    rail: "bg-[#B45309] dark:bg-amber-400",
    railSelected: "bg-white/40",
  },
  /** SideSeat-ish: free / open slot */
  available: {
    card: "rounded-sm border border-[#5EEAD4] bg-[#ECFEFF] shadow-[0_2px_8px_rgba(13,148,136,0.1)] dark:border-cyan-500/35 dark:bg-cyan-950/30",
    cardSelected:
      "rounded-sm border border-[#0D9488] bg-[#14B8A6] shadow-[0_4px_12px_rgba(13,148,136,0.22)] dark:bg-teal-600",
    accentColor: "text-[#0D9488] dark:text-cyan-300",
    accentColorSelected: "text-white/90",
    title: "truncate font-semibold text-[#111827] dark:text-foreground",
    titleSelected: "truncate font-semibold text-white",
    rail: "bg-[#0F766E] dark:bg-cyan-400",
    railSelected: "bg-white/40",
  },
  /** SideSeat-ish: invitation / request pending */
  pendingRequest: {
    card: "rounded-sm border border-[#FDE68A] bg-[#FEF3C7] shadow-[0_2px_8px_rgba(217,119,6,0.1)] dark:border-amber-500/35 dark:bg-amber-950/30",
    cardSelected:
      "rounded-sm border border-[#CA8A04] bg-[#CA8A04] shadow-[0_4px_12px_rgba(202,138,4,0.22)] dark:bg-amber-600",
    accentColor: "text-[#B45309] dark:text-amber-300",
    accentColorSelected: "text-white/90",
    title: "truncate font-semibold text-[#111827] dark:text-foreground",
    titleSelected: "truncate font-semibold text-white",
    rail: "bg-[#A16207] dark:bg-amber-400",
    railSelected: "bg-white/40",
  },
  /** SideSeat-ish: busy / private */
  busy: {
    card: "rounded-sm border border-[#D1D5DB] bg-[#F3F4F6] shadow-[0_2px_8px_rgba(75,85,99,0.06)] dark:border-zinc-600 dark:bg-zinc-900/55",
    cardSelected:
      "rounded-sm border border-[#4B5563] bg-[#4B5563] shadow-[0_4px_12px_rgba(55,65,81,0.2)] dark:bg-zinc-600",
    accentColor: "text-[#6B7280] dark:text-zinc-400",
    accentColorSelected: "text-white/90",
    title: "truncate font-semibold text-[#111827] dark:text-foreground",
    titleSelected: "truncate font-semibold text-white",
    rail: "bg-[#4B5563] dark:bg-zinc-500",
    railSelected: "bg-white/35",
  },
  /** SideSeat-ish: declined / canceled */
  declined: {
    card: "rounded-sm border border-[#FECACA] bg-[#FEF2F2] shadow-[0_2px_8px_rgba(220,38,38,0.08)] dark:border-red-500/35 dark:bg-red-950/30",
    cardSelected:
      "rounded-sm border border-[#DC2626] bg-[#DC2626] shadow-[0_4px_12px_rgba(220,38,38,0.2)] dark:bg-red-600",
    accentColor: "text-[#DC2626] dark:text-red-300",
    accentColorSelected: "text-white/90",
    title: "truncate font-semibold text-[#111827] dark:text-foreground",
    titleSelected: "truncate font-semibold text-white",
    rail: "bg-[#B91C1C] dark:bg-red-400",
    railSelected: "bg-white/40",
  },
  /** Default timetable class — same neutral family as Personal, distinct label in UI copy only */
  course: {
    card: "rounded-sm border border-[#E5E7EB] bg-[#F9FAFB] shadow-[0_2px_8px_rgba(71,85,105,0.07)] dark:border-slate-600 dark:bg-slate-900/45",
    cardSelected:
      "rounded-sm border border-[#475569] bg-[#475569] shadow-[0_4px_12px_rgba(51,65,85,0.2)] dark:bg-slate-600",
    accentColor: "text-[#475569] dark:text-slate-300",
    accentColorSelected: "text-white/90",
    title: "truncate font-semibold text-[#111827] dark:text-foreground",
    titleSelected: "truncate font-semibold text-white",
    rail: "bg-[#334155] dark:bg-slate-400",
    railSelected: "bg-white/35",
  },
};

function norm(s: string) {
  return s.toLowerCase();
}

/**
 * Infer tone from free-text title (course name, study title, etc.) and block kind.
 * Order: terminal states → SideSeat-ish → activity keywords → default course vs study.
 */
export function inferScheduleEventToneKey(input: {
  kind: "study" | "class";
  title: string;
}): ScheduleEventToneKey {
  if (input.kind === "study" && isDraftNewEventTitle(input.title)) {
    return "draftNew";
  }

  const t = norm(input.title);

  if (/\b(cancelled|canceled|declined|rejected|已取消|拒绝)\b/.test(t)) {
    return "declined";
  }
  if (/\b(available|free slot|open slot|free time|有空|可约)\b/.test(t)) {
    return "available";
  }
  if (/\b(pending request|awaiting response|waiting for|invitation pending|待确认|请求中)\b/.test(t)) {
    return "pendingRequest";
  }
  if (/\b(tbd|to be confirmed|待定|wip|draft:|placeholder)\b/.test(t) || /\bplan pending\b/.test(t)) {
    return "planPending";
  }
  if (/\b(busy|private|do not disturb|勿扰|block)\b/.test(t)) {
    return "busy";
  }
  if (/\b(lunch|dinner|breakfast|brunch|meal|coffee|café|cafe|餐|饭)\b/.test(t)) {
    return "meal";
  }
  if (/\b(sport|gym|run|yoga|swim|fitness|训练|运动|锻炼)\b/.test(t)) {
    return "sports";
  }
  if (
    /\b(language|english|german|spanish|french|italian|chinese|japanese|korean|口语|德语|英语)\b/.test(t)
  ) {
    return "language";
  }
  if (/\b(personal|errand|appointment|医生|银行)\b/.test(t)) {
    return "personal";
  }

  if (input.kind === "study") {
    return "study";
  }
  return "course";
}

/** Course enrollments use a fixed blue chrome; calendar entries keep category / inferred tones. */
export function scheduleVisualToneKey(input: {
  source: "course" | "calendar";
  kind: "study" | "class";
  title: string;
}): ScheduleEventToneKey {
  if (input.source === "course") return "enrolledCourse";
  return inferScheduleEventToneKey({ kind: input.kind, title: input.title });
}
