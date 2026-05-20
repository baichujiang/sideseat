"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import type { CalendarRepeatRule, Weekday } from "@prisma/client";
import {
  addDays,
  addMonths,
  endOfWeek,
  format,
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
  FileUp,
  Loader2,
  Plus,
  Share2,
  Upload,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";

import {
  WeekCalendar,
  WEEK_CALENDAR_HEADER_HEIGHT_PX,
  WEEK_CALENDAR_MINUTE_SCALE_DEFAULT,
  WEEK_CALENDAR_VISIBLE_DAY_MAX,
  WEEK_CALENDAR_VISIBLE_DAY_MIN,
  clampWeekCalendarMinuteScale,
  clampWeekCalendarVisibleDayCount,
  type WeekCalendarBlock,
} from "@/components/calendar/week-calendar";
import type { WeekEventEditToolbarLabels } from "@/components/calendar/week-event-edit-toolbar";
import { useLocaleContext } from "@/components/i18n/locale-provider";
import { ScheduleAddPanel } from "@/components/home/schedule-add-panel";
import { ScheduleCalendarCategoryManager } from "@/components/home/schedule-calendar-category-manager";
import { createScheduleSharePath } from "@/lib/schedule-share/create-schedule-share-client";
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
import { HomeCalendarVisual, HomeGreetingHeading } from "@/components/home/home-hero";
import { AppPushLayer } from "@/components/ui/app-push-layer";
import {
  berlinClockMinutes,
  berlinWeekdayFromInstant,
  scheduleDateKeyInBerlin,
} from "@/lib/calendar/schedule-berlin";
import { courseCalendarShortLabel } from "@/lib/calendar/course-calendar-short-label";
import { isIcsFeedStudyEntryId } from "@/lib/calendar/ics-feed-event-id";
import type { AppLocale } from "@/lib/i18n/app-locale";
import { formatMessage, type AppMessages } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

function formatRepeatLabel(rule: CalendarRepeatRule, s: AppMessages["schedule"]): string {
  switch (rule) {
    case "DAILY":
      return s.repeatDaily;
    case "WEEKLY":
      return s.repeatWeekly;
    case "BIWEEKLY":
      return s.repeatBiweekly;
    case "MONTHLY":
      return s.repeatMonthly;
    case "YEARLY":
      return s.repeatYearly;
    default:
      return s.repeatNone;
  }
}

function weekBlockToDayTimelineItem(block: WeekCalendarBlock, repeatNoneLabel: string): DayTimelineItem {
  return {
    id:
      block.kind === "study"
        ? block.courseId.replace(/^study-/, "")
        : `${block.courseId}-${block.weekday}-${block.startMinute}`,
    kind: block.kind === "study" ? "study" : "class",
    source: block.source,
    startMinute: block.startMinute,
    endMinute: block.endMinute,
    title: block.courseCode ? `${block.courseCode} · ${block.courseName}` : block.courseName,
    location: block.location,
    withLabel: block.withLabel ?? null,
    note: block.note ?? null,
    repeatLabel: block.repeatLabel ?? repeatNoneLabel,
    repeatRule: block.repeatRule ?? "NONE",
    repeatUntilISO: block.repeatUntilISO ?? null,
    eventParticipants: block.eventParticipants ?? [],
    courseId: block.source === "course" ? block.courseId : null,
    courseCode: block.source === "course" ? block.courseCode : null,
    courseName: block.source === "course" ? block.courseName : null,
    courseShortLabel:
      block.source === "course"
        ? courseCalendarShortLabel({
            courseCode: block.courseCode,
            courseName: block.courseName,
          }) ?? undefined
        : undefined,
    categoryId: block.categoryId ?? null,
    categoryName: block.categoryName ?? null,
    categoryColor: block.categoryColor ?? null,
  };
}

type ViewKind = "day" | "week" | "month";

type CalendarEventDeleteScope = "this" | "future" | "all";

const HOME_CALENDAR_VISIBLE_DAYS_DEFAULT = 5;
const HOME_CALENDAR_VISIBLE_DAYS_STORAGE_KEY = "homeCalendarVisibleDays";
const HOME_CALENDAR_MINUTE_SCALE_STORAGE_KEY = "homeCalendarMinuteScale";

/** Same offset as the week-view share FAB — keeps the visible-days slider above the tab bar. */
const HOME_WEEK_FLOATING_CONTROLS_BOTTOM_REM = 5.75;

function measureSafeAreaInsetBottom(): number {
  if (typeof document === "undefined") return 0;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;left:0;bottom:0;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom)";
  document.body.appendChild(probe);
  const px = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
  document.body.removeChild(probe);
  return px;
}

function homeWeekFloatingControlsBottomPx(): number {
  const root = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return HOME_WEEK_FLOATING_CONTROLS_BOTTOM_REM * root + measureSafeAreaInsetBottom();
}

function parseStoredHomeCalendarVisibleDays(rawValue: string | null): number | null {
  if (!rawValue) return null;
  const parsed = Number.parseInt(rawValue, 10);
  if (Number.isNaN(parsed)) return null;
  return clampWeekCalendarVisibleDayCount(parsed);
}

function parseStoredHomeCalendarMinuteScale(rawValue: string | null): number | null {
  if (!rawValue) return null;
  const parsed = Number.parseFloat(rawValue);
  if (Number.isNaN(parsed)) return null;
  return clampWeekCalendarMinuteScale(parsed);
}

