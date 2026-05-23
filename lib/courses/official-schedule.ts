import { CourseExternalSource, type Weekday } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  fetchOfficialVariantsForTumCode,
  semesterLabelToTumNatKey,
  type TumLectureCatalogIndex,
} from "@/lib/integrations/tum-official-schedule";

export type OfficialScheduleVariantDto = {
  fingerprint: string;
  label: string;
  source: "official";
  userCount: 0;
  sessions: Array<{ weekday: Weekday; start: string; end: string; location: string | null }>;
};

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export async function loadOfficialScheduleVariantsForCourse(
  courseId: string,
): Promise<OfficialScheduleVariantDto[]> {
  const rows = await prisma.courseOfficialScheduleVariant.findMany({
    where: { courseId },
    include: { sessions: true },
    orderBy: { label: "asc" },
  });

  return rows
    .filter((v) => v.sessions.length > 0)
    .map((v) => {
      const sessions = [...v.sessions].sort((a, b) => {
        const order = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
        const da = order.indexOf(a.weekday) - order.indexOf(b.weekday);
        if (da !== 0) return da;
        return a.startMinute - b.startMinute;
      });
      return {
        fingerprint: v.fingerprint,
        label: v.label,
        source: "official" as const,
        userCount: 0 as const,
        sessions: sessions.map((s) => ({
          weekday: s.weekday,
          start: formatMinutes(s.startMinute),
          end: formatMinutes(s.endMinute),
          location: s.location,
        })),
      };
    });
}

export type OfficialScheduleMeta = {
  hasOfficial: boolean;
  needsChoice: boolean;
  canAutoApply: boolean;
  defaultFingerprint: string | null;
};

export function getOfficialScheduleMeta(
  variants: OfficialScheduleVariantDto[],
): OfficialScheduleMeta {
  const defaultVariant = pickDefaultOfficialVariant(variants);
  return {
    hasOfficial: variants.length > 0,
    needsChoice: variants.length > 1 && defaultVariant == null,
    canAutoApply: defaultVariant != null,
    defaultFingerprint: defaultVariant?.fingerprint ?? null,
  };
}

/** Prefer a single Vorlesung row; otherwise require explicit user choice. */
export function pickDefaultOfficialVariant(
  variants: OfficialScheduleVariantDto[],
): OfficialScheduleVariantDto | null {
  if (variants.length === 0) return null;
  if (variants.length === 1) return variants[0]!;
  const lecture = variants.find(
    (v) =>
      /\bvorlesung\b/i.test(v.label) ||
      v.label.startsWith("Vorlesung") ||
      /\blecture\b/i.test(v.label),
  );
  return lecture ?? null;
}

export async function syncTumOfficialScheduleForCourse(params: {
  courseId: string;
  courseCode: string;
  semesterLabel: string;
  lectureIndex?: TumLectureCatalogIndex;
}): Promise<number> {
  const semesterKey = semesterLabelToTumNatKey(params.semesterLabel);
  const variants = await fetchOfficialVariantsForTumCode(params.courseCode.trim().toUpperCase(), semesterKey, {
    lectureIndex: params.lectureIndex,
  });
  if (variants.length === 0) return 0;

  await upsertOfficialVariantsForCourse(params.courseId, variants);
  await prisma.course.update({
    where: { id: params.courseId },
    data: {
      externalSource: CourseExternalSource.TUM_NAT,
      externalId: variants[0]?.externalKey ?? null,
    },
  });
  return variants.length;
}

export async function applyOfficialScheduleToUserCourse(params: {
  userCourseId: string;
  courseId: string;
  variantFingerprint?: string | null;
}): Promise<boolean> {
  const variants = await loadOfficialScheduleVariantsForCourse(params.courseId);
  if (variants.length === 0) return false;

  const chosen =
    (params.variantFingerprint
      ? variants.find((v) => v.fingerprint === params.variantFingerprint)
      : null) ?? pickDefaultOfficialVariant(variants);

  if (!chosen) return false;

  const sessionRecords = chosen.sessions
    .map((s) => {
      const [sh, sm] = s.start.split(":").map(Number);
      const [eh, em] = s.end.split(":").map(Number);
      if (!Number.isFinite(sh) || !Number.isFinite(sm) || !Number.isFinite(eh) || !Number.isFinite(em)) {
        return null;
      }
      const startMinute = sh * 60 + sm;
      const endMinute = eh * 60 + em;
      if (endMinute <= startMinute) return null;
      return {
        weekday: s.weekday,
        startMinute,
        endMinute,
        location: s.location?.trim() || null,
      };
    })
    .filter(
      (
        row,
      ): row is {
        weekday: Weekday;
        startMinute: number;
        endMinute: number;
        location: string | null;
      } => row !== null,
    );

  if (sessionRecords.length === 0) return false;

  await prisma.$transaction([
    prisma.courseSession.deleteMany({ where: { userCourseId: params.userCourseId } }),
    prisma.courseSession.createMany({
      data: sessionRecords.map((record) => ({
        userCourseId: params.userCourseId,
        ...record,
      })),
    }),
  ]);

  return true;
}

export async function upsertOfficialVariantsForCourse(
  courseId: string,
  variants: Array<{
    label: string;
    fingerprint: string;
    externalKey: string;
    sessions: Array<{
      weekday: Weekday;
      startMinute: number;
      endMinute: number;
      location: string | null;
    }>;
  }>,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.courseOfficialScheduleVariant.findMany({
      where: { courseId },
      select: { id: true, fingerprint: true },
    });
    const keep = new Set(variants.map((v) => v.fingerprint));
    const removeIds = existing.filter((e) => !keep.has(e.fingerprint)).map((e) => e.id);
    if (removeIds.length > 0) {
      await tx.courseOfficialScheduleVariant.deleteMany({ where: { id: { in: removeIds } } });
    }

    for (const variant of variants) {
      const row = await tx.courseOfficialScheduleVariant.upsert({
        where: {
          courseId_fingerprint: { courseId, fingerprint: variant.fingerprint },
        },
        create: {
          courseId,
          label: variant.label,
          fingerprint: variant.fingerprint,
          externalKey: variant.externalKey,
        },
        update: {
          label: variant.label,
          externalKey: variant.externalKey,
          syncedAt: new Date(),
        },
      });
      await tx.courseOfficialScheduleSession.deleteMany({ where: { variantId: row.id } });
      if (variant.sessions.length > 0) {
        await tx.courseOfficialScheduleSession.createMany({
          data: variant.sessions.map((s) => ({
            variantId: row.id,
            weekday: s.weekday,
            startMinute: s.startMinute,
            endMinute: s.endMinute,
            location: s.location,
          })),
        });
      }
    }

    await tx.course.update({
      where: { id: courseId },
      data: { officialScheduleSyncedAt: new Date() },
    });
  });
}
