"use client";

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
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { WeekCalendar } from "@/components/calendar/week-calendar";
import { ScheduleAddPanel } from "@/components/home/schedule-add-panel";
import {
  ScheduleItemDetailSheet,
  type ScheduleDetailItem,
} from "@/components/home/schedule-item-detail-sheet";
import {
  ScheduleDayTimeline,
  type DayTimelineItem,
} from "@/components/home/schedule-day-timeline";
import { ScheduleMonthView } from "@/components/home/schedule-month-view";
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
  nowISO,
  semesterStartISO,
  semesterEndISO,
}: {
  classBlocks: ClassBlock[];
  studyEntries: StudyEntry[];
  companionOptions: CompanionOption[];
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
    const serverNow = new Date(nowISO);
    setNow(serverNow);
  }, [nowISO]);

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
      }));
    return [...classItems, ...studyItems].sort(
      (a, b) => a.startMinute - b.startMinute,
    );
  };

  const dayItems = itemsForDate(selectedDate);

  const openEventDraft = (start: Date, end: Date) => {
    resetAddDraft();
    setDraftEventStart(format(start, "yyyy-MM-dd'T'HH:mm"));
    setDraftEventEnd(format(end, "yyyy-MM-dd'T'HH:mm"));
    setSelectedDate(start);
    setDetailItem(null);
    setAdding(true);
  };

  const openDetailFromTimelineItem = (item: DayTimelineItem, date: Date) => {
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
    });
  };

  // Week view: classes repeat every week, so we can show them on any
  // anchor week. Study entries need to be filtered to that week and
  // injected as "study"-kind blocks.
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
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
    return [...courseBlocks, ...studyBlocks];
  }, [classBlocks, studies, weekStart, weekEnd, semesterStart, semesterEnd]);

  async function deleteDetailItem() {
    if (!detailItem || detailItem.source !== "calendar") return;
    if (!window.confirm("Delete this schedule item?")) return;
    setDeletingItem(true);
    const response = await fetch(`/api/calendar/events/${detailItem.id}`, { method: "DELETE" });
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
      return (
        classDensity + (studyCountByDateKey.get(dateKey(d)) ?? 0)
      );
    };
  }, [classBlocks, studies, semesterStart, semesterEnd]);

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

  const isSelectedToday = isSameDay(selectedDate, now);
  const nowMinute = now.getHours() * 60 + now.getMinutes();

  return (
    <section className="space-y-2.5">
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
        companionOptions={companionOptions}
      />

      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
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
        {!adding && !detailItem ? (
          <ScheduleToolbarAddButton onClick={toggleAddPanel} />
        ) : null}
      </div>

      <div className="grid grid-cols-[1fr_auto] items-center gap-2">
        <div className="truncate text-[13px] font-semibold tabular-nums">
          {rangeLabel(view, selectedDate)}
        </div>
        <div className="inline-flex items-center gap-0.5">
          <IconStepButton direction="prev" onClick={() => step(-1)} />
          <TodayJumpButton
            onClick={() => {
              setWeekHorizontalMode(isWeekendDay(now) ? "include-anchor" : "workweek");
              setSelectedDate(new Date(now));
            }}
          />
          <IconStepButton direction="next" onClick={() => step(1)} />
        </div>
      </div>

      {view === "day" ? (
        <ScheduleDayTimeline
          items={dayItems}
          isToday={isSelectedToday}
          nowMinute={nowMinute}
          date={selectedDate}
          onCreateEvent={openEventDraft}
          onOpenItem={(item) => openDetailFromTimelineItem(item, selectedDate)}
        />
      ) : null}

      {view === "week" ? (
        <WeekCalendar
          blocks={weekBlocks}
          anchorWeekday={
            weekStart <= now && now <= weekEnd
              ? WEEKDAY_BY_JS[now.getDay()]
              : WEEKDAY_BY_JS[selectedDate.getDay()]
          }
          horizontalMode={weekHorizontalMode}
          nowMinute={nowMinute}
          showNowLine={weekStart <= now && now <= weekEnd}
          weekStartDate={weekStart}
          today={now}
          onCreateEvent={openEventDraft}
          onOpenItem={(item, occurrenceDate) =>
            openDetailFromTimelineItem(
              {
                id: item.kind === "study" ? item.courseId.replace(/^study-/, "") : `${item.courseId}-${item.weekday}-${item.startMinute}`,
                kind: item.kind === "study" ? "study" : "class",
                source: item.source,
                startMinute: item.startMinute,
                endMinute: item.endMinute,
                title: item.courseCode ? `${item.courseCode} · ${item.courseName}` : item.courseName,
                location: item.location,
                withLabel: item.withLabel,
                note: item.note ?? null,
                repeatLabel: item.repeatLabel ?? "No",
                repeatRule: item.repeatRule ?? "NONE",
                repeatUntilISO: item.repeatUntilISO ?? null,
                eventParticipants: item.eventParticipants ?? [],
                courseId: item.source === "course" ? item.courseId : null,
              },
              occurrenceDate,
            )
          }
        />
      ) : null}

      {view === "month" ? (
        <ScheduleMonthView
          anchorDate={selectedDate}
          selectedDate={selectedDate}
          today={now}
          getDensityForDate={monthDensity}
          onSelectDate={(d) => {
            setSelectedDate(d);
            setView("day"); // tapping a cell drops into Day detail
          }}
        />
      ) : null}

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
    </section>
  );
}

/** Sits in the schedule toolbar so it does not cover the PWA install prompt above the tab bar. */
function ScheduleToolbarAddButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Add to schedule"
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-background px-3 text-foreground shadow-sm transition hover:bg-muted/30"
    >
      <Plus className="h-4 w-4" strokeWidth={2.25} />
      <span className="text-[12px] font-semibold">Add</span>
    </button>
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
      className="inline-flex w-full max-w-[14.5rem] rounded-full border border-border bg-muted/40 p-0.5 text-[12px] font-medium sm:max-w-[16rem]"
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
              "flex-1 rounded-full px-3 py-1.5 capitalize transition",
              active
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}

function IconStepButton({
  direction,
  onClick,
}: {
  direction: "prev" | "next";
  onClick: () => void;
}) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === "prev" ? "Previous" : "Next"}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
    >
      <Icon className="h-4 w-4" strokeWidth={2.25} />
    </button>
  );
}

function TodayJumpButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Jump to today"
      className="inline-flex h-7 items-center rounded-full px-2 text-[12px] font-medium text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
    >
      <span>Today</span>
    </button>
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
