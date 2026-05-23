import type { Weekday } from "@prisma/client";
import { toZonedTime } from "date-fns-tz";

import { TUM_NAT_API_BASE } from "@/lib/integrations/tum-course-catalog";

const BERLIN = "Europe/Berlin";

const JS_TO_WEEKDAY: Record<number, Weekday> = {
  0: "SUN",
  1: "MON",
  2: "TUE",
  3: "WED",
  4: "THU",
  5: "FRI",
  6: "SAT",
};

export type TumOfficialWeeklySlot = {
  weekday: Weekday;
  startMinute: number;
  endMinute: number;
  location: string | null;
};

export type TumOfficialScheduleVariant = {
  label: string;
  fingerprint: string;
  externalKey: string;
  sessions: TumOfficialWeeklySlot[];
};

type TumEventWire = {
  start?: string;
  end?: string;
  eventstatus?: { canceled?: boolean; confirmed?: boolean; active?: boolean } | null;
  room?: { room_short?: string | null } | null;
};

type TumGroupWire = {
  group_id?: number | null;
  group_title?: string | null;
  events?: TumEventWire[] | null;
};

export type TumCourseDetailWire = {
  course_id?: number;
  course_code?: string;
  course_name?: string;
  activity?: { activity_id?: string; activity_name?: string; activity_name_en?: string } | null;
  groups?: TumGroupWire[] | null;
};

type TumCatalogHitWire = {
  course_id: number;
  course_code: string;
  course_name?: string;
  course_name_en?: string;
  activity?: { activity_id?: string; activity_name?: string; activity_name_en?: string } | null;
};

/** SS 2026 → `2026s`, WS 2025/26 → `2025w`. Falls back to `lecture`. */
export function semesterLabelToTumNatKey(semesterLabel: string): string {
  const m = semesterLabel.trim().match(/^(SS|WS)\s+(\d{4})(?:\/(\d{2}))?$/i);
  if (!m) return "lecture";
  return `${m[2]}${m[1]!.toUpperCase() === "SS" ? "s" : "w"}`;
}

function minutesInBerlin(iso: string): number {
  const z = toZonedTime(new Date(iso), BERLIN);
  return z.getHours() * 60 + z.getMinutes();
}

function weekdayInBerlin(iso: string): Weekday {
  const z = toZonedTime(new Date(iso), BERLIN);
  return JS_TO_WEEKDAY[z.getDay()] ?? "MON";
}

/** Collapse dated TUM events into recurring weekly slots (≥2 occurrences). */
export function collapseTumEventsToWeeklySlots(events: TumEventWire[]): TumOfficialWeeklySlot[] {
  const counts = new Map<string, TumOfficialWeeklySlot & { n: number }>();

  for (const event of events) {
    if (!event.start || !event.end) continue;
    if (event.eventstatus?.canceled) continue;

    const weekday = weekdayInBerlin(event.start);
    const startMinute = minutesInBerlin(event.start);
    const endMinute = minutesInBerlin(event.end);
    if (endMinute <= startMinute) continue;

    const location = event.room?.room_short?.trim() || null;
    const key = `${weekday}:${startMinute}:${endMinute}:${location ?? ""}`;
    const existing = counts.get(key);
    if (existing) {
      existing.n += 1;
    } else {
      counts.set(key, { weekday, startMinute, endMinute, location, n: 1 });
    }
  }

  return [...counts.values()]
    .filter((row) => row.n >= 2)
    .map(({ weekday, startMinute, endMinute, location }) => ({
      weekday,
      startMinute,
      endMinute,
      location,
    }))
    .sort((a, b) => {
      const order = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
      const da = order.indexOf(a.weekday) - order.indexOf(b.weekday);
      if (da !== 0) return da;
      return a.startMinute - b.startMinute;
    });
}

function variantFingerprint(sessions: TumOfficialWeeklySlot[]): string {
  return sessions
    .map((s) => `${s.weekday} ${s.startMinute}-${s.endMinute}@${s.location ?? ""}`)
    .join(" | ");
}

