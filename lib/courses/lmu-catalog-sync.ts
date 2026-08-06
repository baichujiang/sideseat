import {
  CourseCatalogSyncStatus,
  CourseExternalSource,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

import { semesterLabelToLsfSemesterCode } from "@/lib/constants/lmu-semester";
import { getCurrentSemesterLabel } from "@/lib/constants/semester";
import { normalizeCourseIdentityCode } from "@/lib/courses/course-identity";
import { prisma } from "@/lib/db/prisma";
import {
  discoverLmuLsfCourses,
  type LmuLsfCatalogHit,
} from "@/lib/integrations/lmu-lsf-catalog";

const SCHOOL = "LMU";
const CODE_MAX = 40;
const NAME_MAX = 500;
const CHUNK_SIZE = 80;
const RUN_STALE_AFTER_MS = 30 * 60 * 1000;
const ERROR_MAX = 2_000;

export type PreparedLmuCatalogCourse = {
  code: string;
  identityCode: string;
  name: string;
  externalId: string;
};

export type LmuCatalogSyncResult = {
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

type LmuCatalogSyncOptions = {
  semesterLabel?: string;
  semesterKey?: string;
  trigger?: "CRON" | "MANUAL";
  database?: PrismaClient;
  fetchCatalog?: (semesterKey: string, semesterLabel: string) => Promise<LmuLsfCatalogHit[]>;
  now?: Date;
};

function normalizedCode(raw: string | null): string | null {
  const code = normalizeCourseIdentityCode(raw ?? "");
  if (!code || code.length > CODE_MAX || !/^\d{3,8}$/.test(code)) return null;
  return code;
}

function truncateName(raw: string): string {
  const value = raw.trim();
  return value.length <= NAME_MAX ? value : `${value.slice(0, NAME_MAX - 3)}...`;
}

export function prepareLmuCatalogCourses(hits: LmuLsfCatalogHit[]): PreparedLmuCatalogCourse[] {
  const byCode = new Map<string, LmuLsfCatalogHit>();
  for (const hit of hits) {
    const code = normalizedCode(hit.code);
    if (!code) continue;
    const existing = byCode.get(code);
    if (!existing || hit.name.trim().length > existing.name.trim().length) {
      byCode.set(code, hit);
    }
  }

  const prepared = [...byCode.entries()].map(([code, hit]) => ({
    code,
    identityCode: code,
    name: truncateName(hit.name),
    externalId: hit.publishId,
  })).filter((row) => row.name.length >= 2);

  const nameCounts = new Map<string, number>();
  for (const row of prepared) {
    nameCounts.set(row.name, (nameCounts.get(row.name) ?? 0) + 1);
  }
  return prepared.map((row) => {
    if ((nameCounts.get(row.name) ?? 0) < 2) return row;
    const suffix = ` (${row.code})`;
    return { ...row, name: `${row.name.slice(0, NAME_MAX - suffix.length)}${suffix}` };
  });
}

async function fetchCatalog(semesterKey: string, semesterLabel: string) {
  return discoverLmuLsfCourses({
    semesterLabel,
    lsfSemesterCode: semesterKey,
    runSearch: true,
    crawlTree: false,
  });
}

function errorText(cause: unknown): string {
  return (cause instanceof Error ? cause.message : String(cause)).slice(0, ERROR_MAX);
}

function upsertInput(
  row: PreparedLmuCatalogCourse,
  semesterLabel: string,
): Prisma.CourseUpsertArgs {
  return {
    where: {
      code_school_semesterLabel: { code: row.code, school: SCHOOL, semesterLabel },
    },
    create: {
      code: row.code,
      identityCode: row.identityCode,
      name: row.name,
      school: SCHOOL,
      semesterLabel,
      externalSource: CourseExternalSource.LMU_LSF,
      externalId: row.externalId,
    },
    update: {
      identityCode: row.identityCode,
      name: row.name,
      externalSource: CourseExternalSource.LMU_LSF,
      externalId: row.externalId,
    },
  };
}

export async function syncLmuCourseCatalog(
  options: LmuCatalogSyncOptions = {},
): Promise<LmuCatalogSyncResult> {
  const database = options.database ?? prisma;
  const now = options.now ?? new Date();
  const semesterLabel = options.semesterLabel?.trim() || getCurrentSemesterLabel(now);
  const semesterKey = options.semesterKey?.trim() || semesterLabelToLsfSemesterCode(semesterLabel);
  if (!semesterKey) throw new Error(`Cannot map ${semesterLabel} to an LMU LSF semester.`);
  const trigger = options.trigger ?? "CRON";
  const staleBefore = new Date(now.getTime() - RUN_STALE_AFTER_MS);

  await database.courseCatalogSyncRun.updateMany({
    where: {
      provider: CourseExternalSource.LMU_LSF,
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
      provider: CourseExternalSource.LMU_LSF,
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
      provider: CourseExternalSource.LMU_LSF,
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
    const hits = await (options.fetchCatalog ?? fetchCatalog)(semesterKey, semesterLabel);
    fetchedCount = hits.length;
    const rows = prepareLmuCatalogCourses(hits);
    preparedCount = rows.length;
    if (rows.length === 0) throw new Error(`LMU LSF returned no valid courses for ${semesterLabel}.`);

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
            if (failures.length < 8) failures.push(`${row.code}: ${errorText(rowError)}`);
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
