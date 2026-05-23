/**
 * Batch-import official TUM timetables into the database (CourseOfficialScheduleVariant).
 * Run after exam catalog sync — user flows read DB only, no live TUM calls on enroll/add.
 *
 * Usage:
 *   npm run sync:tum-official-schedules
 *   npx tsx scripts/sync-tum-official-schedules.ts --semester-label "SS 2026"
 *   npx tsx scripts/sync-tum-official-schedules.ts --code IN2222 --dry-run
 *   npx tsx scripts/sync-tum-official-schedules.ts --only-missing --limit 100
 */

import { getCurrentSemesterLabel } from "../lib/constants/semester";
import { syncTumOfficialScheduleForCourse } from "../lib/courses/official-schedule";
import {
  getSharedTumLectureCatalogIndex,
  resetSharedTumLectureCatalogIndex,
  semesterLabelToTumNatKey,
} from "../lib/integrations/tum-official-schedule";
import { prisma } from "../lib/db/prisma";

const SCHOOL = "TUM" as const;
const PROGRESS_EVERY = 50;

function parseArgs() {
  const argv = process.argv.slice(2);
  return {
    dryRun: argv.includes("--dry-run"),
    onlyMissing: argv.includes("--only-missing"),
    semesterLabel:
      (() => {
        const i = argv.indexOf("--semester-label");
        return i >= 0 && argv[i + 1] ? argv[i + 1]!.trim() : getCurrentSemesterLabel();
      })(),
    limit: (() => {
      const i = argv.indexOf("--limit");
      if (i < 0 || !argv[i + 1]) return null;
      const n = Number(argv[i + 1]);
      return Number.isFinite(n) && n > 0 ? n : null;
    })(),
    code: (() => {
      const i = argv.indexOf("--code");
      return i >= 0 && argv[i + 1] ? argv[i + 1]!.trim().toUpperCase() : null;
    })(),
  };
}

async function main() {
  const { dryRun, onlyMissing, semesterLabel, limit, code } = parseArgs();
  const semesterKey = semesterLabelToTumNatKey(semesterLabel);

  const courses = await prisma.course.findMany({
    where: {
      school: SCHOOL,
      semesterLabel,
      code: code ? code : { not: null },
      ...(onlyMissing
        ? {
            officialScheduleVariants: { none: {} },
          }
        : {}),
    },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
    ...(limit != null ? { take: limit } : {}),
  });

  console.log(
    `TUM official schedule batch import | semester=${semesterLabel} key=${semesterKey} ` +
      `courses=${courses.length} dryRun=${dryRun} onlyMissing=${onlyMissing}`,
  );

  if (courses.length === 0) {
    console.log("Nothing to sync.");
    return;
  }

  const lectureIndex = getSharedTumLectureCatalogIndex();
  console.log("Building lecture catalog index (one-time)…");
  await lectureIndex.ensureBuilt("lecture");
  console.log("Lecture catalog index ready.");

  let synced = 0;
  let skipped = 0;
  let failed = 0;
  let processed = 0;

  for (const course of courses) {
    const courseCode = course.code?.trim().toUpperCase();
    if (!courseCode) {
      skipped += 1;
      continue;
    }

    processed += 1;
    try {
      if (dryRun) {
        const { fetchOfficialVariantsForTumCode } = await import(
          "../lib/integrations/tum-official-schedule"
        );
        const variants = await fetchOfficialVariantsForTumCode(courseCode, semesterKey, {
          lectureIndex,
        });
        if (variants.length === 0) {
          skipped += 1;
        } else {
          console.log(`${courseCode}: ${variants.length} variant(s)`);
          synced += 1;
        }
        continue;
      }

      const variantCount = await syncTumOfficialScheduleForCourse({
        courseId: course.id,
        courseCode,
        semesterLabel,
        lectureIndex,
      });
      if (variantCount === 0) {
        skipped += 1;
      } else {
        synced += 1;
      }

      if (processed % PROGRESS_EVERY === 0) {
        console.log(`Progress ${processed}/${courses.length} (synced=${synced} skipped=${skipped} failed=${failed})…`);
      }
    } catch (error) {
      failed += 1;
      console.error(`Failed ${courseCode}:`, error);
    }
  }

  resetSharedTumLectureCatalogIndex();
  console.log(
    `Done. processed=${processed} synced=${synced} skipped=${skipped} failed=${failed}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
