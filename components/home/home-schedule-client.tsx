"use client";

import { addDays, subDays } from "date-fns";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ScheduleSurface,
  type CalendarCategoryLite,
  type ClassBlock,
  type CompanionOption,
  type StudyEntry,
} from "@/components/home/schedule-surface";
import { apiFetch } from "@/lib/auth/api-fetch";
import {
  HOME_CALENDAR_DATA_WINDOW_FUTURE_DAYS,
  HOME_CALENDAR_DATA_WINDOW_PAST_DAYS,
  WEEK_CALENDAR_VIRTUAL_EXTEND_CHUNK_DAYS,
} from "@/lib/calendar/week-calendar-virtual-strip";
import {
  HOME_SCHEDULE_INITIAL_WINDOW_FUTURE_DAYS,
  HOME_SCHEDULE_INITIAL_WINDOW_PAST_DAYS,
} from "@/lib/home/home-schedule-constants";
import type { HomeSchedulePayload } from "@/lib/home/load-home-schedule-payload";

type HomeScheduleCache = {
  userId: string;
  classBlocks: ClassBlock[];
  dbStudyEntries: StudyEntry[];
  icsStudyEntries: StudyEntry[];
  companionOptions: CompanionOption[];
  initialCalendarCategories: CalendarCategoryLite[];
  loadedRangeStartMs: number;
  loadedRangeEndMs: number;
  fetchedAt: number;
};

let homeScheduleModuleCache: HomeScheduleCache | null = null;

function mergeStudyEntries(existing: StudyEntry[], incoming: StudyEntry[]): StudyEntry[] {
  const byId = new Map(existing.map((entry) => [entry.id, entry]));
  for (const entry of incoming) {
    byId.set(entry.id, entry);
  }
  return Array.from(byId.values()).sort((a, b) => a.startISO.localeCompare(b.startISO));
}

function scheduleFetchUrl(windowStart: Date, windowEnd: Date): string {
  const params = new URLSearchParams({
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
  });
  return `/api/home/schedule?${params.toString()}`;
}

function icsFetchUrl(windowStart: Date, windowEnd: Date): string {
  const params = new URLSearchParams({
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
  });
  return `/api/home/schedule/ics-subscriptions?${params.toString()}`;
}

function rangeCovers(loadedStartMs: number, loadedEndMs: number, needStart: Date, needEnd: Date): boolean {
  return loadedStartMs <= needStart.getTime() && loadedEndMs >= needEnd.getTime();
}

