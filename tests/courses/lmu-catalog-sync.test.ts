import assert from "node:assert/strict";
import test from "node:test";
import { CourseCatalogSyncStatus, type PrismaClient } from "@prisma/client";

import {
  prepareLmuCatalogCourses,
  syncLmuCourseCatalog,
} from "../../lib/courses/lmu-catalog-sync";
import type { LmuLsfCatalogHit } from "../../lib/integrations/lmu-lsf-catalog";

function hit(overrides: Partial<LmuLsfCatalogHit>): LmuLsfCatalogHit {
  return {
    publishId: "100",
    code: "12345",
    name: "Einführung in die Informatik",
    source: "search",
    ...overrides,
  };
}

test("LMU catalog preparation keeps stable codes and external ids", () => {
  const rows = prepareLmuCatalogCourses([
    hit({ publishId: "100", code: " 12345 ", name: "Informatik" }),
    hit({ publishId: "101", code: "12345", name: "Einführung in die Informatik" }),
    hit({ publishId: "102", code: null }),
  ]);
  assert.deepEqual(rows, [{
    code: "12345",
    identityCode: "12345",
    name: "Einführung in die Informatik",
    externalId: "101",
  }]);
});

test("LMU catalog sync records a completed upsert run", async () => {
  const updates: Array<Record<string, unknown>> = [];
  const upserts: Array<Record<string, unknown>> = [];
  const database = {
    courseCatalogSyncRun: {
      updateMany: async () => ({ count: 0 }),
      findFirst: async () => null,
      create: async () => ({ id: "lmu-sync-1", status: CourseCatalogSyncStatus.RUNNING }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return { id: "lmu-sync-1", ...data };
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

  const result = await syncLmuCourseCatalog({
    database,
    semesterLabel: "SS 2026",
    semesterKey: "20261",
    trigger: "MANUAL",
    fetchCatalog: async () => [
      hit({ publishId: "100", code: "12345" }),
      hit({ publishId: "101", code: "67890", name: "Datenbanken" }),
    ],
  });

  assert.equal(result.status, CourseCatalogSyncStatus.SUCCEEDED);
  assert.equal(result.fetchedCount, 2);
  assert.equal(result.upsertedCount, 2);
  assert.equal(upserts.length, 2);
  assert.equal(updates.at(-1)?.status, CourseCatalogSyncStatus.SUCCEEDED);
});