/** Recurring course block (weekday-indexed). */
export type ClassBlock = {
  courseId: string;
  courseName: string;
  courseCode: string | null;
  weekday: Weekday;
  startMinute: number;
  endMinute: number;
  location: string | null;
  /** Only for calendar events; enrolled courses use fixed blue + short label in the UI. */
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
  icsSubscriptionUrl: string | null;
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

const WEEKDAY_BY_JS: Record<number, Weekday> = {
  0: "SUN",
  1: "MON",
  2: "TUE",
  3: "WED",
  4: "THU",
  5: "FRI",
  6: "SAT",
};

type IcsSaveOutcome = "saved" | "cancelled" | "fallback";

/**
 * Prefer the File System Access save picker when available so we can tell save vs cancel.
 * Fallback `<a download>` cannot detect cancellation — do not show a false “success” for that path.
 */
async function saveIcsBlobWithPickerOrDownload(
  blob: Blob,
  filename: string,
  calendarFileTypeDescription: string,
): Promise<IcsSaveOutcome> {
  const g = globalThis as typeof globalThis & {
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: Array<{ description: string; accept: Record<string, string[]> }>;
    }) => Promise<FileSystemFileHandle>;
  };

  if (typeof g.showSaveFilePicker === "function") {
    try {
      const handle = await g.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: calendarFileTypeDescription, accept: { "text/calendar": [".ics"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return "saved";
    } catch (e) {
      const name = e && typeof e === "object" && "name" in e ? String((e as { name: unknown }).name) : "";
      if (name === "AbortError") return "cancelled";
      throw e;
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
  return "fallback";
}

/**
 * Schedule surface — the single interactive calendar on Home.
 *
 * State model: one `selectedDate` shared across all three views. Switching
 * view never loses the date context, so "Week" anchored on April 15 stays
 * on the April 13–19 week even if you later jump back to Day.
 *
 * Data model: `classBlocks` is inherently recurring (we just filter by
 * weekday), `studyEntries` is a flat list of materialized calendar rows.
 * Parent fetches a wide date window of one-off calendar rows (see Home page);
 * recurring courses are not windowed.
 */
export function ScheduleSurface({
  classBlocks,
  studyEntries,
  companionOptions,
  initialCalendarCategories,
  nowISO,
  semesterStartISO,
  semesterEndISO,
  homeGreeting,
  homeBelowHeaderSlot,
}: {
  classBlocks: ClassBlock[];
  studyEntries: StudyEntry[];
  companionOptions: CompanionOption[];
  initialCalendarCategories: CalendarCategoryLite[];
  /** Server-rendered "now" so first paint matches the SSR output. */
  nowISO: string;
  semesterStartISO: string;
  semesterEndISO: string;
  /** When set, greeting + view tabs share a column with calendar + toolbar on the right (Home). */
  homeGreeting?: { nickname: string | null; avatarUrl: string | null } | null;
  /** Inserted between the home header row and the date navigation (e.g. onboarding CTA). */
  homeBelowHeaderSlot?: ReactNode;
}) {
  const router = useRouter();
  const { messages, locale } = useLocaleContext();
  const [view, setView] = useState<ViewKind>("week");
  const [now, setNow] = useState(() => new Date(nowISO));
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date(nowISO));
  const [visibleDayCount, setVisibleDayCount] = useState(HOME_CALENDAR_VISIBLE_DAYS_DEFAULT);
  const [weekMinuteScale, setWeekMinuteScale] = useState(WEEK_CALENDAR_MINUTE_SCALE_DEFAULT);
  const [weekHorizontalMode, setWeekHorizontalMode] = useState<"workweek" | "include-anchor">(() =>
    isWeekendDay(new Date(nowISO)) ? "include-anchor" : "workweek",
  );
  const [adding, setAdding] = useState(false);
  /** In-grid draft visible while dragging on empty week cells (before add panel opens). */
  const [gridCreatePreview, setGridCreatePreview] = useState(false);
  const [draftEventStart, setDraftEventStart] = useState<string | undefined>(undefined);
  const [draftEventEnd, setDraftEventEnd] = useState<string | undefined>(undefined);
  const [editingItem, setEditingItem] = useState<ScheduleDetailItem | null>(null);
  const [detailItem, setDetailItem] = useState<ScheduleDetailItem | null>(null);
  const [inviteFlow, setInviteFlow] = useState(false);
  const [deletingItem, setDeletingItem] = useState(false);
  const icsImportInputRef = useRef<HTMLInputElement | null>(null);
  const [icsBusy, setIcsBusy] = useState<"export" | "import" | null>(null);
  const [icsNotice, setIcsNotice] = useState<{ tone: "ok" | "err"; message: string } | null>(null);
  const [icsMenuOpen, setIcsMenuOpen] = useState(false);
  const icsMenuRef = useRef<HTMLDivElement | null>(null);
  /** Caps inline week grid height so pinch-zoom cannot push controls off-screen (see `maxViewportBodyPx`). */
  const weekHomeLayoutRef = useRef<HTMLDivElement | null>(null);
  const weekVisibleDaysBarRef = useRef<HTMLDivElement | null>(null);
  const [weekHomeMaxViewportBodyPx, setWeekHomeMaxViewportBodyPx] = useState<number | null>(null);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [scheduleShareBusy, setScheduleShareBusy] = useState(false);
  const recurringDeletePayloadRef = useRef<{ eventId: string } | null>(null);
  const recurringDeleteResolverRef = useRef<((ok: boolean) => void) | null>(null);
  const [recurringDeleteDialog, setRecurringDeleteDialog] = useState<{ eventId: string; title: string } | null>(
    null,
  );
  const [recurringDeleteBusy, setRecurringDeleteBusy] = useState(false);
  const semesterStart = new Date(semesterStartISO);
  const semesterEnd = new Date(semesterEndISO);

  const resetAddDraft = () => {
    setGridCreatePreview(false);
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

  const openScheduleShare = useCallback(async () => {
    if (scheduleShareBusy) return;
    setScheduleShareBusy(true);
    const result = await createScheduleSharePath({
      createFailed: messages.scheduleShare.createFailed,
      networkError: messages.scheduleShare.networkError,
    });
    setScheduleShareBusy(false);
    if (result.ok) {
      router.push(result.path as Route);
      return;
    }
    setIcsNotice({ tone: "err", message: result.error });
  }, [scheduleShareBusy, messages.scheduleShare, router]);

  /** Toolbar + : open fresh add panel, or close when already open (keeps control visible). */
  const handleAddToolbarClick = () => {
    if (adding) {
      closeAddPanel({ refresh: false });
      return;
    }
    resetAddDraft();
    setAdding(true);
  };

  useEffect(() => {
    const serverNow = new Date(nowISO);
    setNow(serverNow);
  }, [nowISO]);

  useEffect(() => {
    const storedValue = parseStoredHomeCalendarVisibleDays(
      window.localStorage.getItem(HOME_CALENDAR_VISIBLE_DAYS_STORAGE_KEY),
    );
    if (storedValue == null) return;
    setVisibleDayCount(storedValue);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(HOME_CALENDAR_VISIBLE_DAYS_STORAGE_KEY, String(visibleDayCount));
  }, [visibleDayCount]);

  useEffect(() => {
    const storedValue = parseStoredHomeCalendarMinuteScale(
      window.localStorage.getItem(HOME_CALENDAR_MINUTE_SCALE_STORAGE_KEY),
    );
    if (storedValue == null) return;
    setWeekMinuteScale(storedValue);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      window.localStorage.setItem(
        HOME_CALENDAR_MINUTE_SCALE_STORAGE_KEY,
        String(weekMinuteScale),
      );
    }, 180);
    return () => window.clearTimeout(timeoutId);
  }, [weekMinuteScale]);

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
        repeatLabel: messages.schedule.repeatWeekly,
        repeatRule: "WEEKLY",
        repeatUntilISO: null,
        eventParticipants: [],
        courseId: b.courseId,
        courseCode: b.courseCode,
        courseName: b.courseName,
        courseShortLabel: courseCalendarShortLabel({
          courseCode: b.courseCode,
          courseName: b.courseName,
        }),
        categoryId: b.categoryId,
        categoryName: b.categoryName,
        categoryColor: b.categoryColor,
      }),
    );
    const studyItems: DayTimelineItem[] = studies
      .filter((s) => scheduleDateKeyInBerlin(s.start) === scheduleDateKeyInBerlin(date))
      .map((s) => ({
        id: s.id,
        kind: "study",
        source: "calendar",
        startMinute: berlinClockMinutes(s.start),
        endMinute: berlinClockMinutes(s.end),
        title: s.title,
        location: s.location,
        withLabel: s.withLabel,
        note: s.note,
        repeatLabel: formatRepeatLabel(s.repeatRule, messages.schedule),
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
    if ((!adding && !gridCreatePreview) || editingItem || !draftEventStart || !draftEventEnd) return base;
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
      title: messages.schedule.newEvent,
      location: null,
      withLabel: null,
      note: null,
      repeatLabel: messages.schedule.repeatNone,
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
    gridCreatePreview,
    editingItem,
    draftEventStart,
    draftEventEnd,
    draftCategoryMeta,
    messages.schedule,
  ]);

  const applyGridDraftRange = useCallback((start: Date, end: Date) => {
    setDraftEventStart(format(start, "yyyy-MM-dd'T'HH:mm"));
    setDraftEventEnd(format(end, "yyyy-MM-dd'T'HH:mm"));
    setGridCreatePreview(true);
  }, []);

  const handleCreateRangePreview = useCallback(
    (range: { start: Date; end: Date } | null) => {
      if (!range) {
        if (!adding) {
          setGridCreatePreview(false);
          setDraftEventStart(undefined);
          setDraftEventEnd(undefined);
        }
        return;
      }
      applyGridDraftRange(range.start, range.end);
    },
    [adding, applyGridDraftRange],
  );

  const handleDraftPreviewTimesChange = useCallback(
    (range: { start: Date; end: Date }) => {
      applyGridDraftRange(range.start, range.end);
    },
    [applyGridDraftRange],
  );

  const openEventDraft = (start: Date, end: Date) => {
    setGridCreatePreview(false);
    setDraftEventStart(format(start, "yyyy-MM-dd'T'HH:mm"));
    setDraftEventEnd(format(end, "yyyy-MM-dd'T'HH:mm"));
    setSelectedDate(start);
    setDetailItem(null);
    setEditingItem(null);
    setInviteFlow(false);
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
      repeatLabel: item.repeatLabel ?? messages.schedule.repeatNone,
      repeatRule: item.repeatRule ?? "NONE",
      repeatUntilISO: item.repeatUntilISO ?? null,
      eventParticipants: item.eventParticipants ?? [],
      categoryId: item.categoryId ?? null,
      categoryName: item.categoryName ?? null,
      categoryColor: item.categoryColor ?? null,
    });
  };

  function openEditFromTimelineItem(item: DayTimelineItem, date: Date) {
    if (item.id === "__draft-preview__") return;
    if (item.source !== "calendar") {
      openDetailFromTimelineItem(item, date);
      return;
    }
    const start = new Date(date);
    start.setHours(0, item.startMinute, 0, 0);
    const end = new Date(date);
    end.setHours(0, item.endMinute, 0, 0);
    const detail: ScheduleDetailItem = {
      id: item.id,
      source: "calendar",
      title: item.title,
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      location: item.location,
      note: item.note ?? null,
      repeatLabel: item.repeatLabel ?? messages.schedule.repeatNone,
      repeatRule: item.repeatRule ?? "NONE",
      repeatUntilISO: item.repeatUntilISO ?? null,
      eventParticipants: item.eventParticipants ?? [],
      categoryId: item.categoryId ?? null,
      categoryName: item.categoryName ?? null,
      categoryColor: item.categoryColor ?? null,
    };
    setInviteFlow(false);
    setEditingItem(detail);
    setDraftEventStart(format(start, "yyyy-MM-dd'T'HH:mm"));
    setDraftEventEnd(format(end, "yyyy-MM-dd'T'HH:mm"));
    setSelectedDate(date);
    setDetailItem(null);
    setAdding(true);
  }

  /** Tap on week grid: always open detail sheet first; user edits from there. */
  function handleWeekCardTap(item: WeekCalendarBlock, occurrenceDate: Date) {
    if (item.courseId === "__draft-preview__") return;
    const ti = weekBlockToDayTimelineItem(item, messages.schedule.repeatNone);
    openDetailFromTimelineItem(ti, occurrenceDate);
  }

  // Week view: classes repeat every week, so we can show them on any
  // anchor week. Study entries need to be filtered to that week and
  // injected as "study"-kind blocks.
  const { weekTimedBlocks } = useMemo(() => {
    const includeClasses = weekEnd >= semesterStart && weekStart <= semesterEnd;
    const studyBlocks = studies.filter((s) => s.start <= weekEnd && s.end >= weekStart)
      .map((s) => ({
        courseId: `study-${s.id}`,
        courseName: s.title,
        courseCode: null,
        source: "calendar" as const,
        weekday: berlinWeekdayFromInstant(s.start),
        startMinute: berlinClockMinutes(s.start),
        endMinute: berlinClockMinutes(s.end),
        location: s.location,
        withLabel: s.withLabel,
        note: s.note,
        repeatLabel: formatRepeatLabel(s.repeatRule, messages.schedule),
        repeatRule: s.repeatRule,
        repeatUntilISO: s.repeatUntilISO,
        eventParticipants: s.eventParticipants,
        kind: "study" as const,
        categoryId: s.categoryId,
        categoryName: s.categoryName,
        categoryColor: s.categoryColor,
        calendarEntryId: isIcsFeedStudyEntryId(s.id) ? undefined : s.id,
      }));
    const courseBlocks = includeClasses
      ? classBlocks.map((block) => ({
          ...block,
          source: "course" as const,
          note: null,
          repeatLabel: messages.schedule.repeatWeekly,
          repeatRule: "WEEKLY" as const,
          repeatUntilISO: null,
          eventParticipants: [],
        }))
      : [];

    const timedMerged: WeekCalendarBlock[] = [...courseBlocks, ...studyBlocks];

    if ((adding || gridCreatePreview) && !editingItem && draftEventStart && draftEventEnd) {
      const draftStart = new Date(draftEventStart);
      const draftEnd = new Date(draftEventEnd);
      if (
        !Number.isNaN(draftStart.getTime()) &&
        !Number.isNaN(draftEnd.getTime()) &&
        draftStart >= weekStart &&
        draftStart <= weekEnd
      ) {
        const draftBlock: WeekCalendarBlock = {
          courseId: "__draft-preview__",
          courseName: messages.schedule.newEvent,
          courseCode: null,
          source: "calendar" as const,
          weekday: WEEKDAY_BY_JS[draftStart.getDay()],
          startMinute: draftStart.getHours() * 60 + draftStart.getMinutes(),
          endMinute: draftEnd.getHours() * 60 + draftEnd.getMinutes(),
          location: null,
          withLabel: null,
          note: null,
          repeatLabel: messages.schedule.repeatNone,
          repeatRule: "NONE" as const,
          repeatUntilISO: null,
          eventParticipants: [],
          kind: "study" as const,
          categoryId: draftCategoryMeta.id,
          categoryName: draftCategoryMeta.name,
          categoryColor: null,
        };
        timedMerged.push(draftBlock);
      }
    }

    return { weekTimedBlocks: timedMerged };
  }, [
    classBlocks,
    studies,
    selectedDate,
    weekStart,
    weekEnd,
    semesterStart,
    semesterEnd,
    adding,
    gridCreatePreview,
    editingItem,
    draftEventStart,
    draftEventEnd,
    draftCategoryMeta,
    messages.schedule,
  ]);

  const dismissRecurringDeleteDialog = useCallback(() => {
    if (recurringDeleteBusy) return;
    setRecurringDeleteDialog(null);
    recurringDeletePayloadRef.current = null;
    const resolve = recurringDeleteResolverRef.current;
    recurringDeleteResolverRef.current = null;
    resolve?.(false);
  }, [recurringDeleteBusy]);

  const applyRecurringDeleteScope = useCallback(
    async (scope: CalendarEventDeleteScope) => {
      const payload = recurringDeletePayloadRef.current;
      const resolve = recurringDeleteResolverRef.current;
      if (!payload || !resolve) return;
      setRecurringDeleteBusy(true);
      const res = await apiFetch(
        `/api/calendar/events/${encodeURIComponent(payload.eventId)}?scope=${scope}`,
        { method: "DELETE" },
      );
      setRecurringDeleteBusy(false);
      if (!res.ok) {
        setRecurringDeleteDialog(null);
        recurringDeletePayloadRef.current = null;
        recurringDeleteResolverRef.current = null;
        resolve(false);
        return;
      }
      recurringDeletePayloadRef.current = null;
      recurringDeleteResolverRef.current = null;
      setRecurringDeleteDialog(null);
      resolve(true);
      router.refresh();
    },
    [router],
  );

  async function deleteDetailItem() {
    if (!detailItem || detailItem.source !== "calendar") return;
    if (isIcsFeedStudyEntryId(detailItem.id)) return;
    if (detailItem.repeatRule === "NONE") {
      if (!window.confirm(messages.weekCalendarEditToolbar.deleteConfirm)) return;
      setDeletingItem(true);
      const response = await apiFetch(
        `/api/calendar/events/${encodeURIComponent(detailItem.id)}?scope=this`,
        { method: "DELETE" },
      );
      setDeletingItem(false);
      if (!response.ok) return;
      setDetailItem(null);
      router.refresh();
      return;
    }
    recurringDeletePayloadRef.current = { eventId: detailItem.id };
    const ok = await new Promise<boolean>((resolve) => {
      recurringDeleteResolverRef.current = resolve;
      setRecurringDeleteDialog({
        eventId: detailItem.id,
        title: detailItem.title.trim() || messages.schedule.newEvent,
      });
    });
    if (!ok) return;
    setDetailItem(null);
  }

  function openEditSheetFromDetail(inviteOnly = false) {
    if (!detailItem || detailItem.source !== "calendar") return;
    if (isIcsFeedStudyEntryId(detailItem.id)) return;
    setInviteFlow(inviteOnly);
    setEditingItem(detailItem);
    setDraftEventStart(format(new Date(detailItem.startISO), "yyyy-MM-dd'T'HH:mm"));
    setDraftEventEnd(format(new Date(detailItem.endISO), "yyyy-MM-dd'T'HH:mm"));
    setSelectedDate(new Date(detailItem.startISO));
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
      const key = scheduleDateKeyInBerlin(s.start);
      studyCountByDateKey.set(key, (studyCountByDateKey.get(key) ?? 0) + 1);
    }
    return (d: Date): number => {
      const weekday = WEEKDAY_BY_JS[d.getDay()];
      const classDensity = d >= semesterStart && d <= semesterEnd ? classCountByWeekday[weekday] : 0;
      let n = classDensity + (studyCountByDateKey.get(scheduleDateKeyInBerlin(d)) ?? 0);
      if ((adding || gridCreatePreview) && !editingItem && draftEventStart && draftEventEnd) {
        const draftStart = new Date(draftEventStart);
        if (
          !Number.isNaN(draftStart.getTime()) &&
          scheduleDateKeyInBerlin(draftStart) === scheduleDateKeyInBerlin(d)
        ) {
          n += 1;
        }
      }
      return n;
    };
  }, [
    classBlocks,
    studies,
    semesterStart,
    semesterEnd,
    adding,
    gridCreatePreview,
    editingItem,
    draftEventStart,
    draftEventEnd,
  ]);

  // Navigation handlers. Day: ±1 day; Week: ±7 days; Month: ±1 month.
  // "Today" snaps `selectedDate` back without leaving the current view.
  const step = (direction: 1 | -1) => {
    setSelectedDate((prev) => {
      if (view === "day") return addDays(prev, direction);
      if (view === "week") {
        const next = addDays(prev, direction * 7);
        // Default week grid only shows 5 columns wide; `include-anchor` scrolls so Sat/Sun stay in view.
        // Never force workweek here — doing so hid Sunday whenever the user stepped weeks on a weekend.
        setWeekHorizontalMode(isWeekendDay(next) ? "include-anchor" : "workweek");
        return next;
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
          message: errText.trim().slice(0, 160) || messages.schedule.exportError,
        });
        return;
      }
      const blob = await res.blob();
      const outcome = await saveIcsBlobWithPickerOrDownload(
        blob,
        "sideseat-schedule.ics",
        messages.schedule.icsCalendarPickerDescription,
      );
      if (outcome === "saved") {
        setIcsNotice({ tone: "ok", message: messages.schedule.exportSaved });
      }
    } catch {
      setIcsNotice({ tone: "err", message: messages.schedule.exportError });
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
        setIcsNotice({ tone: "err", message: json.error ?? messages.schedule.importFailed });
        return;
      }
      const imported = json.data?.imported ?? 0;
      const skipped = json.data?.skipped ?? 0;
      const base =
        imported === 1
          ? messages.schedule.importSuccessOne
          : formatMessage(messages.schedule.importSuccessMany, { imported });
      const suffix = skipped > 0 ? ` ${formatMessage(messages.schedule.importSuccessSkipped, { skipped })}` : "";
      setIcsNotice({
        tone: "ok",
        message: `${base}${suffix}`,
      });
      router.refresh();
    } catch {
      setIcsNotice({ tone: "err", message: messages.schedule.importErrorGeneric });
    } finally {
      setIcsBusy(null);
    }
  }

  const isSelectedToday = isSameDay(selectedDate, now);
  const nowMinute = now.getHours() * 60 + now.getMinutes();

  const weekAnchorWeekday =
    weekStart <= now && now <= weekEnd ? WEEKDAY_BY_JS[now.getDay()] : WEEKDAY_BY_JS[selectedDate.getDay()];

  const effectiveWeekHorizontalMode =
    visibleDayCount < HOME_CALENDAR_VISIBLE_DAYS_DEFAULT ? "include-anchor" : weekHorizontalMode;

  const patchCalendarEventTimes = useCallback(
    async (args: { eventId: string; startAt: Date; endAt: Date }): Promise<boolean> => {
      const entry = studyEntries.find((s) => s.id === args.eventId);
      if (!entry || isIcsFeedStudyEntryId(entry.id)) return false;
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

  /**
   * Delete an editable calendar entry from the floating week-grid toolbar.
   * Returns `false` for synthetic ICS rows (read-only) so the toolbar can keep
   * the selection visible and let the user pick a different action.
   */
  const deleteCalendarEvent = useCallback(
    async ({ eventId, repeatRule }: { eventId: string; repeatRule: CalendarRepeatRule }): Promise<boolean> => {
      if (isIcsFeedStudyEntryId(eventId)) return false;
      if (repeatRule === "NONE") {
        const res = await apiFetch(
          `/api/calendar/events/${encodeURIComponent(eventId)}?scope=this`,
          { method: "DELETE" },
        );
        if (!res.ok) return false;
        router.refresh();
        return true;
      }
      recurringDeletePayloadRef.current = { eventId };
      return new Promise<boolean>((resolve) => {
        recurringDeleteResolverRef.current = resolve;
        const entry = studyEntries.find((s) => s.id === eventId);
        setRecurringDeleteDialog({
          eventId,
          title: entry?.title?.trim() || messages.schedule.newEvent,
        });
      });
    },
    [router, studyEntries, messages.schedule.newEvent],
  );

  /**
   * Duplicate an editable calendar entry. The new occurrence is placed in the
   * same week at the original's `endAt` — i.e. immediately after the source
   * event — which mirrors how iOS Calendar's “Duplicate” keeps the dupe close
   * to the original without colliding with it. Recurring events become a
   * single one-off (`repeat: "NONE"`) to avoid silently fanning out a series.
   */
  const duplicateCalendarEvent = useCallback(
    async ({ block, occurrenceDate }: { block: WeekCalendarBlock; occurrenceDate: Date }): Promise<boolean> => {
      if (block.source !== "calendar" || !block.calendarEntryId) return false;
      if (isIcsFeedStudyEntryId(block.calendarEntryId)) return false;

      const entry = studyEntries.find((s) => s.id === block.calendarEntryId);
      if (!entry) return false;

      const durationMs = Math.max(15 * 60_000, block.endMinute - block.startMinute) * 60_000;
      const occurrenceMidnight = new Date(occurrenceDate);
      occurrenceMidnight.setHours(0, 0, 0, 0);
      const newStart = new Date(occurrenceMidnight.getTime() + block.endMinute * 60_000);
      const newEnd = new Date(newStart.getTime() + durationMs);

      const withUserIds = entry.eventParticipants
        .map((p) => p.userId)
        .filter((id): id is string => Boolean(id));

      const res = await apiFetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: entry.title,
          location: entry.location?.trim() ?? "",
          note: entry.note?.trim() ?? "",
          startAt: newStart.toISOString(),
          endAt: newEnd.toISOString(),
          withUserIds,
          /** Always one-off — duplicating a recurring series would otherwise create a parallel infinite series. */
          repeat: "NONE",
          repeatUntil: "",
          categoryId: entry.categoryId,
        }),
      });
      if (!res.ok) return false;
      router.refresh();
      return true;
    },
    [studyEntries, router],
  );

  /**
   * Rich copy hook — falls back to the WeekCalendar's default text summary
   * when not provided. We add participants + repeat rule so the clipboard
   * snapshot is complete enough to paste into a note or email.
   */
  const copyCalendarEvent = useCallback(
    async ({
      block,
      occurrenceDate,
    }: {
      block: WeekCalendarBlock;
      occurrenceDate: Date;
    }): Promise<{ summaryText: string }> => {
      const fmt = (m: number) => {
        const h = Math.floor(m / 60).toString().padStart(2, "0");
        const mm = (m % 60).toString().padStart(2, "0");
        return `${h}:${mm}`;
      };
      const date = format(occurrenceDate, "yyyy-MM-dd");
      const title = block.courseName?.trim() || "Event";
      const lines = [title, `${date} ${fmt(block.startMinute)} – ${fmt(block.endMinute)}`];
      if (block.location?.trim()) lines.push(block.location.trim());
      if (block.withLabel?.trim()) lines.push(block.withLabel.trim());
      if (block.repeatLabel && block.repeatRule && block.repeatRule !== "NONE") {
        lines.push(block.repeatLabel);
      }
      if (block.note?.trim()) lines.push("", block.note.trim());
      const text = lines.join("\n");
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          return { summaryText: text };
        }
      } catch {
        /* fall through to manual copy */
      }
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      ta.style.pointerEvents = "none";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return { summaryText: text };
    },
    [],
  );

  const editToolbarLabels: WeekEventEditToolbarLabels = useMemo(
    () => ({
      cut: messages.weekCalendarEditToolbar.cut,
      copy: messages.weekCalendarEditToolbar.copy,
      duplicate: messages.weekCalendarEditToolbar.duplicate,
      delete: messages.weekCalendarEditToolbar.delete,
      toolbarAriaLabel: messages.weekCalendarEditToolbar.toolbarAriaLabel,
    }),
    [messages],
  );

  const weekCalendarProps = {
    blocks: weekTimedBlocks,
    anchorWeekday: weekAnchorWeekday,
    horizontalMode: effectiveWeekHorizontalMode,
    nowMinute,
    showNowLine: weekStart <= now && now <= weekEnd,
    weekStartDate: weekStart,
    focusDate: selectedDate,
    today: now,
    visibleDayCount,
    minuteScale: weekMinuteScale,
    onMinuteScaleChange: setWeekMinuteScale,
    onCreateEvent: openEventDraft,
    onCreateRangePreview: handleCreateRangePreview,
    onDraftPreviewTimesChange: handleDraftPreviewTimesChange,
    onOpenItem: handleWeekCardTap,
    onPatchCalendarEventTimes: patchCalendarEventTimes,
    onDeleteCalendarEvent: deleteCalendarEvent,
    onDuplicateCalendarEvent: duplicateCalendarEvent,
    onCopyCalendarEvent: copyCalendarEvent,
    editToolbarLabels,
    showTimeColumnLabel: false,
  };

  const useCompactHomeHeader = homeGreeting != null;

  useLayoutEffect(() => {
    if (view !== "week") {
      setWeekHomeMaxViewportBodyPx(null);
      return;
    }
    const wrap = weekHomeLayoutRef.current;
    const bar = weekVisibleDaysBarRef.current;
    if (!wrap || !bar) return;

    const measure = () => {
      const vv = window.visualViewport;
      const vh = (vv?.height ?? window.innerHeight) + (vv?.offsetTop ?? 0);
      const top = wrap.getBoundingClientRect().top;
      const barHeightPx = bar.getBoundingClientRect().height;
      const gapAboveBarPx = 4;
      const bottomStackPx = homeWeekFloatingControlsBottomPx();
      const cushionPx = 4;
      // Cap calendar growth so this block (calendar + bar) ends above the tab bar;
      // the bar sits in document flow directly under the calendar.
      const maxOuterPx =
        vh - top - barHeightPx - gapAboveBarPx - bottomStackPx - cushionPx;
      const maxBodyPx = maxOuterPx - WEEK_CALENDAR_HEADER_HEIGHT_PX;
      setWeekHomeMaxViewportBodyPx(
        Number.isFinite(maxBodyPx) ? Math.max(140, Math.floor(maxBodyPx)) : null,
      );
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", measure);
    vv?.addEventListener("scroll", measure);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      vv?.removeEventListener("resize", measure);
      vv?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [view, useCompactHomeHeader, homeBelowHeaderSlot, adding, visibleDayCount, weekMinuteScale]);

  const iconBtnSm = "h-8 w-8 sm:h-9 sm:w-9";
  const iconGlyphSm = "h-3.5 w-3.5 sm:h-4 sm:w-4";

  const toolbarActions = (
    <>
      <div ref={icsMenuRef} className="relative z-[1] isolate">
        <button
          type="button"
          aria-label={messages.schedule.icsMenuAria}
          aria-expanded={icsMenuOpen}
          aria-haspopup="menu"
          disabled={icsBusy !== null}
          onClick={() => setIcsMenuOpen((o) => !o)}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full border border-blue-200 bg-white text-[#2563EB] shadow-sm transition",
            iconBtnSm,
            "hover:bg-blue-50 active:scale-[0.98] disabled:opacity-50",
            "dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/70",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/35",
          )}
        >
          <Archive className={cn("shrink-0", iconGlyphSm)} strokeWidth={2} aria-hidden />
        </button>
        {icsMenuOpen ? (
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+0.35rem)] z-[70] w-[min(16rem,80vw)] overflow-hidden rounded-2xl border border-border/70 bg-popover p-2 text-popover-foreground shadow-xl"
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-muted/70 disabled:opacity-50"
              disabled={icsBusy !== null}
              onClick={() => {
                setIcsMenuOpen(false);
                void exportIcsCalendar();
              }}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#2563EB] dark:bg-blue-950/50 dark:text-blue-300">
                {icsBusy === "export" ? (
                  <Loader2 className={cn(iconGlyphSm, "animate-spin")} strokeWidth={2} />
                ) : (
                  <Download className={iconGlyphSm} strokeWidth={2} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-foreground">{messages.schedule.exportCalendar}</p>
                <p className="text-[11px] leading-tight text-muted-foreground">
                  {messages.schedule.exportCalendarHint}
                </p>
              </div>
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-muted/70 disabled:opacity-50"
              disabled={icsBusy !== null}
              onClick={() => {
                setIcsMenuOpen(false);
                icsImportInputRef.current?.click();
              }}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300">
                {icsBusy === "import" ? (
                  <Loader2 className={cn(iconGlyphSm, "animate-spin")} strokeWidth={2} />
                ) : (
                  <FileUp className={iconGlyphSm} strokeWidth={2} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-foreground">{messages.schedule.importEvents}</p>
                <p className="text-[11px] leading-tight text-muted-foreground">
                  {messages.schedule.importEventsHint}
                </p>
              </div>
            </button>
          </div>
        ) : null}
      </div>
      {initialCalendarCategories.length > 0 ? (
        <button
          type="button"
          aria-label={messages.schedule.manageCalendarsAria}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full border border-violet-200 bg-white text-violet-700 shadow-sm transition",
            iconBtnSm,
            "hover:bg-violet-50 active:scale-[0.98]",
            "dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-950/70",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/35",
          )}
          onClick={() => setCategoryManagerOpen(true)}
        >
          <Calendar className={cn("shrink-0", iconGlyphSm)} strokeWidth={2} aria-hidden />
        </button>
      ) : null}
      {!detailItem ? (
        <button
          type="button"
          onClick={handleAddToolbarClick}
          aria-label={
            adding ? messages.schedule.addToScheduleCloseAria : messages.schedule.addToScheduleOpenAria
          }
          aria-pressed={adding}
          title={adding ? messages.schedule.addToScheduleCloseTitle : undefined}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full border shadow-sm transition",
            iconBtnSm,
            "active:scale-[0.98]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            adding
              ? "border-[#2563EB]/60 bg-[#2563EB] text-white shadow-[0_1px_6px_rgba(37,99,235,0.28)] hover:bg-[#1D4ED8] dark:border-blue-400/50 dark:bg-blue-500 dark:hover:bg-blue-400"
              : "border-blue-200 bg-white text-[#2563EB] hover:bg-blue-50/90 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/70",
          )}
        >
          {adding ? (
            <X className={cn("shrink-0", iconGlyphSm)} strokeWidth={2.5} aria-hidden />
          ) : (
            <Plus className={cn("shrink-0", iconGlyphSm)} strokeWidth={2.25} aria-hidden />
          )}
        </button>
      ) : null}
    </>
  );

  const viewTabsOnChange = (next: ViewKind) => {
    if (next === "week") {
      setWeekHorizontalMode(
        isSameDay(selectedDate, now) && isWeekendDay(now) ? "include-anchor" : "workweek",
      );
    }
    setView(next);
  };

  return (
    <section className="pb-2">
      <div className="space-y-2.5">
      <ScheduleAddPanel
        selectedDate={selectedDate}
        open={adding}
        onClose={() => closeAddPanel({ refresh: false })}
        onSaved={() => {
          setDetailItem(null);
          closeAddPanel({ refresh: true });
        }}
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

      <div className="relative z-[5] space-y-1.5">
        <input
          ref={icsImportInputRef}
          type="file"
          accept=".ics,text/calendar"
          className="sr-only"
          tabIndex={-1}
          onChange={onIcsImportPicked}
        />
        <div className="flex flex-col gap-1">
          {useCompactHomeHeader && homeGreeting ? (
            <div className="flex min-w-0 items-start gap-x-2 sm:gap-x-3">
              <div className="min-w-0 flex-1">
                <HomeGreetingHeading
                  nickname={homeGreeting.nickname}
                  avatarUrl={homeGreeting.avatarUrl}
                  nowDate={now}
                />
                <div className="mt-0.5 -ml-1 pr-1 sm:-ml-1.5">
                  <ViewTabs
                    value={view}
                    onChange={viewTabsOnChange}
                    tabAlign="start"
                    scheduleSch={messages.schedule}
                  />
                </div>
              </div>
              <HomeCalendarVisual date={now} className="h-24 w-24 shrink-0 self-start" />
            </div>
          ) : (
            <div className="flex justify-center px-1">
              <ViewTabs
                value={view}
                onChange={viewTabsOnChange}
                tabAlign="center"
                scheduleSch={messages.schedule}
              />
            </div>
          )}

          {homeBelowHeaderSlot ? <div className="mt-2 min-w-0">{homeBelowHeaderSlot}</div> : null}
        </div>
      </div>
      </div>

      <div className="relative z-0 mt-1 space-y-1">
        <div className="relative z-[60]">
          <ScheduleDateNavToolbar
            view={view}
            selectedDate={selectedDate}
            locale={locale}
            onStepPrev={() => step(-1)}
            onStepNext={() => step(1)}
            onJumpToday={() => {
              setWeekHorizontalMode(isWeekendDay(now) ? "include-anchor" : "workweek");
              setSelectedDate(new Date(now));
            }}
            toolbarRight={toolbarActions}
            scheduleSch={messages.schedule}
          />
          {icsNotice ? (
            <p
              role="status"
              className={cn(
                "max-w-sm px-2 pt-0.5 text-center text-[11px] leading-snug",
                icsNotice.tone === "ok" ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
              )}
            >
              {icsNotice.message}
            </p>
          ) : null}
        </div>
        {view === "day" ? (
          <ScheduleDayTimeline
            items={dayItems}
            isToday={isSelectedToday}
            nowMinute={nowMinute}
            date={selectedDate}
            onCreateEvent={openEventDraft}
            onLongPressItem={(item) => {
              if (item.id === "__draft-preview__") return;
              openDetailFromTimelineItem(item, selectedDate);
            }}
          />
        ) : null}

        {view === "week" ? (
          <>
            <div ref={weekHomeLayoutRef} className="flex min-h-0 flex-col gap-1">
              <WeekCalendar
                {...weekCalendarProps}
                maxViewportBodyPx={weekHomeMaxViewportBodyPx ?? undefined}
              />
              <div
                ref={weekVisibleDaysBarRef}
                className="shrink-0 px-0.5"
              >
                <WeekVisibleDaysBar
                  value={visibleDayCount}
                  onChange={setVisibleDayCount}
                  scheduleSch={messages.schedule}
                  locale={locale}
                />
              </div>
            </div>
          </>
        ) : null}

        {view === "week" && !adding ? (
          <button
            type="button"
            aria-label={messages.schedule.shareScheduleOpenAria}
            onClick={() => void openScheduleShare()}
            disabled={scheduleShareBusy}
            className={cn(
              "fixed z-40 flex h-11 w-11 items-center justify-center rounded-full border border-sky-200 bg-white text-sky-700 shadow-[0_6px_20px_rgba(15,23,42,0.14)] transition",
              "bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-3",
              "hover:bg-sky-50 active:scale-[0.97]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300 dark:shadow-[0_6px_20px_rgba(0,0,0,0.35)] dark:hover:bg-sky-950/70",
              scheduleShareBusy && "pointer-events-none opacity-70",
            )}
          >
            {scheduleShareBusy ? (
              <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2} aria-hidden />
            ) : (
              <Share2 className="h-5 w-5" strokeWidth={2} aria-hidden />
            )}
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
              onLongPressItem={(item) => {
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
        deleting={deletingItem || recurringDeleteBusy}
        chatReturnTo="/home"
        listenForEscape={!(adding && Boolean(detailItem)) && !recurringDeleteDialog}
        onClose={() => setDetailItem(null)}
        onEdit={() => openEditSheetFromDetail(false)}
        onInvite={() => openEditSheetFromDetail(true)}
        onDelete={() => void deleteDetailItem()}
      />

      <AppPushLayer
        open={Boolean(recurringDeleteDialog)}
        onClose={dismissRecurringDeleteDialog}
        zClassName="z-[120]"
        ariaLabelledBy="recurring-delete-title"
        backdropClassName="bg-black/45 dark:bg-black/60 !backdrop-blur-none"
        panelClassName="w-[min(100vw,28rem)] border-0 bg-transparent shadow-none dark:shadow-none"
      >
        {recurringDeleteDialog ? (
          <div className="flex h-full min-h-0 flex-col justify-center p-4 sm:p-6">
            <div className="rounded-[24px] border border-[#E7E0D6] bg-white p-5 shadow-[0_16px_48px_rgba(15,23,42,0.14)] dark:border-border dark:bg-card dark:shadow-[0_16px_48px_rgba(0,0,0,0.45)]">
              <h2
                id="recurring-delete-title"
                className="text-base font-semibold leading-snug tracking-tight text-classmates-ink dark:text-foreground"
              >
                {messages.schedule.recurringDeleteDialogTitle}
              </h2>
              <p className="mt-3 text-[13px] leading-relaxed text-classmates-sub dark:text-zinc-400">
                {formatMessage(messages.schedule.recurringDeleteDialogBody, {
                  title: recurringDeleteDialog.title,
                })}
              </p>
              <div className="mt-6 flex flex-col gap-2">
                <button
                  type="button"
                  disabled={recurringDeleteBusy}
                  onClick={() => void applyRecurringDeleteScope("this")}
                  className={cn(
                    "inline-flex h-11 w-full items-center justify-center rounded-full border border-[#E7E0D6] bg-classmates-surface px-4 text-sm font-semibold text-classmates-ink transition hover:bg-classmates-warm-alt active:bg-classmates-warm-alt/80 disabled:opacity-50 dark:border-border dark:bg-muted/30 dark:text-foreground dark:hover:bg-muted/50",
                  )}
                >
                  {messages.schedule.recurringDeleteThisOccurrence}
                </button>
                <button
                  type="button"
                  disabled={recurringDeleteBusy}
                  onClick={() => void applyRecurringDeleteScope("future")}
                  className={cn(
                    "inline-flex h-11 w-full items-center justify-center rounded-full border border-[#E7E0D6] bg-classmates-surface px-4 text-sm font-semibold text-classmates-ink transition hover:bg-classmates-warm-alt active:bg-classmates-warm-alt/80 disabled:opacity-50 dark:border-border dark:bg-muted/30 dark:text-foreground dark:hover:bg-muted/50",
                  )}
                >
                  {messages.schedule.recurringDeleteAllFuture}
                </button>
                <button
                  type="button"
                  disabled={recurringDeleteBusy}
                  onClick={() => void applyRecurringDeleteScope("all")}
                  className={cn(
                    "inline-flex h-11 w-full items-center justify-center rounded-full border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 shadow-sm transition hover:bg-red-100 active:bg-red-100/90 disabled:opacity-50 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/60",
                  )}
                >
                  {messages.schedule.recurringDeleteEntireSeries}
                </button>
                <button
                  type="button"
                  disabled={recurringDeleteBusy}
                  onClick={dismissRecurringDeleteDialog}
                  className="inline-flex h-11 w-full items-center justify-center rounded-full border border-transparent px-4 text-sm font-semibold text-muted-foreground transition hover:text-foreground disabled:opacity-50"
                >
                  {messages.common.cancel}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </AppPushLayer>
    </section>
  );
}

function viewTabLabel(kind: ViewKind, sch: AppMessages["schedule"]) {
  if (kind === "day") return sch.viewTabDay;
  if (kind === "week") return sch.viewTabWeek;
  return sch.viewTabMonth;
}

function ViewTabs({
  value,
  onChange,
  tabAlign = "center",
  scheduleSch,
}: {
  value: ViewKind;
  onChange: (next: ViewKind) => void;
  tabAlign?: "center" | "start";
  scheduleSch: AppMessages["schedule"];
}) {
  const tabs: ViewKind[] = ["day", "week", "month"];
  return (
    <div
      role="tablist"
      aria-label={scheduleSch.viewTablistAria}
      className={cn(
        "flex w-full max-w-[16.5rem] shrink-0 rounded-full border border-blue-200/90 bg-blue-50/90 p-[3px] sm:max-w-[17.5rem] mt-2 mb-2",
        "dark:border-blue-800/55 dark:bg-blue-950/45",
        tabAlign === "center" && "mx-auto",
        tabAlign === "start" && "mr-auto",
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
              "min-h-7 min-w-0 flex-1 rounded-full px-2 py-0.5 text-center text-xs capitalize leading-tight transition sm:min-h-8 sm:px-2.5 sm:py-1 sm:text-[13px]",
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
            {viewTabLabel(t, scheduleSch)}
          </button>
        );
      })}
    </div>
  );
}

function ScheduleDateNavToolbar({
  view,
  selectedDate,
  locale,
  onStepPrev,
  onStepNext,
  onJumpToday,
  toolbarRight,
  scheduleSch,
}: {
  view: ViewKind;
  selectedDate: Date;
  locale: AppLocale;
  onStepPrev: () => void;
  onStepNext: () => void;
  onJumpToday: () => void;
  toolbarRight: ReactNode;
  scheduleSch: AppMessages["schedule"];
}) {
  /** Shared chrome for prev / Today / next — distinct from ViewTabs’ filled segment. */
  const dateNavControlClass = cn(
    "border border-[#2563EB]/55 bg-white text-[#1D4ED8] shadow-sm transition",
    "hover:bg-blue-50/90 hover:border-[#2563EB]/80 active:scale-95",
    "dark:border-blue-500/60 dark:bg-card dark:text-blue-300 dark:hover:bg-blue-950/40",
  );

  return (
    <div
      className={cn(
        "grid min-w-0 items-center gap-x-1.5 gap-y-0 sm:gap-x-2",
        /** One horizontal band on phone + desktop: month/week | prev·Today·next | actions */
        "grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]",
      )}
    >
      <div className="min-w-0 justify-self-start pr-0.5 sm:pr-1">
        <h2 className="truncate text-base font-bold leading-tight text-[#111827] dark:text-foreground">
          {calendarRangeTitle(view, selectedDate, locale)}
        </h2>
      </div>

      <div className="flex min-w-0 justify-center justify-self-center">
        <div className="flex items-center gap-0.5 sm:gap-1">
          <button
            type="button"
            onClick={onStepPrev}
            aria-label={scheduleSch.prevDateAria}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
              dateNavControlClass,
            )}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          </button>
          <button
            type="button"
            onClick={onJumpToday}
            aria-label={scheduleSch.jumpToTodayAria}
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1.5 text-[12px] font-semibold leading-none sm:px-3.5 sm:text-[13px]",
              dateNavControlClass,
            )}
          >
            {scheduleSch.today}
          </button>
          <button
            type="button"
            onClick={onStepNext}
            aria-label={scheduleSch.nextDateAria}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
              dateNavControlClass,
            )}
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          </button>
        </div>
      </div>

      <div className="flex min-w-0 shrink-0 items-center justify-end justify-self-end gap-1.5 pl-0.5 sm:pl-1">
        {toolbarRight}
      </div>
    </div>
  );
}

