"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import type { CalendarRepeatRule, Weekday } from "@prisma/client";
import {
  addDays,
  addMonths,
  endOfWeek,
  format,
  getISOWeek,
  isSameDay,
  isSameMonth,
  isSameYear,
  startOfWeek,
} from "date-fns";
import {
  Archive,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize2,
  Minimize2,
  Upload,
} from "lucide-react";
import { type ChangeEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { WeekCalendar, type WeekCalendarBlock } from "@/components/calendar/week-calendar";
import { ScheduleAddPanel } from "@/components/home/schedule-add-panel";
import { ScheduleCalendarCategoryManager } from "@/components/home/schedule-calendar-category-manager";
import {
  ScheduleItemDetailSheet,
  type ScheduleDetailItem,
} from "@/components/home/schedule-item-detail-sheet";
import { ScheduleDayEventList } from "@/components/home/schedule-day-event-list";
import {
  ScheduleDayTimeline,
  type DayTimelineItem,
} from "@/components/home/schedule-day-timeline";
import { ScheduleMonthView } from "@/components/home/schedule-month-view";
import { AppPushLayer } from "@/components/ui/app-push-layer";
import { cn } from "@/lib/utils";

type ViewKind = "day" | "week" | "month";

/** Recurring course block (weekday-indexed). */
export type ClassBlock = {
  courseId: string;
  courseName: string;
  courseCode: string | null;
  weekday: Weekday;
  startMinute: number;
  endMinute: number;
  location: string | null;
  /** Tint from the user's "Course" preset category (if any). */
  categoryColor: string | null;
  categoryId: string | null;
  categoryName: string | null;
};

/** One-off study session (date-indexed). */
export type StudyEntry = {
  id: string;
  title: string;
  location: string | null;
  withLabel: string | null;
  note: string | null;
  repeatRule: CalendarRepeatRule;
  repeatUntilISO: string | null;
  /** Calendar companions with aligned ids (userId may be null for text-only invites). */
  eventParticipants: Array<{ userId: string | null; name: string }>;
  /** ISO string — serialized so the server component can hand it off cleanly. */
  startISO: string;
  endISO: string;
  categoryId: string | null;
  categoryColor: string | null;
  categoryName: string | null;
};

export type CalendarCategoryLite = {
  id: string;
  name: string;
  color: string;
  presetKey: string | null;
};

export type CompanionOption = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

function isWeekendDay(date: Date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function formatRepeatLabel(rule: CalendarRepeatRule) {
  switch (rule) {
    case "DAILY":
      return "Every day";
    case "WEEKLY":
      return "Every week";
    case "BIWEEKLY":
      return "Every 2 weeks";
    case "MONTHLY":
      return "Every month";
    case "YEARLY":
      return "Every year";
    default:
      return "No";
  }
}

const WEEKDAY_BY_JS: Record<number, Weekday> = {
  0: "SUN",
  1: "MON",
  2: "TUE",
  3: "WED",
  4: "THU",
  5: "FRI",
  6: "SAT",
};

/**
 * Schedule surface — the single interactive calendar on Home.
 *
 * State model: one `selectedDate` shared across all three views. Switching
 * view never loses the date context, so "Week" anchored on April 15 stays
 * on the April 13–19 week even if you later jump back to Day.
 *
 * Data model: `classBlocks` is inherently recurring (we just filter by
 * weekday), `studyEntries` is a flat list of materialized calendar rows.
 * Parent fetches a ±90-day window of study entries so scrolling through
 * a handful of months without a round-trip feels right.
 */
export function ScheduleSurface({
  classBlocks,
  studyEntries,
  companionOptions,
  initialCalendarCategories,
  nowISO,
  semesterStartISO,
  semesterEndISO,
}: {
  classBlocks: ClassBlock[];
  studyEntries: StudyEntry[];
  companionOptions: CompanionOption[];
  initialCalendarCategories: CalendarCategoryLite[];
  /** Server-rendered "now" so first paint matches the SSR output. */
  nowISO: string;
  semesterStartISO: string;
  semesterEndISO: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<ViewKind>("week");
  const [now, setNow] = useState(() => new Date(nowISO));
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date(nowISO));
  const [weekHorizontalMode, setWeekHorizontalMode] = useState<"workweek" | "include-anchor">(() =>
    isWeekendDay(new Date(nowISO)) ? "include-anchor" : "workweek",
  );
  const [adding, setAdding] = useState(false);
  const [draftEventStart, setDraftEventStart] = useState<string | undefined>(undefined);
  const [draftEventEnd, setDraftEventEnd] = useState<string | undefined>(undefined);
  const [editingItem, setEditingItem] = useState<ScheduleDetailItem | null>(null);
  const [detailItem, setDetailItem] = useState<ScheduleDetailItem | null>(null);
  const [inviteFlow, setInviteFlow] = useState(false);
  const [deletingItem, setDeletingItem] = useState(false);
  const [weekImmersiveOpen, setWeekImmersiveOpen] = useState(false);
  /** Fullscreen week: body scroll height + whether we CSS-rotate portrait → effective landscape. */
  const [immersiveLayout, setImmersiveLayout] = useState({ bodyPx: 520, rotatePortrait: false });
  const [portalReady, setPortalReady] = useState(false);
  const icsImportInputRef = useRef<HTMLInputElement | null>(null);
  const [icsBusy, setIcsBusy] = useState<"export" | "import" | null>(null);
  const [icsNotice, setIcsNotice] = useState<{ tone: "ok" | "err"; message: string } | null>(null);
  const [icsMenuOpen, setIcsMenuOpen] = useState(false);
  const icsMenuRef = useRef<HTMLDivElement | null>(null);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const semesterStart = new Date(semesterStartISO);
  const semesterEnd = new Date(semesterEndISO);

  const resetAddDraft = () => {
    setDraftEventStart(undefined);
    setDraftEventEnd(undefined);
    setEditingItem(null);
    setInviteFlow(false);
  };

  const closeAddPanel = ({ refresh = false }: { refresh?: boolean } = {}) => {
    setAdding(false);
    resetAddDraft();
    if (refresh) router.refresh();
  };

  const toggleAddPanel = () => {
    resetAddDraft();
    setAdding(true);
  };

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    const serverNow = new Date(nowISO);
    setNow(serverNow);
  }, [nowISO]);

  useEffect(() => {
    if (view !== "week") setWeekImmersiveOpen(false);
  }, [view]);

  useEffect(() => {
    if (!icsMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (icsMenuRef.current?.contains(e.target as Node)) return;
      setIcsMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [icsMenuOpen]);

  useEffect(() => {
    if (adding) setWeekImmersiveOpen(false);
  }, [adding]);

  useEffect(() => {
    if (!weekImmersiveOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setWeekImmersiveOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [weekImmersiveOpen]);

  useEffect(() => {
    if (!weekImmersiveOpen) return;
    /** No title bar — only edge padding + floating close. */
    const padPx = 4;

    const measure = () => {
      const iw = window.innerWidth;
      const ih = window.innerHeight;
      const portrait = ih > iw;
      const vv = window.visualViewport;
      const vw = vv?.width ?? iw;
      const vh = vv?.height ?? ih;

      if (portrait) {
        // Rotated shell: week columns use physical height; vertical grid uses physical width.
        setImmersiveLayout({
          rotatePortrait: true,
          bodyPx: Math.max(240, vw - padPx * 2),
        });
      } else {
        setImmersiveLayout({
          rotatePortrait: false,
          bodyPx: Math.max(300, vh - padPx * 2),
        });
      }
    };

    measure();
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);

    return () => {
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [weekImmersiveOpen]);

  useEffect(() => {
    if (!weekImmersiveOpen) return;
    const orient = screen.orientation as ScreenOrientation & {
      unlock?: () => void;
    };
    return () => {
      try {
        orient?.unlock?.();
      } catch {
        /* */
      }
    };
  }, [weekImmersiveOpen]);

  useEffect(() => {
    let intervalId: number | null = null;

    const tick = () => setNow(new Date());
    const current = new Date();
    const delayUntilNextMinute =
      (60 - current.getSeconds()) * 1000 - current.getMilliseconds();

    const timeoutId = window.setTimeout(() => {
      tick();
      intervalId = window.setInterval(tick, 60 * 1000);
    }, Math.max(delayUntilNextMinute, 0));

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  // Hydrate study entries once — Date objects aren't serializable across
  // the server/client boundary, so the parent ships ISO strings.
  const studies = useMemo(
    () =>
      studyEntries.map((e) => ({
        ...e,
        start: new Date(e.startISO),
        end: new Date(e.endISO),
      })),
    [studyEntries],
  );

  const defaultNewEventCategoryId = useMemo(
    () =>
      initialCalendarCategories.find((c) => c.presetKey === "study")?.id ??
      initialCalendarCategories[0]?.id ??
      null,
    [initialCalendarCategories],
  );

  const draftCategoryMeta = useMemo(() => {
    if (!defaultNewEventCategoryId) {
      return { id: null as string | null, name: null as string | null, color: null as string | null };
    }
    const c = initialCalendarCategories.find((x) => x.id === defaultNewEventCategoryId);
    return {
      id: c?.id ?? null,
      name: c?.name ?? null,
      color: c?.color ?? null,
    };
  }, [defaultNewEventCategoryId, initialCalendarCategories]);

  const classesByWeekday = useMemo(() => {
    const map = new Map<Weekday, ClassBlock[]>();
    for (const b of classBlocks) {
      const list = map.get(b.weekday) ?? [];
      list.push(b);
      map.set(b.weekday, list);
    }
    return map;
  }, [classBlocks]);

  /** All items for a given date, sorted by start time. */
  const itemsForDate = (date: Date): DayTimelineItem[] => {
    const weekday = WEEKDAY_BY_JS[date.getDay()];
    const inSemester = date >= semesterStart && date <= semesterEnd;
    const classItems: DayTimelineItem[] = (inSemester ? classesByWeekday.get(weekday) ?? [] : []).map(
      (b) => ({
        id: `${b.courseId}-${b.weekday}-${b.startMinute}`,
        kind: "class",
        source: "course",
        startMinute: b.startMinute,
        endMinute: b.endMinute,
        title: b.courseCode ? `${b.courseCode} · ${b.courseName}` : b.courseName,
        location: b.location,
        note: null,
        repeatLabel: "Every week",
        repeatRule: "WEEKLY",
        repeatUntilISO: null,
        eventParticipants: [],
        courseId: b.courseId,
        categoryId: b.categoryId,
        categoryName: b.categoryName,
        categoryColor: b.categoryColor,
      }),
    );
    const studyItems: DayTimelineItem[] = studies
      .filter((s) => isSameDay(s.start, date))
      .map((s) => ({
        id: s.id,
        kind: "study",
        source: "calendar",
        startMinute: s.start.getHours() * 60 + s.start.getMinutes(),
        endMinute: s.end.getHours() * 60 + s.end.getMinutes(),
        title: s.title,
        location: s.location,
        withLabel: s.withLabel,
        note: s.note,
        repeatLabel: formatRepeatLabel(s.repeatRule),
        repeatRule: s.repeatRule,
        repeatUntilISO: s.repeatUntilISO,
        eventParticipants: s.eventParticipants,
        courseId: null,
        categoryId: s.categoryId,
        categoryName: s.categoryName,
        categoryColor: s.categoryColor,
      }));
    return [...classItems, ...studyItems].sort(
      (a, b) => a.startMinute - b.startMinute,
    );
  };

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });

  const dayItems = useMemo(() => {
    const base = itemsForDate(selectedDate);
    if (!adding || editingItem || !draftEventStart || !draftEventEnd) return base;
    const draftStart = new Date(draftEventStart);
    const draftEnd = new Date(draftEventEnd);
    if (Number.isNaN(draftStart.getTime()) || Number.isNaN(draftEnd.getTime())) return base;
    if (!isSameDay(draftStart, selectedDate)) return base;
    const draftItem: DayTimelineItem = {
      id: "__draft-preview__",
      kind: "study",
      source: "calendar",
      startMinute: draftStart.getHours() * 60 + draftStart.getMinutes(),
      endMinute: draftEnd.getHours() * 60 + draftEnd.getMinutes(),
      title: "New event",
      location: null,
      withLabel: null,
      note: null,
      repeatLabel: "No",
      repeatRule: "NONE",
      repeatUntilISO: null,
      eventParticipants: [],
      courseId: null,
      categoryId: draftCategoryMeta.id,
      categoryName: draftCategoryMeta.name,
      categoryColor: draftCategoryMeta.color,
    };
    return [...base, draftItem].sort((a, b) => a.startMinute - b.startMinute);
  }, [
    selectedDate,
    studies,
    classBlocks,
    semesterStart,
    semesterEnd,
    adding,
    editingItem,
    draftEventStart,
    draftEventEnd,
    draftCategoryMeta,
  ]);

  const openEventDraft = (start: Date, end: Date) => {
    resetAddDraft();
    setDraftEventStart(format(start, "yyyy-MM-dd'T'HH:mm"));
    setDraftEventEnd(format(end, "yyyy-MM-dd'T'HH:mm"));
    setSelectedDate(start);
    setDetailItem(null);
    setAdding(true);
  };

  const openDetailFromTimelineItem = (item: DayTimelineItem, date: Date) => {
    if (item.id === "__draft-preview__") return;
    const start = new Date(date);
    start.setHours(0, item.startMinute, 0, 0);
    const end = new Date(date);
    end.setHours(0, item.endMinute, 0, 0);
    setDetailItem({
      id: item.id,
      source: item.source,
      title: item.title,
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      location: item.location,
      note: item.note ?? null,
      repeatLabel: item.repeatLabel ?? "No",
      repeatRule: item.repeatRule ?? "NONE",
      repeatUntilISO: item.repeatUntilISO ?? null,
      eventParticipants: item.eventParticipants ?? [],
      categoryId: item.categoryId ?? null,
      categoryName: item.categoryName ?? null,
      categoryColor: item.categoryColor ?? null,
    });
  };

  function handleWeekOpenItem(item: WeekCalendarBlock, occurrenceDate: Date) {
    if (item.courseId === "__draft-preview__") return;
    openDetailFromTimelineItem(
      {
        id:
          item.kind === "study"
            ? item.courseId.replace(/^study-/, "")
            : `${item.courseId}-${item.weekday}-${item.startMinute}`,
        kind: item.kind === "study" ? "study" : "class",
        source: item.source,
        startMinute: item.startMinute,
        endMinute: item.endMinute,
        title: item.courseCode ? `${item.courseCode} · ${item.courseName}` : item.courseName,
        location: item.location,
        withLabel: item.withLabel ?? null,
        note: item.note ?? null,
        repeatLabel: item.repeatLabel ?? "No",
        repeatRule: item.repeatRule ?? "NONE",
        repeatUntilISO: item.repeatUntilISO ?? null,
        eventParticipants: item.eventParticipants ?? [],
        courseId: item.source === "course" ? item.courseId : null,
        categoryId: item.categoryId ?? null,
        categoryName: item.categoryName ?? null,
        categoryColor: item.categoryColor ?? null,
      },
      occurrenceDate,
    );
  }

  // Week view: classes repeat every week, so we can show them on any
  // anchor week. Study entries need to be filtered to that week and
  // injected as "study"-kind blocks.
  const weekBlocks = useMemo(() => {
    const includeClasses = weekEnd >= semesterStart && weekStart <= semesterEnd;
    const studyBlocks = studies
      .filter((s) => s.start >= weekStart && s.start <= weekEnd)
      .map((s) => ({
        courseId: `study-${s.id}`,
        courseName: s.title,
        courseCode: null,
        source: "calendar" as const,
        weekday: WEEKDAY_BY_JS[s.start.getDay()],
        startMinute: s.start.getHours() * 60 + s.start.getMinutes(),
        endMinute: s.end.getHours() * 60 + s.end.getMinutes(),
        location: s.location,
        withLabel: s.withLabel,
        note: s.note,
        repeatLabel: formatRepeatLabel(s.repeatRule),
        repeatRule: s.repeatRule,
        repeatUntilISO: s.repeatUntilISO,
        eventParticipants: s.eventParticipants,
        kind: "study" as const,
        categoryId: s.categoryId,
        categoryName: s.categoryName,
        categoryColor: s.categoryColor,
        calendarEntryId: s.id,
      }));
    const courseBlocks = includeClasses
      ? classBlocks.map((block) => ({
          ...block,
          source: "course" as const,
          note: null,
          repeatLabel: "Every week",
          repeatRule: "WEEKLY" as const,
          repeatUntilISO: null,
          eventParticipants: [],
        }))
      : [];
    const merged: WeekCalendarBlock[] = [...courseBlocks, ...studyBlocks];
    if (adding && !editingItem && draftEventStart && draftEventEnd) {
      const draftStart = new Date(draftEventStart);
      const draftEnd = new Date(draftEventEnd);
      if (
        !Number.isNaN(draftStart.getTime()) &&
        !Number.isNaN(draftEnd.getTime()) &&
        draftStart >= weekStart &&
        draftStart <= weekEnd
      ) {
        merged.push({
          courseId: "__draft-preview__",
          courseName: "New event",
          courseCode: null,
          source: "calendar" as const,
          weekday: WEEKDAY_BY_JS[draftStart.getDay()],
          startMinute: draftStart.getHours() * 60 + draftStart.getMinutes(),
          endMinute: draftEnd.getHours() * 60 + draftEnd.getMinutes(),
          location: null,
          withLabel: null,
          note: null,
          repeatLabel: "No",
          repeatRule: "NONE" as const,
          repeatUntilISO: null,
          eventParticipants: [],
          kind: "study" as const,
          categoryId: draftCategoryMeta.id,
          categoryName: draftCategoryMeta.name,
          categoryColor: draftCategoryMeta.color,
        });
      }
    }
    return merged;
  }, [
    classBlocks,
    studies,
    weekStart,
    weekEnd,
    semesterStart,
    semesterEnd,
    adding,
    editingItem,
    draftEventStart,
    draftEventEnd,
    draftCategoryMeta,
  ]);

  async function deleteDetailItem() {
    if (!detailItem || detailItem.source !== "calendar") return;
    if (!window.confirm("Delete this schedule item?")) return;
    setDeletingItem(true);
    const response = await apiFetch(`/api/calendar/events/${detailItem.id}`, { method: "DELETE" });
    setDeletingItem(false);
    if (!response.ok) return;
    setDetailItem(null);
    router.refresh();
  }

  function openEditSheetFromDetail(inviteOnly = false) {
    if (!detailItem || detailItem.source !== "calendar") return;
    setInviteFlow(inviteOnly);
    setEditingItem(detailItem);
    setDraftEventStart(format(new Date(detailItem.startISO), "yyyy-MM-dd'T'HH:mm"));
    setDraftEventEnd(format(new Date(detailItem.endISO), "yyyy-MM-dd'T'HH:mm"));
    setSelectedDate(new Date(detailItem.startISO));
    setDetailItem(null);
    setAdding(true);
  }

  // Month density lookup. Count classes (by weekday) + study entries
  // (by exact date). Memoize a date→count map to avoid O(n) per cell.
  const monthDensity = useMemo(() => {
    const classCountByWeekday: Record<Weekday, number> = {
      MON: 0,
      TUE: 0,
      WED: 0,
      THU: 0,
      FRI: 0,
      SAT: 0,
      SUN: 0,
    };
    for (const b of classBlocks) classCountByWeekday[b.weekday] += 1;

    const studyCountByDateKey = new Map<string, number>();
    for (const s of studies) {
      const key = dateKey(s.start);
      studyCountByDateKey.set(key, (studyCountByDateKey.get(key) ?? 0) + 1);
    }
    return (d: Date): number => {
      const weekday = WEEKDAY_BY_JS[d.getDay()];
      const classDensity = d >= semesterStart && d <= semesterEnd ? classCountByWeekday[weekday] : 0;
      let n = classDensity + (studyCountByDateKey.get(dateKey(d)) ?? 0);
      if (adding && !editingItem && draftEventStart && draftEventEnd) {
        const draftStart = new Date(draftEventStart);
        if (!Number.isNaN(draftStart.getTime()) && isSameDay(draftStart, d)) {
          n += 1;
        }
      }
      return n;
    };
  }, [classBlocks, studies, semesterStart, semesterEnd, adding, editingItem, draftEventStart, draftEventEnd]);

  // Navigation handlers. Day: ±1 day; Week: ±7 days; Month: ±1 month.
  // "Today" snaps `selectedDate` back without leaving the current view.
  const step = (direction: 1 | -1) => {
    setSelectedDate((prev) => {
      if (view === "day") return addDays(prev, direction);
      if (view === "week") {
        setWeekHorizontalMode("workweek");
        return addDays(prev, direction * 7);
      }
      return addMonths(prev, direction);
    });
  };

  async function exportIcsCalendar() {
    if (icsBusy) return;
    setIcsBusy("export");
    setIcsNotice(null);
    try {
      const res = await apiFetch("/api/calendar/export");
      if (!res.ok) {
        const errText = await res.text();
        setIcsNotice({
          tone: "err",
          message: errText.trim().slice(0, 160) || "Could not export calendar.",
        });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "sideseat-schedule.ics";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setIcsNotice({ tone: "ok", message: "Downloaded sideseat-schedule.ics" });
    } catch {
      setIcsNotice({ tone: "err", message: "Could not export calendar." });
    } finally {
      setIcsBusy(null);
    }
  }

  async function onIcsImportPicked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || icsBusy) return;
    setIcsBusy("import");
    setIcsNotice(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await apiFetch("/api/calendar/import", { method: "POST", body: fd });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        data?: { imported?: number; skipped?: number };
      };
      if (!res.ok || !json.success) {
        setIcsNotice({ tone: "err", message: json.error ?? "Import failed." });
        return;
      }
      const imported = json.data?.imported ?? 0;
      const skipped = json.data?.skipped ?? 0;
      setIcsNotice({
        tone: "ok",
        message: `Imported ${imported} event${imported === 1 ? "" : "s"}.${skipped > 0 ? ` Skipped ${skipped}.` : ""}`,
      });
      router.refresh();
    } catch {
      setIcsNotice({ tone: "err", message: "Could not import calendar." });
    } finally {
      setIcsBusy(null);
    }
  }

  const isSelectedToday = isSameDay(selectedDate, now);
  const nowMinute = now.getHours() * 60 + now.getMinutes();

  const weekAnchorWeekday =
    weekStart <= now && now <= weekEnd ? WEEKDAY_BY_JS[now.getDay()] : WEEKDAY_BY_JS[selectedDate.getDay()];

  const patchCalendarEventTimes = useCallback(
    async (args: { eventId: string; startAt: Date; endAt: Date }): Promise<boolean> => {
      const entry = studyEntries.find((s) => s.id === args.eventId);
      if (!entry) return false;
      const withUserIds = entry.eventParticipants.map((p) => p.userId).filter((id): id is string => Boolean(id));
      const res = await apiFetch(`/api/calendar/events/${args.eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: entry.title,
          location: entry.location?.trim() ?? "",
          note: entry.note?.trim() ?? "",
          startAt: args.startAt.toISOString(),
          endAt: args.endAt.toISOString(),
          withUserIds,
          repeat: entry.repeatRule,
          repeatUntil:
            entry.repeatRule === "NONE"
              ? ""
              : entry.repeatUntilISO
                ? new Date(entry.repeatUntilISO).toISOString()
                : "",
          categoryId: entry.categoryId,
        }),
      });
      if (!res.ok) return false;
      router.refresh();
      return true;
    },
    [studyEntries, router],
  );

  const weekCalendarProps = {
    blocks: weekBlocks,
    anchorWeekday: weekAnchorWeekday,
    horizontalMode: weekHorizontalMode,
    nowMinute,
    showNowLine: weekStart <= now && now <= weekEnd,
    weekStartDate: weekStart,
    focusDate: selectedDate,
    today: now,
    onCreateEvent: openEventDraft,
    onOpenItem: handleWeekOpenItem,
    onPatchCalendarEventTimes: patchCalendarEventTimes,
  };

  return (
    <section className="space-y-2.5 pb-8">
      <ScheduleAddPanel
        selectedDate={selectedDate}
        open={adding}
        onClose={() => closeAddPanel({ refresh: true })}
        mode={editingItem ? "edit" : "create"}
        entryId={editingItem?.id}
        initialTitle={editingItem?.title}
        initialLocation={editingItem?.location ?? ""}
        initialNote={editingItem?.note ?? ""}
        initialEventStart={draftEventStart}
        initialEventEnd={draftEventEnd}
        initialRepeat={editingItem?.repeatRule ?? "NONE"}
        initialRepeatUntil={
          editingItem?.repeatUntilISO ? format(new Date(editingItem.repeatUntilISO), "yyyy-MM-dd") : undefined
        }
        initialWithUserIds={
          editingItem?.eventParticipants
            ?.map((p) => p.userId)
            .filter((id): id is string => Boolean(id)) ?? []
        }
        initialOpenCompanionList={inviteFlow}
        initialCategoryId={editingItem ? (editingItem.categoryId ?? null) : undefined}
        calendarCategories={initialCalendarCategories}
        companionOptions={companionOptions}
      />

      <ScheduleCalendarCategoryManager
        categories={initialCalendarCategories}
        open={categoryManagerOpen}
        onClose={() => setCategoryManagerOpen(false)}
      />

      <div className="space-y-1.5">
        <input
          ref={icsImportInputRef}
          type="file"
          accept=".ics,text/calendar"
          className="sr-only"
          tabIndex={-1}
          onChange={onIcsImportPicked}
        />
        <div className="flex flex-col gap-1">
          <div className="flex justify-center px-1">
            <ViewTabs
              value={view}
              onChange={(next) => {
                if (next === "week") {
                  setWeekHorizontalMode(
                    isSameDay(selectedDate, now) && isWeekendDay(now) ? "include-anchor" : "workweek",
                  );
                }
                setView(next);
              }}
            />
          </div>

          <ScheduleDateNavToolbar
            view={view}
            selectedDate={selectedDate}
            onStepPrev={() => step(-1)}
            onStepNext={() => step(1)}
            onJumpToday={() => {
              setWeekHorizontalMode(isWeekendDay(now) ? "include-anchor" : "workweek");
              setSelectedDate(new Date(now));
            }}
            toolbarRight={
              <>
                <div ref={icsMenuRef} className="relative">
                  <button
                    type="button"
                    aria-label="Import or export ICS calendar"
                    aria-expanded={icsMenuOpen}
                    aria-haspopup="menu"
                    disabled={icsBusy !== null}
                    onClick={() => setIcsMenuOpen((o) => !o)}
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-white text-[#2563EB] shadow-sm transition",
                      "hover:bg-blue-50 active:scale-[0.98] disabled:opacity-50",
                      "dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/70",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/35",
                    )}
                  >
                    <Archive className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                  </button>
                  {icsMenuOpen ? (
                    <div
                      role="menu"
                      className="absolute right-0 top-[calc(100%+0.35rem)] z-30 min-w-[10.5rem] overflow-hidden rounded-2xl border border-border/70 bg-popover py-1 text-popover-foreground shadow-lg"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] transition hover:bg-muted/70"
                        disabled={icsBusy !== null}
                        onClick={() => {
                          setIcsMenuOpen(false);
                          void exportIcsCalendar();
                        }}
                      >
                        <Download className="h-4 w-4 shrink-0 opacity-80" strokeWidth={2} aria-hidden />
                        {icsBusy === "export" ? "Exporting…" : "Export .ics"}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] transition hover:bg-muted/70"
                        disabled={icsBusy !== null}
                        onClick={() => {
                          setIcsMenuOpen(false);
                          icsImportInputRef.current?.click();
                        }}
                      >
                        <Upload className="h-4 w-4 shrink-0 opacity-80" strokeWidth={2} aria-hidden />
                        {icsBusy === "import" ? "Importing…" : "Import .ics"}
                      </button>
                    </div>
                  ) : null}
                </div>
                {initialCalendarCategories.length > 0 ? (
                  <button
                    type="button"
                    aria-label="Manage calendar categories"
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-violet-200 bg-white text-violet-700 shadow-sm transition",
                      "hover:bg-violet-50 active:scale-[0.98]",
                      "dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-950/70",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/35",
                    )}
                    onClick={() => setCategoryManagerOpen(true)}
                  >
                    <Calendar className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                  </button>
                ) : null}
                {!adding && !detailItem ? (
                  <button
                    type="button"
                    onClick={toggleAddPanel}
                    aria-label="Add to schedule"
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#E7E0D6] bg-white text-[#111827] shadow-sm transition",
                      "text-lg leading-none hover:bg-[#FAFAF8] active:scale-[0.97]",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      "dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-muted/40",
                    )}
                  >
                    <span aria-hidden className="translate-y-[-0.5px]">
                      ➕
                    </span>
                  </button>
                ) : null}
              </>
            }
          />

          {icsNotice ? (
            <p
              role="status"
              className={cn(
                "max-w-sm px-2 text-center text-[11px] leading-snug",
                icsNotice.tone === "ok" ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
              )}
            >
              {icsNotice.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="relative">
        {view === "day" ? (
          <ScheduleDayTimeline
            items={dayItems}
            isToday={isSelectedToday}
            nowMinute={nowMinute}
            date={selectedDate}
            onCreateEvent={openEventDraft}
            onOpenItem={(item) => {
              if (item.id === "__draft-preview__") return;
              openDetailFromTimelineItem(item, selectedDate);
            }}
          />
        ) : null}

        {view === "week" && !weekImmersiveOpen ? <WeekCalendar {...weekCalendarProps} /> : null}

        {view === "week" && !weekImmersiveOpen && !adding ? (
          <button
            type="button"
            aria-label="Expand week calendar"
            onClick={() => {
              const orient = screen.orientation as ScreenOrientation & {
                lock?: (type: string) => Promise<void>;
              };
              void orient?.lock?.("landscape").catch(() => {
                /* CSS rotate fallback still gives landscape layout on portrait phones */
              });
              setWeekImmersiveOpen(true);
            }}
            className={cn(
              "fixed z-40 flex h-11 w-11 items-center justify-center rounded-full border border-[#E7E0D6] bg-white text-[#111827] shadow-[0_6px_20px_rgba(15,23,42,0.14)] transition",
              "bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-3",
              "hover:bg-[#FAFAF8] active:scale-[0.97]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "dark:border-border dark:bg-card dark:text-foreground dark:shadow-[0_6px_20px_rgba(0,0,0,0.35)]",
            )}
          >
            <Maximize2 className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
        ) : null}

        {view === "month" ? (
          <div className="space-y-2">
            <ScheduleMonthView
              anchorDate={selectedDate}
              selectedDate={selectedDate}
              today={now}
              getDensityForDate={monthDensity}
              onSelectDate={(d) => {
                setSelectedDate(d);
              }}
            />
            <ScheduleDayEventList
              items={dayItems}
              onOpenItem={(item) => {
                if (item.id === "__draft-preview__") return;
                openDetailFromTimelineItem(item, selectedDate);
              }}
            />
          </div>
        ) : null}
      </div>

      <ScheduleItemDetailSheet
        item={detailItem}
        open={Boolean(detailItem)}
        deleting={deletingItem}
        chatReturnTo="/home"
        onClose={() => setDetailItem(null)}
        onEdit={() => openEditSheetFromDetail(false)}
        onInvite={() => openEditSheetFromDetail(true)}
        onDelete={() => void deleteDetailItem()}
      />

      {portalReady
        ? createPortal(
            <AppPushLayer
              open={weekImmersiveOpen}
              onClose={() => setWeekImmersiveOpen(false)}
              zClassName="z-[100]"
              ariaLabel="Week calendar expanded"
              panelClassName="h-full w-full max-w-none overflow-hidden border-0 bg-background shadow-none dark:shadow-none"
              backdropClassName="bg-background !backdrop-blur-none"
            >
              <div
                className={cn(
                  "relative flex h-full min-h-0 flex-col bg-background",
                  immersiveLayout.rotatePortrait
                    ? "absolute left-1/2 top-1/2 box-border h-[100dvw] w-[100dvh] max-h-[100vw] max-w-[100vh] -translate-x-1/2 -translate-y-1/2 rotate-90"
                    : "w-full",
                )}
              >
                {/*
                  Close sits inside the (possibly rotated) shell so “bottom-right” is
                  landscape-oriented — same corner as the calendar’s logical BR, not the
                  portrait viewport’s fixed corner.
                */}
                <button
                  type="button"
                  aria-label="Close expanded calendar"
                  onClick={() => setWeekImmersiveOpen(false)}
                  className={cn(
                    "absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-[max(0.75rem,env(safe-area-inset-right))] z-[110]",
                    "flex h-11 w-11 items-center justify-center rounded-full border border-[#E7E0D6] bg-white/95 text-[#5F6B7A] shadow-[0_4px_16px_rgba(15,23,42,0.12)] backdrop-blur-sm transition",
                    "hover:bg-white hover:text-foreground active:scale-[0.97]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/35",
                    "dark:border-border dark:bg-card/95 dark:text-muted-foreground dark:shadow-[0_4px_16px_rgba(0,0,0,0.35)]",
                  )}
                >
                  <Minimize2 className="h-5 w-5" strokeWidth={2} aria-hidden />
                </button>
                <div className="min-h-0 flex-1 overflow-hidden px-[2px] pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
                  <WeekCalendar
                    {...weekCalendarProps}
                    density="immersive"
                    viewportBodyPx={immersiveLayout.bodyPx}
                    fillParent
                  />
                </div>
              </div>
            </AppPushLayer>,
            document.body,
          )
        : null}
    </section>
  );
}

function ViewTabs({
  value,
  onChange,
}: {
  value: ViewKind;
  onChange: (next: ViewKind) => void;
}) {
  const tabs: ViewKind[] = ["day", "week", "month"];
  return (
    <div
      role="tablist"
      aria-label="Schedule view"
      className={cn(
        "mx-auto flex w-full max-w-[15rem] shrink-0 rounded-full border border-blue-200/90 bg-blue-50/90 p-0.5 sm:max-w-[16rem]",
        "dark:border-blue-800/55 dark:bg-blue-950/45",
      )}
    >
      {tabs.map((t) => {
        const active = t === value;
        return (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t)}
            className={cn(
              "min-w-0 flex-1 rounded-full px-1.5 py-0.5 text-center text-[11px] capitalize leading-tight transition sm:px-2 sm:py-1 sm:text-xs",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/35 focus-visible:ring-offset-1 focus-visible:ring-offset-blue-50",
              "dark:focus-visible:ring-blue-400/45 dark:focus-visible:ring-offset-blue-950",
              active
                ? cn(
                    "bg-[#2563EB] font-semibold text-white shadow-[0_1px_6px_rgba(37,99,235,0.28)]",
                    "dark:bg-blue-500 dark:text-white dark:shadow-[0_1px_8px_rgba(59,130,246,0.3)]",
                  )
                : cn(
                    "font-medium text-blue-800/80 hover:bg-white/60 hover:text-blue-900",
                    "dark:text-blue-200/75 dark:hover:bg-blue-900/50 dark:hover:text-blue-50",
                  ),
            )}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}

function ScheduleDateNavToolbar({
  view,
  selectedDate,
  onStepPrev,
  onStepNext,
  onJumpToday,
  toolbarRight,
}: {
  view: ViewKind;
  selectedDate: Date;
  onStepPrev: () => void;
  onStepNext: () => void;
  onJumpToday: () => void;
  toolbarRight: ReactNode;
}) {
  const weekAnchor =
    view === "week" ? startOfWeek(selectedDate, { weekStartsOn: 1 }) : selectedDate;
  const weekNumber = getISOWeek(weekAnchor);

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-2">
      <div className="min-w-0 justify-self-start pr-1">
        <h2 className="truncate text-base font-bold leading-tight text-[#111827] dark:text-foreground">
          {rangeLabel(view, selectedDate)}
        </h2>
        <p className="mt-0.5 text-[11px] leading-tight text-[#8A94A6] dark:text-muted-foreground">
          Week {weekNumber}
        </p>
      </div>

      <div className="justify-self-center">
        <div
          className={cn(
            "flex h-8 shrink-0 items-stretch overflow-hidden rounded-lg border border-[#E7E0D6] bg-white",
            "shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card dark:shadow-none",
          )}
        >
          <button
            type="button"
            onClick={onStepPrev}
            aria-label="Previous"
            className={cn(
              "flex w-7 items-center justify-center border-r border-[#E7E0D6] text-[#5F6B7A] transition",
              "hover:bg-[#FAFAF8] hover:text-[#111827] active:bg-[#F3F0EA]/90",
              "dark:border-border dark:text-muted-foreground dark:hover:bg-muted/45 dark:hover:text-foreground",
            )}
          >
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </button>
          <button
            type="button"
            onClick={onJumpToday}
            aria-label="Jump to today"
            className={cn(
              "min-w-0 px-2 text-center text-[12px] font-medium tabular-nums leading-none text-[#5F6B7A] transition",
              "border-r border-[#E7E0D6] hover:bg-[#FAFAF8] hover:text-[#111827] active:bg-[#F3F0EA]/90",
              "dark:border-border dark:text-muted-foreground dark:hover:bg-muted/45 dark:hover:text-foreground",
            )}
          >
            Today
          </button>
          <button
            type="button"
            onClick={onStepNext}
            aria-label="Next"
            className={cn(
              "flex w-7 items-center justify-center text-[#5F6B7A] transition",
              "hover:bg-[#FAFAF8] hover:text-[#111827] active:bg-[#F3F0EA]/90",
              "dark:text-muted-foreground dark:hover:bg-muted/45 dark:hover:text-foreground",
            )}
          >
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </button>
        </div>
      </div>

      <div className="flex min-w-0 shrink-0 items-center justify-end gap-1.5 justify-self-end pl-1">
        {toolbarRight}
      </div>
    </div>
  );
}

/**
 * Human-readable title for the current view:
 *  - day   : "Wed, Apr 22"
 *  - week  : "Apr 21 – 27"          (omit year when same year)
 *  - month : "April 2026"
 */
function rangeLabel(view: ViewKind, date: Date): string {
  if (view === "day") return format(date, "EEE, MMM d");
  if (view === "month") return format(date, "MMMM yyyy");
  const ws = startOfWeek(date, { weekStartsOn: 1 });
  const we = endOfWeek(date, { weekStartsOn: 1 });
  if (view === "week") {
    if (isSameMonth(ws, we)) return format(ws, "MMMM yyyy");
    if (isSameYear(ws, we)) {
      return `${format(ws, "MMM")} / ${format(we, "MMM yyyy")}`;
    }
    return `${format(ws, "MMM yyyy")} / ${format(we, "MMM yyyy")}`;
  }
  if (isSameMonth(ws, we)) {
    return `${format(ws, "MMM d")} – ${format(we, "d")}`;
  }
  if (isSameYear(ws, we)) {
    return `${format(ws, "MMM d")} – ${format(we, "MMM d")}`;
  }
  return `${format(ws, "MMM d, yyyy")} – ${format(we, "MMM d, yyyy")}`;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