export function variantsFromTumCourseDetail(
  detail: TumCourseDetailWire,
  hit?: TumCatalogHitWire,
): TumOfficialScheduleVariant[] {
  const activityLabel =
    hit?.activity?.activity_name_en?.trim() ||
    hit?.activity?.activity_name?.trim() ||
    detail.activity?.activity_name_en?.trim() ||
    detail.activity?.activity_name?.trim() ||
    "Class";

  const variants: TumOfficialScheduleVariant[] = [];
  const groups = detail.groups ?? [];

  for (const group of groups) {
    const sessions = collapseTumEventsToWeeklySlots(group.events ?? []);
    if (sessions.length === 0) continue;

    const groupTitle = group.group_title?.trim();
    const label = groupTitle ? `${activityLabel} · ${groupTitle}` : activityLabel;
    const externalKey = String(group.group_id ?? detail.course_id ?? hit?.course_id ?? label);
    const fingerprint = `tum:${externalKey}:${variantFingerprint(sessions)}`;

    variants.push({ label, fingerprint, externalKey, sessions });
  }

  return variants;
}

export async function fetchTumCourseDetail(courseId: number): Promise<TumCourseDetailWire> {
  const res = await fetch(`${TUM_NAT_API_BASE}/api/v1/course/${courseId}`);
  if (!res.ok) {
    throw new Error(`TUM course detail HTTP ${res.status} for ${courseId}`);
  }
  return (await res.json()) as TumCourseDetailWire;
}

