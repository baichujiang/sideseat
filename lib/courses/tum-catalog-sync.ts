import {
  CourseCatalogSyncStatus,
  CourseExternalSource,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

import { getCurrentSemesterLabel } from "@/lib/constants/semester";
import { normalizeCourseIdentityCode } from "@/lib/courses/course-identity";
import { prisma } from "@/lib/db/prisma";
import {
  fetchAllTumCourseCatalogHits,
  type TumCourseCatalogHit,
} from "@/lib/integrations/tum-course-catalog";
import { semesterLabelToTumNatKey } from "@/lib/integrations/tum-official-schedule";

const SCHOOL = "TUM";
const CODE_MAX = 40;
const NAME_MAX = 500;
const CHUNK_SIZE = 80;
const RUN_STALE_AFTER_MS = 30 * 60 * 1000;
const ERROR_MAX = 2_000;

export type PreparedTumCatalogCourse = {
  code: string;
  identityCode: string;
  name: string;
  externalId: string;
};

export type TumCatalogSyncResult = {
  runId: string;
  status: CourseCatalogSyncStatus;
  semesterLabel: string;
  semesterKey: string;
  fetchedCount: number;
  preparedCount: number;
  upsertedCount: number;
  failedCount: number;
  skippedBecauseRunning: boolean;
};

type TumCatalogSyncOptions = {
  semesterLabel?: string;
  semesterKey?: string;
  trigger?: "CRON" | "MANUAL";
  database?: PrismaClient;
  fetchCatalog?: (semesterKey: string) => Promise<TumCourseCatalogHit[]>;
  now?: Date;
};

function normalizedCode(raw: string): string | null {
  const code = normalizeCourseIdentityCode(raw);
  if (!code || code.length < 2 || code.length > CODE_MAX) return null;
  if (code.includes("?") || !/^[A-Z0-9.\-_/]+$/i.test(code)) return null;
  return code;
}

function truncateName(raw: string): string {
  const value = raw.trim();
  return value.length <= NAME_MAX ? value : `${value.slice(0, NAME_MAX - 3)}...`;
}

function displayName(hit: TumCourseCatalogHit): string {
  const german = hit.course_name?.trim() ?? "";
  const english = hit.course_name_en?.trim() ?? "";
  return truncateName(german || english || `Course ${hit.course_id}`);
}

export function prepareTumCatalogCourses(
  hits: TumCourseCatalogHit[],
  semesterLabel: string,
): PreparedTumCatalogCourse[] {
  const byCode = new Map<string, TumCourseCatalogHit>();
  for (const hit of hits) {
    const sourceSemester = hit.semester?.semester_tag?.trim();
    if (sourceSemester && sourceSemester.toUpperCase() !== semesterLabel.toUpperCase()) {
      continue;
    }
    const code = normalizedCode(hit.course_code ?? "");
    if (!code || byCode.has(code)) continue;
    byCode.set(code, hit);
  }

  const prepared = [...byCode.entries()].map(([code, hit]) => ({
    code,
    identityCode: code,
    name: displayName(hit),
    externalId: String(hit.course_id),
  }));
  const nameCounts = new Map<string, number>();
  for (const row of prepared) {
    nameCounts.set(row.name, (nameCounts.get(row.name) ?? 0) + 1);
  }

  return prepared.map((row) => {
    if ((nameCounts.get(row.name) ?? 0) < 2) return row;
    const suffix = ` (${row.code})`;
    return {
      ...row,
      name: `${row.name.slice(0, NAME_MAX - suffix.length)}${suffix}`,
    };
  });
}

async function fetchCatalog(semesterKey: string): Promise<TumCourseCatalogHit[]> {
  const hits: TumCourseCatalogHit[] = [];
  for await (const hit of fetchAllTumCourseCatalogHits({ semesterKey })) {
    hits.push(hit);
  }
  return hits;
}

function errorText(cause: unknown): string {
  const value = cause instanceof Error ? cause.message : String(cause);
  return value.slice(0, ERROR_MAX);
}

function upsertInput(
  row: PreparedTumCatalogCourse,
  semesterLabel: string,
): Prisma.CourseUpsertArgs {
  return {
    where: {
      code_school_semesterLabel: {
        code: row.code,
        school: SCHOOL,
        semesterLabel,
      },
    },
    create: {
      code: row.code,
      identityCode: row.identityCode,
      name: row.name,
      school: SCHOOL,
      semesterLabel,
      externalSource: CourseExternalSource.TUM_NAT,
      externalId: row.externalId,
    },
    update: {
      identityCode: row.identityCode,
      name: row.name,
      externalSource: CourseExternalSource.TUM_NAT,
      externalId: row.externalId,
    },
  };
}

export async function syncTumCourseCatalog(
  options: TumCatalogSyncOptions = {},
): Promise<TumCatalogSyncResult> {
  const database = options.database ?? prisma;
  const now = options.now ?? new Date();
  const semesterLabel = options.semesterLabel?.trim() || getCurrentSemesterLabel(now);
  const semesterKey = options.semesterKey?.trim() || semesterLabelToTumNatKey(semesterLabel);
  const trigger = options.trigger ?? "CRON";
  const staleBefore = new Date(now.getTime() - RUN_STALE_AFTER_MS);

  await database.courseCatalogSyncRun.updateMany({
    where: {
      provider: CourseExternalSource.TUM_NAT,
      semesterLabel,
      status: CourseCatalogSyncStatus.RUNNING,
      startedAt: { lt: staleBefore },
    },
    data: {
      status: CourseCatalogSyncStatus.FAILED,
      completedAt: now,
      errorMessage: "Sync did not complete before the stale-run timeout.",
    },
  });

  const active = await database.courseCatalogSyncRun.findFirst({
    where: {
      provider: CourseExternalSource.TUM_NAT,
      semesterLabel,
      status: CourseCatalogSyncStatus.RUNNING,
      startedAt: { gte: staleBefore },
    },
    orderBy: { startedAt: "desc" },
  });
  if (active) {
    return {
      runId: active.id,
      status: active.status,
      semesterLabel,
      semesterKey,
      fetchedCount: active.fetchedCount,
      preparedCount: active.preparedCount,
      upsertedCount: active.upsertedCount,
      failedCount: active.failedCount,
      skippedBecauseRunning: true,
    };
  }

  const run = await database.courseCatalogSyncRun.create({
    data: {
      provider: CourseExternalSource.TUM_NAT,
      school: SCHOOL,
      semesterLabel,
      semesterKey,
      trigger,
    },
  });

  let fetchedCount = 0;
  let preparedCount = 0;
  let upsertedCount = 0;
  let failedCount = 0;
  const failures: string[] = [];

  try {
    const hits = await (options.fetchCatalog ?? fetchCatalog)(semesterKey);
    fetchedCount = hits.length;
    const rows = prepareTumCatalogCourses(hits, semesterLabel);
    preparedCount = rows.length;
    if (rows.length === 0) {
      throw new Error(`TUM returned no valid courses for ${semesterLabel} (${semesterKey}).`);
    }

    for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
      const chunk = rows.slice(index, index + CHUNK_SIZE);
      try {
        await database.$transaction(
          chunk.map((row) => database.course.upsert(upsertInput(row, semesterLabel))),
        );
        upsertedCount += chunk.length;
      } catch (chunkError) {
        for (const row of chunk) {
          try {
            await database.course.upsert(upsertInput(row, semesterLabel));
            upsertedCount += 1;
          } catch (rowError) {
            failedCount += 1;
            if (failures.length < 8) {
              failures.push(`${row.code}: ${errorText(rowError)}`);
            }
          }
        }
        if (failures.length === 0) failures.push(errorText(chunkError));
      }
    }

    const status = failedCount > 0
      ? CourseCatalogSyncStatus.PARTIAL
      : CourseCatalogSyncStatus.SUCCEEDED;
    await database.courseCatalogSyncRun.update({
      where: { id: run.id },
      data: {
        status,
        fetchedCount,
        preparedCount,
        upsertedCount,
        failedCount,
        errorMessage: failures.length > 0 ? failures.join("\n").slice(0, ERROR_MAX) : null,
        completedAt: new Date(),
      },
    });
    return {
      runId: run.id,
      status,
      semesterLabel,
      semesterKey,
      fetchedCount,
      preparedCount,
      upsertedCount,
      failedCount,
      skippedBecauseRunning: false,
    };
  } catch (cause) {
    await database.courseCatalogSyncRun.update({
      where: { id: run.id },
      data: {
        status: CourseCatalogSyncStatus.FAILED,
        fetchedCount,
        preparedCount,
        upsertedCount,
        failedCount: Math.max(failedCount, preparedCount - upsertedCount),
        errorMessage: errorText(cause),
        completedAt: new Date(),
      },
    });
    throw cause;
  }
}
