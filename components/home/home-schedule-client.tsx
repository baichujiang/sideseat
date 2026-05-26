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
import { useLocaleContext } from "@/components/i18n/locale-provider";

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

const HOME_SCHEDULE_STORAGE_VERSION = 1;
const HOME_SCHEDULE_STORAGE_PREFIX = "sideseat:homeSchedule:v1:";

type HomeScheduleStorageRecord = HomeScheduleCache & {
  version: typeof HOME_SCHEDULE_STORAGE_VERSION;
};

function homeScheduleStorageKey(userId: string): string | null {
  if (!userId.trim()) return null;
  return `${HOME_SCHEDULE_STORAGE_PREFIX}${encodeURIComponent(userId)}`;
}

function isBrowserOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

function sanitizeCategoriesForStorage(categories: CalendarCategoryLite[]): CalendarCategoryLite[] {
  return categories.map((category) => ({
    ...category,
    // Feed URLs can be sensitive; offline render only needs category identity/color.
    icsSubscriptionUrl: null,
  }));
}

function isHomeScheduleStorageRecord(value: unknown, userId: string): value is HomeScheduleStorageRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<HomeScheduleStorageRecord>;
  return (
    record.version === HOME_SCHEDULE_STORAGE_VERSION &&
    record.userId === userId &&
    Array.isArray(record.classBlocks) &&
    Array.isArray(record.dbStudyEntries) &&
    Array.isArray(record.icsStudyEntries) &&
    Array.isArray(record.companionOptions) &&
    Array.isArray(record.initialCalendarCategories) &&
    typeof record.loadedRangeStartMs === "number" &&
    typeof record.loadedRangeEndMs === "number" &&
    Number.isFinite(record.loadedRangeStartMs) &&
    Number.isFinite(record.loadedRangeEndMs) &&
    record.loadedRangeEndMs >= record.loadedRangeStartMs &&
    typeof record.fetchedAt === "number" &&
    Number.isFinite(record.fetchedAt)
  );
}

function readPersistentHomeScheduleCache(userId: string): HomeScheduleCache | null {
  if (typeof window === "undefined") return null;
  const key = homeScheduleStorageKey(userId);
  if (!key) return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isHomeScheduleStorageRecord(parsed, userId)) return null;
    const { version: _version, ...cache } = parsed;
    return cache;
  } catch {
    return null;
  }
}