/** Exam catalog (module codes like IN2064). */
export async function fetchTumExamCatalogHitsForCode(
  code: string,
  semesterKey: string,
): Promise<TumCatalogHitWire[]> {
  const normalized = code.trim().toUpperCase();
  const url =
    `${TUM_NAT_API_BASE}/api/v1/course/exam/${encodeURIComponent(semesterKey)}` +
    `?course_code_like=${encodeURIComponent(normalized)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`TUM exam catalog HTTP ${res.status} for ${normalized}`);
  }
  const rows = (await res.json()) as unknown;
  if (!Array.isArray(rows)) return [];
  return (rows as TumCatalogHitWire[]).filter(
    (row) => row.course_code?.trim().toUpperCase() === normalized,
  );
}

const MODULE_CODE_IN_NAME = /(?:\(|,|\s|^)([A-Z]{2}\d{3,7})(?=[,\s)\].]|$)/g;

function collectModuleCodesFromText(text: string): string[] {
  const codes = new Set<string>();
  for (const match of text.matchAll(MODULE_CODE_IN_NAME)) {
    codes.add(match[1]!.toUpperCase());
  }
  return [...codes];
}

function courseNameReferencesModuleCode(name: string, code: string): boolean {
  const upper = name.toUpperCase();
  const moduleCode = code.toUpperCase();
  return (
    upper.includes(`(${moduleCode}`) ||
    upper.includes(`${moduleCode},`) ||
    upper.includes(`${moduleCode})`) ||
    upper.includes(`${moduleCode} `) ||
    upper.endsWith(moduleCode)
  );
}

function normalizeCourseTitle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\([^)]*\)/g, "")
    .trim();
}

/** Paginated lecture catalog index keyed by module code mentions in titles. */
export class TumLectureCatalogIndex {
  private byModuleCode = new Map<string, TumCatalogHitWire[]>();
  private allHits: TumCatalogHitWire[] = [];
  private builtFor: string | null = null;

  async ensureBuilt(lectureSemesterKey = "lecture"): Promise<void> {
    if (this.builtFor === lectureSemesterKey) return;

    this.byModuleCode.clear();
    this.allHits = [];
    this.builtFor = lectureSemesterKey;

    let offset = 0;
    for (;;) {
      const url =
        `${TUM_NAT_API_BASE}/api/v1/course?semester_key=${encodeURIComponent(lectureSemesterKey)}` +
        `&limit=200&offset=${offset}&order_by=code&only_show_open_registration=false`;
      const res = await fetch(url);
      if (!res.ok) break;
      const body = (await res.json()) as {
        hits?: TumCatalogHitWire[];
        next_offset?: number | null;
      };

      for (const hit of body.hits ?? []) {
        this.allHits.push(hit);
        const text = `${hit.course_name ?? ""} ${hit.course_name_en ?? ""}`;
        for (const moduleCode of collectModuleCodesFromText(text)) {
          const bucket = this.byModuleCode.get(moduleCode);
          if (bucket) bucket.push(hit);
          else this.byModuleCode.set(moduleCode, [hit]);
        }
      }

      if (body.next_offset == null || (body.hits ?? []).length === 0) break;
      offset = body.next_offset;
    }
  }

  hitsForModuleCode(code: string): TumCatalogHitWire[] {
    return this.byModuleCode.get(code.trim().toUpperCase()) ?? [];
  }

  hitsForExamTitle(examTitle: string): TumCatalogHitWire[] {
    const target = normalizeCourseTitle(examTitle);
    if (target.length < 4) return [];
    return this.allHits.filter((hit) => {
      const name = normalizeCourseTitle(hit.course_name ?? hit.course_name_en ?? "");
      return name === target;
    });
  }

  reset(): void {
    this.byModuleCode.clear();
    this.allHits = [];
    this.builtFor = null;
  }
}

let sharedLectureIndex: TumLectureCatalogIndex | null = null;

export function getSharedTumLectureCatalogIndex(): TumLectureCatalogIndex {
  if (!sharedLectureIndex) sharedLectureIndex = new TumLectureCatalogIndex();
  return sharedLectureIndex;
}

export function resetSharedTumLectureCatalogIndex(): void {
  sharedLectureIndex?.reset();
  sharedLectureIndex = null;
}

/** Schedulable TUM activities (skip exam-only rows). */
export function isSchedulableTumActivity(activityId: string | undefined): boolean {
  if (!activityId) return true;
  return !new Set(["FA", "EX"]).has(activityId.toUpperCase());
}

function dedupeHits(hits: TumCatalogHitWire[]): TumCatalogHitWire[] {
  const seen = new Set<number>();
  const out: TumCatalogHitWire[] = [];
  for (const hit of hits) {
    if (seen.has(hit.course_id)) continue;
    seen.add(hit.course_id);
    out.push(hit);
  }
  return out;
}

export async function resolveTumLectureHitsForModuleCode(
  code: string,
  examHits: TumCatalogHitWire[],
  index: TumLectureCatalogIndex,
): Promise<TumCatalogHitWire[]> {
  await index.ensureBuilt("lecture");

  const normalized = code.trim().toUpperCase();
  const fromCode = index.hitsForModuleCode(normalized).filter((hit) =>
    courseNameReferencesModuleCode(
      `${hit.course_name ?? ""} ${hit.course_name_en ?? ""}`,
      normalized,
    ),
  );

  const fromTitle: TumCatalogHitWire[] = [];
  for (const examHit of examHits) {
    const title = examHit.course_name?.trim() || examHit.course_name_en?.trim();
    if (!title) continue;
    fromTitle.push(...index.hitsForExamTitle(title));
  }

  return dedupeHits([...fromCode, ...fromTitle]).filter((hit) =>
    isSchedulableTumActivity(hit.activity?.activity_id),
  );
}

export async function fetchOfficialVariantsForTumCode(
  code: string,
  semesterKey: string,
  options?: { lectureIndex?: TumLectureCatalogIndex },
): Promise<TumOfficialScheduleVariant[]> {
  const normalized = code.trim().toUpperCase();
  const examHits = await fetchTumExamCatalogHitsForCode(normalized, semesterKey);
  const index = options?.lectureIndex ?? getSharedTumLectureCatalogIndex();
  const lectureHits = await resolveTumLectureHitsForModuleCode(normalized, examHits, index);

  const candidateHits = dedupeHits([
    ...lectureHits,
    ...examHits.filter((hit) => isSchedulableTumActivity(hit.activity?.activity_id)),
  ]);

  const variants: TumOfficialScheduleVariant[] = [];
  const seenFingerprints = new Set<string>();

  for (const hit of candidateHits) {
    const detail = await fetchTumCourseDetail(hit.course_id);
    for (const variant of variantsFromTumCourseDetail(detail, hit)) {
      if (seenFingerprints.has(variant.fingerprint)) continue;
      seenFingerprints.add(variant.fingerprint);
      variants.push(variant);
    }
  }

  return variants;
}