export function HomeScheduleClient({
  userId,
  nowISO,
  semesterStartISO,
  semesterEndISO,
  homeGreeting,
  naturalScheduleEnabled = false,
}: {
  userId: string;
  nowISO: string;
  semesterStartISO: string;
  semesterEndISO: string;
  homeGreeting?: {
    nickname: string | null;
    avatarUrl: string | null;
    guestReturnTo?: string;
  } | null;
  naturalScheduleEnabled?: boolean;
}) {
  const nowRef = useRef(new Date(nowISO));
  const fullScrollRangeStart = subDays(nowRef.current, HOME_CALENDAR_DATA_WINDOW_PAST_DAYS);
  const fullScrollRangeEnd = addDays(nowRef.current, HOME_CALENDAR_DATA_WINDOW_FUTURE_DAYS);

  const cached =
    homeScheduleModuleCache?.userId === userId ? homeScheduleModuleCache : null;

  const [classBlocks, setClassBlocks] = useState<ClassBlock[]>(() => cached?.classBlocks ?? []);
  const [dbStudyEntries, setDbStudyEntries] = useState<StudyEntry[]>(
    () => cached?.dbStudyEntries ?? [],
  );
  const [icsStudyEntries, setIcsStudyEntries] = useState<StudyEntry[]>(
    () => cached?.icsStudyEntries ?? [],
  );
  const [companionOptions, setCompanionOptions] = useState<CompanionOption[]>(
    () => cached?.companionOptions ?? [],
  );
  const [initialCalendarCategories, setInitialCalendarCategories] = useState<CalendarCategoryLite[]>(
    () => cached?.initialCalendarCategories ?? [],
  );
  const [loadedRangeStartMs, setLoadedRangeStartMs] = useState<number | null>(
    () => cached?.loadedRangeStartMs ?? null,
  );
  const [loadedRangeEndMs, setLoadedRangeEndMs] = useState<number | null>(
    () => cached?.loadedRangeEndMs ?? null,
  );

  const stateRef = useRef({
    classBlocks,
    dbStudyEntries,
    icsStudyEntries,
    companionOptions,
    initialCalendarCategories,
    loadedRangeStartMs,
    loadedRangeEndMs,
  });
  stateRef.current = {
    classBlocks,
    dbStudyEntries,
    icsStudyEntries,
    companionOptions,
    initialCalendarCategories,
    loadedRangeStartMs,
    loadedRangeEndMs,
  };

  const inFlightWindowsRef = useRef<Set<string>>(new Set());

  const writeModuleCache = useCallback(
    (patch: Partial<HomeScheduleCache> & { userId: string }) => {
      const prev = homeScheduleModuleCache?.userId === userId ? homeScheduleModuleCache : null;
      homeScheduleModuleCache = {
        userId,
        classBlocks: patch.classBlocks ?? prev?.classBlocks ?? [],
        dbStudyEntries: patch.dbStudyEntries ?? prev?.dbStudyEntries ?? [],
        icsStudyEntries: patch.icsStudyEntries ?? prev?.icsStudyEntries ?? [],
        companionOptions: patch.companionOptions ?? prev?.companionOptions ?? [],
        initialCalendarCategories:
          patch.initialCalendarCategories ?? prev?.initialCalendarCategories ?? [],
        loadedRangeStartMs: patch.loadedRangeStartMs ?? prev?.loadedRangeStartMs ?? 0,
        loadedRangeEndMs: patch.loadedRangeEndMs ?? prev?.loadedRangeEndMs ?? 0,
        fetchedAt: Date.now(),
      };
    },
    [userId],
  );

  const fetchScheduleWindow = useCallback(
    async (windowStart: Date, windowEnd: Date, options?: { mergeEntries?: boolean; force?: boolean }) => {
      const mergeEntries = options?.mergeEntries ?? false;
      const force = options?.force ?? false;
      const clampedStart = windowStart < fullScrollRangeStart ? fullScrollRangeStart : windowStart;
      const clampedEnd = windowEnd > fullScrollRangeEnd ? fullScrollRangeEnd : windowEnd;
      if (clampedStart > clampedEnd) return;

      const { loadedRangeStartMs: loadedStart, loadedRangeEndMs: loadedEnd } = stateRef.current;
      if (
        !force &&
        loadedStart != null &&
        loadedEnd != null &&
        rangeCovers(loadedStart, loadedEnd, clampedStart, clampedEnd)
      ) {
        return;
      }

      const flightKey = `${clampedStart.toISOString()}|${clampedEnd.toISOString()}`;
      if (inFlightWindowsRef.current.has(flightKey)) return;
      inFlightWindowsRef.current.add(flightKey);

      try {
        const res = await apiFetch(scheduleFetchUrl(clampedStart, clampedEnd));
        const json = (await res.json()) as {
          success?: boolean;
          data?: HomeSchedulePayload;
        };
        if (!res.ok || !json.success || !json.data) return;

        const payload = json.data;
        const prev = stateRef.current;
        const nextDbStudyEntries = mergeEntries
          ? mergeStudyEntries(prev.dbStudyEntries, payload.studyEntries)
          : payload.studyEntries;
        const nextStartMs =
          mergeEntries && prev.loadedRangeStartMs != null
            ? Math.min(prev.loadedRangeStartMs, clampedStart.getTime())
            : clampedStart.getTime();
        const nextEndMs =
          mergeEntries && prev.loadedRangeEndMs != null
            ? Math.max(prev.loadedRangeEndMs, clampedEnd.getTime())
            : clampedEnd.getTime();

        setClassBlocks(payload.classBlocks);
        setCompanionOptions(payload.companionOptions);
        setInitialCalendarCategories(payload.initialCalendarCategories);
        setDbStudyEntries(nextDbStudyEntries);
        setLoadedRangeStartMs(nextStartMs);
        setLoadedRangeEndMs(nextEndMs);

        writeModuleCache({
          userId,
          classBlocks: payload.classBlocks,
          dbStudyEntries: nextDbStudyEntries,
          companionOptions: payload.companionOptions,
          initialCalendarCategories: payload.initialCalendarCategories,
          loadedRangeStartMs: nextStartMs,
          loadedRangeEndMs: nextEndMs,
        });
      } finally {
        inFlightWindowsRef.current.delete(flightKey);
      }
    },
    [fullScrollRangeEnd, fullScrollRangeStart, userId, writeModuleCache],
  );

  const fetchIcsWindow = useCallback(
    async (windowStart: Date, windowEnd: Date, mergeEntries = true) => {
      const clampedStart = windowStart < fullScrollRangeStart ? fullScrollRangeStart : windowStart;
      const clampedEnd = windowEnd > fullScrollRangeEnd ? fullScrollRangeEnd : windowEnd;
      if (clampedStart > clampedEnd) return;

      try {
        const res = await apiFetch(icsFetchUrl(clampedStart, clampedEnd));
        const json = (await res.json()) as {
          success?: boolean;
          data?: { studyEntries?: StudyEntry[] };
        };
        if (!res.ok || !json.success || !json.data?.studyEntries) return;

        const prev = stateRef.current;
        const nextIcsStudyEntries = mergeEntries
          ? mergeStudyEntries(prev.icsStudyEntries, json.data.studyEntries)
          : json.data.studyEntries;

        setIcsStudyEntries(nextIcsStudyEntries);
        writeModuleCache({ userId, icsStudyEntries: nextIcsStudyEntries });
      } catch {
        // ICS feeds are best-effort — keep DB entries visible.
      }
    },
    [fullScrollRangeEnd, fullScrollRangeStart, userId, writeModuleCache],
  );

  const revalidateSchedule = useCallback(() => {
    const { loadedRangeStartMs, loadedRangeEndMs } = stateRef.current;
    if (loadedRangeStartMs != null && loadedRangeEndMs != null) {
      void fetchScheduleWindow(new Date(loadedRangeStartMs), new Date(loadedRangeEndMs), {
        force: true,
        mergeEntries: false,
      });
      void fetchIcsWindow(new Date(loadedRangeStartMs), new Date(loadedRangeEndMs), false);
      return;
    }
    const start = subDays(nowRef.current, HOME_SCHEDULE_INITIAL_WINDOW_PAST_DAYS);
    const end = addDays(nowRef.current, HOME_SCHEDULE_INITIAL_WINDOW_FUTURE_DAYS);
    void fetchScheduleWindow(start, end, { force: true, mergeEntries: false });
    void fetchIcsWindow(start, end, false);
  }, [fetchIcsWindow, fetchScheduleWindow]);

  useEffect(() => {
    const initialStart = subDays(nowRef.current, HOME_SCHEDULE_INITIAL_WINDOW_PAST_DAYS);
    const initialEnd = addDays(nowRef.current, HOME_SCHEDULE_INITIAL_WINDOW_FUTURE_DAYS);
    const hadCache = cached != null;

    void fetchScheduleWindow(initialStart, initialEnd, {
      mergeEntries: hadCache,
      force: true,
    });

    const icsTimer = window.setTimeout(() => {
      void fetchIcsWindow(initialStart, initialEnd, hadCache);
    }, 0);

    const fullTimer = window.setTimeout(() => {
      void fetchScheduleWindow(fullScrollRangeStart, fullScrollRangeEnd, { mergeEntries: true });
      void fetchIcsWindow(fullScrollRangeStart, fullScrollRangeEnd);
    }, 100);

    return () => {
      window.clearTimeout(icsTimer);
      window.clearTimeout(fullTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only bootstrap
  }, []);

  const handleVirtualStripBoundsChange = useCallback(
    (bounds: { start: Date; end: Date }) => {
      const pad = WEEK_CALENDAR_VIRTUAL_EXTEND_CHUNK_DAYS;
      const needStart = subDays(bounds.start, pad);
      const needEnd = addDays(bounds.end, pad);
      void fetchScheduleWindow(needStart, needEnd, { mergeEntries: true });
      void fetchIcsWindow(needStart, needEnd);
    },
    [fetchIcsWindow, fetchScheduleWindow],
  );

  const studyEntries = useMemo(
    () => mergeStudyEntries(dbStudyEntries, icsStudyEntries),
    [dbStudyEntries, icsStudyEntries],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <ScheduleSurface
        classBlocks={classBlocks}
        studyEntries={studyEntries}
        companionOptions={companionOptions}
        initialCalendarCategories={initialCalendarCategories}
        nowISO={nowISO}
        semesterStartISO={semesterStartISO}
        semesterEndISO={semesterEndISO}
        homeGreeting={homeGreeting}
        homeBelowHeaderSlot={null}
        naturalScheduleEnabled={naturalScheduleEnabled}
        onScheduleRefresh={revalidateSchedule}
        onVirtualStripBoundsChange={handleVirtualStripBoundsChange}
      />
    </div>
  );
}