function writePersistentHomeScheduleCache(cache: HomeScheduleCache) {
  if (typeof window === "undefined") return;
  if (cache.loadedRangeStartMs <= 0 || cache.loadedRangeEndMs <= 0) return;
  const key = homeScheduleStorageKey(cache.userId);
  if (!key) return;

  try {
    const record: HomeScheduleStorageRecord = {
      ...cache,
      version: HOME_SCHEDULE_STORAGE_VERSION,
      initialCalendarCategories: sanitizeCategoriesForStorage(cache.initialCalendarCategories),
    };
    window.localStorage.setItem(key, JSON.stringify(record));
  } catch {
    // Storage can be unavailable or full; the in-memory Home cache still works.
  }
}

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
  initialPayload,
  initialWindowStartISO,
  initialWindowEndISO,
  homeGreeting,
  naturalScheduleEnabled = false,
}: {
  userId: string;
  nowISO: string;
  semesterStartISO: string;
  semesterEndISO: string;
  initialPayload?: HomeSchedulePayload;
  initialWindowStartISO?: string;
  initialWindowEndISO?: string;
  homeGreeting?: {
    nickname: string | null;
    avatarUrl: string | null;
    guestReturnTo?: string;
  } | null;
  naturalScheduleEnabled?: boolean;
}) {
  const { messages } = useLocaleContext();
  const nowRef = useRef(new Date(nowISO));
  const { fullScrollRangeStart, fullScrollRangeEnd } = useMemo(
    () => ({
      fullScrollRangeStart: subDays(nowRef.current, HOME_CALENDAR_DATA_WINDOW_PAST_DAYS),
      fullScrollRangeEnd: addDays(nowRef.current, HOME_CALENDAR_DATA_WINDOW_FUTURE_DAYS),
    }),
    [],
  );

  const cached =
    homeScheduleModuleCache?.userId === userId ? homeScheduleModuleCache : null;
  const initialScheduleCache = useMemo<HomeScheduleCache | null>(() => {
    if (!initialPayload || !initialWindowStartISO || !initialWindowEndISO) return null;
    const loadedRangeStartMs = new Date(initialWindowStartISO).getTime();
    const loadedRangeEndMs = new Date(initialWindowEndISO).getTime();
    if (
      !Number.isFinite(loadedRangeStartMs) ||
      !Number.isFinite(loadedRangeEndMs) ||
      loadedRangeEndMs < loadedRangeStartMs
    ) {
      return null;
    }

    return {
      userId,
      classBlocks: initialPayload.classBlocks,
      dbStudyEntries: initialPayload.studyEntries,
      icsStudyEntries: [],
      companionOptions: initialPayload.companionOptions,
      initialCalendarCategories: initialPayload.initialCalendarCategories,
      loadedRangeStartMs,
      loadedRangeEndMs,
      fetchedAt: Date.now(),
    };
  }, [initialPayload, initialWindowEndISO, initialWindowStartISO, userId]);
  const bootCache = cached ?? initialScheduleCache;

  const [classBlocks, setClassBlocks] = useState<ClassBlock[]>(() => bootCache?.classBlocks ?? []);
  const [dbStudyEntries, setDbStudyEntries] = useState<StudyEntry[]>(
    () => bootCache?.dbStudyEntries ?? [],
  );
  const [icsStudyEntries, setIcsStudyEntries] = useState<StudyEntry[]>(
    () => bootCache?.icsStudyEntries ?? [],
  );
  const [companionOptions, setCompanionOptions] = useState<CompanionOption[]>(
    () => bootCache?.companionOptions ?? [],
  );
  const [initialCalendarCategories, setInitialCalendarCategories] = useState<CalendarCategoryLite[]>(
    () => bootCache?.initialCalendarCategories ?? [],
  );
  const [loadedRangeStartMs, setLoadedRangeStartMs] = useState<number | null>(
    () => bootCache?.loadedRangeStartMs ?? null,
  );
  const [loadedRangeEndMs, setLoadedRangeEndMs] = useState<number | null>(
    () => bootCache?.loadedRangeEndMs ?? null,
  );
  const [activeOnlineRefreshes, setActiveOnlineRefreshes] = useState(0);

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
  const inFlightIcsWindowsRef = useRef<Set<string>>(new Set());
  const lastVirtualFetchWindowKeyRef = useRef<string | null>(null);

  const beginOnlineRefresh = useCallback(() => {
    setActiveOnlineRefreshes((count) => count + 1);
    return () => {
      setActiveOnlineRefreshes((count) => Math.max(0, count - 1));
    };
  }, []);

  const applyScheduleCache = useCallback((cache: HomeScheduleCache) => {
    const nextState = {
      classBlocks: cache.classBlocks,
      dbStudyEntries: cache.dbStudyEntries,
      icsStudyEntries: cache.icsStudyEntries,
      companionOptions: cache.companionOptions,
      initialCalendarCategories: cache.initialCalendarCategories,
      loadedRangeStartMs: cache.loadedRangeStartMs,
      loadedRangeEndMs: cache.loadedRangeEndMs,
    };
    stateRef.current = nextState;
    homeScheduleModuleCache = cache;
    setClassBlocks(nextState.classBlocks);
    setDbStudyEntries(nextState.dbStudyEntries);
    setIcsStudyEntries(nextState.icsStudyEntries);
    setCompanionOptions(nextState.companionOptions);
    setInitialCalendarCategories(nextState.initialCalendarCategories);
    setLoadedRangeStartMs(nextState.loadedRangeStartMs);
    setLoadedRangeEndMs(nextState.loadedRangeEndMs);
  }, []);

  const restorePersistentScheduleCache = useCallback(
    () => {
      const stored = readPersistentHomeScheduleCache(userId);
      const currentModule =
        homeScheduleModuleCache?.userId === userId ? homeScheduleModuleCache : null;

      if (!stored) {
        return Boolean(
          currentModule &&
          stateRef.current.loadedRangeStartMs != null &&
          stateRef.current.loadedRangeEndMs != null
        );
      }

      if (!currentModule || stored.fetchedAt > currentModule.fetchedAt) {
        applyScheduleCache(stored);
      }
      return true;
    },
    [applyScheduleCache, userId],
  );

  const markCachedFallback = useCallback(() => {
    restorePersistentScheduleCache();
  }, [restorePersistentScheduleCache]);

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
      writePersistentHomeScheduleCache(homeScheduleModuleCache);
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

      if (!isBrowserOnline()) {
        markCachedFallback();
        return;
      }

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
      const endOnlineRefresh = beginOnlineRefresh();

      try {
        const res = await apiFetch(scheduleFetchUrl(clampedStart, clampedEnd));
        const json = (await res.json()) as {
          success?: boolean;
          data?: HomeSchedulePayload;
        };
        if (!res.ok || !json.success || !json.data) {
          markCachedFallback();
          return;
        }

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
      } catch {
        markCachedFallback();
      } finally {
        inFlightWindowsRef.current.delete(flightKey);
        endOnlineRefresh();
      }
    },
    [beginOnlineRefresh, fullScrollRangeEnd, fullScrollRangeStart, markCachedFallback, userId, writeModuleCache],
  );

  const fetchIcsWindow = useCallback(
    async (windowStart: Date, windowEnd: Date, mergeEntries = true) => {
      const clampedStart = windowStart < fullScrollRangeStart ? fullScrollRangeStart : windowStart;
      const clampedEnd = windowEnd > fullScrollRangeEnd ? fullScrollRangeEnd : windowEnd;
      if (clampedStart > clampedEnd) return;
      if (!isBrowserOnline()) return;
      const flightKey = `${clampedStart.toISOString()}|${clampedEnd.toISOString()}`;
      if (inFlightIcsWindowsRef.current.has(flightKey)) return;
      inFlightIcsWindowsRef.current.add(flightKey);
      const endOnlineRefresh = beginOnlineRefresh();

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
      } finally {
        inFlightIcsWindowsRef.current.delete(flightKey);
        endOnlineRefresh();
      }
    },
    [beginOnlineRefresh, fullScrollRangeEnd, fullScrollRangeStart, userId, writeModuleCache],
  );

  const revalidateSchedule = useCallback(() => {
    if (!isBrowserOnline()) {
      markCachedFallback();
      return;
    }
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
  }, [fetchIcsWindow, fetchScheduleWindow, markCachedFallback]);

  useEffect(() => {
    const handleOnline = () => {
      revalidateSchedule();
    };
    const handleOffline = () => {
      restorePersistentScheduleCache();
    };

    if (!isBrowserOnline()) restorePersistentScheduleCache();
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [restorePersistentScheduleCache, revalidateSchedule]);

  useEffect(() => {
    const initialStart = subDays(nowRef.current, HOME_SCHEDULE_INITIAL_WINDOW_PAST_DAYS);
    const initialEnd = addDays(nowRef.current, HOME_SCHEDULE_INITIAL_WINDOW_FUTURE_DAYS);
    const hadModuleCache = cached != null;
    const hadInitialCache = initialScheduleCache != null;
    if (hadInitialCache && !hadModuleCache) {
      homeScheduleModuleCache = initialScheduleCache;
      writePersistentHomeScheduleCache(initialScheduleCache);
    }
    const restoredPersistentCache =
      hadModuleCache || hadInitialCache ? false : restorePersistentScheduleCache();
    const hadCache = hadModuleCache || hadInitialCache || restoredPersistentCache;

    if (!isBrowserOnline()) {
      return;
    }

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
      const fetchWindowKey = `${needStart.toISOString()}|${needEnd.toISOString()}`;
      if (lastVirtualFetchWindowKeyRef.current === fetchWindowKey) return;
      lastVirtualFetchWindowKeyRef.current = fetchWindowKey;
      void fetchScheduleWindow(needStart, needEnd, { mergeEntries: true });
      void fetchIcsWindow(needStart, needEnd);
    },
    [fetchIcsWindow, fetchScheduleWindow],
  );

  const studyEntries = useMemo(
    () => mergeStudyEntries(dbStudyEntries, icsStudyEntries),
    [dbStudyEntries, icsStudyEntries],
  );

  const isUpdatingSchedule = activeOnlineRefreshes > 0;
  const scheduleUpdateSlot = isUpdatingSchedule ? (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none"
    >
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border/55 bg-background/85 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur-md dark:bg-card/85">
        <span className="relative flex h-2 w-2" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#2563EB]/35" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#2563EB]/75" />
        </span>
        <span>
          {messages.home.updatingSchedule}
        </span>
      </span>
    </div>
  ) : null;

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
        homeCalendarStatusSlot={scheduleUpdateSlot}
        naturalScheduleEnabled={naturalScheduleEnabled}
        onScheduleRefresh={revalidateSchedule}
        onVirtualStripBoundsChange={handleVirtualStripBoundsChange}
      />
    </div>
  );
}
