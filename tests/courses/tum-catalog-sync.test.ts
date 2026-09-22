import assert from "node:assert/strict";
import test from "node:test";
import { CourseCatalogSyncStatus, type PrismaClient } from "@prisma/client";

import {
  prepareTumCatalogCourses,
  syncTumCourseCatalog,
} from "../../lib/courses/tum-catalog-sync";
import type { TumCourseCatalogHit } from "../../lib/integrations/tum-course-catalog";

function hit(overrides: Partial<TumCourseCatalogHit>): TumCourseCatalogHit {
  return {
    course_code: "IN0001",
    course_name: "Algorithms",
    course_id: 1,
    ghk: 0,
    semester: { semester_key: "2026s", semester_tag: "SS 2026" },
    ...overrides,
  };
}

test("TUM catalog preparation normalizes and deduplicates stable course codes", () => {
  const rows = prepareTumCatalogCourses(
    [
      hit({ course_code: " in 0001 ", course_id: 1 }),
      hit({ course_code: "IN0001", course_id: 2 }),
      hit({ course_code: "?", course_id: 3 }),
      hit({ course_code: "IN9999", course_id: 4, semester: { semester_key: "2025w", semester_tag: "WS 2025/26" } }),
    ],
    "SS 2026",
  );

  assert.deepEqual(rows, [
    {
      code: "IN0001",
      identityCode: "IN0001",
      name: "Algorithms",
      externalId: "1",
    },
  ]);
});

test("TUM catalog preparation makes duplicate display names unique", () => {
  const rows = prepareTumCatalogCourses(
    [
      hit({ course_code: "IN0001", course_name: "Seminar", course_id: 1 }),
      hit({ course_code: "IN0002", course_name: "Seminar", course_id: 2 }),
    ],
    "SS 2026",
  );

  assert.deepEqual(rows.map((row) => row.name), ["Seminar (IN0001)", "Seminar (IN0002)"]);
});

test("TUM catalog sync records a completed idempotent upsert run", async () => {
  const updates: Array<Record<string, unknown>> = [];
  const upserts: Array<Record<string, unknown>> = [];
  const database = {
    courseCatalogSyncRun: {
      updateMany: async () => ({ count: 0 }),
      findFirst: async () => null,
      create: async () => ({
        id: "sync-run-1",
        status: CourseCatalogSyncStatus.RUNNING,
      }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return { id: "sync-run-1", ...data };
      },
    },
    course: {
      upsert: async (args: Record<string, unknown>) => {
        upserts.push(args);
        return { id: `course-${upserts.length}` };
      },
    },
    $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
  } as unknown as PrismaClient;

  const result = await syncTumCourseCatalog({
    database,
    semesterLabel: "SS 2026",
    semesterKey: "2026s",
    trigger: "MANUAL",
    fetchCatalog: async () => [
      hit({ course_code: "IN0001", course_id: 10 }),
      hit({ course_code: "IN0002", course_name: "Databases", course_id: 11 }),
    ],
  });

  assert.equal(result.status, CourseCatalogSyncStatus.SUCCEEDED);
  assert.equal(result.fetchedCount, 2);
  assert.equal(result.upsertedCount, 2);
  assert.equal(upserts.length, 2);
  assert.equal(updates.at(-1)?.status, CourseCatalogSyncStatus.SUCCEEDED);
  assert.ok(updates.at(-1)?.completedAt instanceof Date);
});