/**
 * Human-readable title for the current view (localized via `Intl`).
 * Week view matches prior behavior: single month+year when the week is
 * within one calendar month; otherwise a split month label.
 */
function calendarRangeTitle(view: ViewKind, date: Date, locale: AppLocale): string {
  const ws = startOfWeek(date, { weekStartsOn: 1 });
  const we = endOfWeek(date, { weekStartsOn: 1 });

  if (view === "day") {
    return new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric" }).format(date);
  }
  if (view === "month") {
    return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(date);
  }
  if (isSameMonth(ws, we)) {
    return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(ws);
  }
  if (isSameYear(ws, we)) {
    const left = new Intl.DateTimeFormat(locale, { month: "short" }).format(ws);
    const right = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(we);
    return `${left} / ${right}`;
  }
  const left = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(ws);
  const right = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(we);
  return `${left} / ${right}`;
}

function WeekVisibleDaysBar({
  value,
  onChange,
  scheduleSch,
  locale,
}: {
  value: number;
  onChange: (next: number) => void;
  scheduleSch: AppMessages["schedule"];
  locale: AppLocale;
}) {
  const safeValue = clampWeekCalendarVisibleDayCount(value);
  const valueTemplate =
    scheduleSch.visibleDaysValue ?? (locale === "zh-CN" ? "{count} 天" : "{count} days");
  const valueText = formatMessage(valueTemplate, { count: safeValue });
  const thumbRatio =
    (safeValue - WEEK_CALENDAR_VISIBLE_DAY_MIN) /
    (WEEK_CALENDAR_VISIBLE_DAY_MAX - WEEK_CALENDAR_VISIBLE_DAY_MIN);
  return (
    <div
      className={cn(
        "shrink-0 rounded-xl border border-[#E7E0D6] bg-white px-2 py-1.5 shadow-[0_2px_8px_rgba(15,23,42,0.03)]",
        "dark:border-border dark:bg-card dark:shadow-[0_2px_8px_rgba(0,0,0,0.1)]",
      )}
    >
      <div className="relative h-9 px-[2.125rem]">
        <div
          className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-blue-100 dark:bg-blue-950/40"
          aria-hidden
        />
        <div className="relative h-full w-full">
          <input
          type="range"
          min={WEEK_CALENDAR_VISIBLE_DAY_MIN}
          max={WEEK_CALENDAR_VISIBLE_DAY_MAX}
          step={1}
          value={safeValue}
          aria-label={
            scheduleSch.visibleDaysAria ??
            (locale === "zh-CN" ? "周视图显示天数" : "Visible days in week calendar")
          }
          aria-valuetext={valueText}
          onChange={(event) => {
            onChange(clampWeekCalendarVisibleDayCount(Number(event.target.value)));
          }}
          className={cn(
              "absolute inset-0 z-20 m-0 h-full w-full cursor-grab touch-none appearance-none bg-transparent",
              "active:cursor-grabbing",
              "[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full",
              "[&::-webkit-slider-runnable-track]:bg-transparent",
              "[&::-webkit-slider-thumb]:appearance-none",
              "[&::-webkit-slider-thumb]:h-9 [&::-webkit-slider-thumb]:w-[4.25rem]",
              "[&::-webkit-slider-thumb]:-mt-[calc(1.125rem-0.1875rem)]",
              "[&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:opacity-0",
              "[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full",
              "[&::-moz-range-track]:bg-transparent",
              "[&::-moz-range-thumb]:h-9 [&::-moz-range-thumb]:w-[4.25rem]",
              "[&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:opacity-0",
            )}
          />
          <div
            className="pointer-events-none absolute top-1/2 z-10 -translate-y-1/2"
            style={{ left: `${thumbRatio * 100}%` }}
            aria-hidden
          >
            <span
              className={cn(
                "inline-flex w-[4.25rem] -translate-x-1/2 items-center justify-center",
                "rounded-md bg-[#2563EB] px-2 py-1.5 text-[11px] font-semibold leading-none text-white tabular-nums",
                "shadow-[0_2px_8px_rgba(37,99,235,0.35)]",
                "dark:bg-blue-500",
              )}
            >
              {valueText}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
