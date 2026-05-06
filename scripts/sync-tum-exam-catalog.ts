/**
 * Import TUM exam-oriented module catalog into `Course` (school=TUM).
 *
 * Usage:
 *   npx tsx scripts/sync-tum-exam-catalog.ts [--dry-run] [--replace --i-am-sure]
 *   npx tsx scripts/sync-tum-exam-catalog.ts --semester-label "SS 2026" --exam-path exam
 *
 * --replace --i-am-sure  → DELETE all `Course` rows for TUM + the given semester first.
 *   This CASCADE-deletes UserCourse, SavedCourse, Invitation, CourseRoomMessage for those
 *   courses. Connection.originCourseId is set null. **Production data loss.**
 *
 * Default: upsert only (no deletes). Rows are matched by (code, school, semesterLabel).
 */

import { prisma } from "../lib/db/prisma";
import { getCurrentSemesterLabel } from "../lib/constants/semester";
import { fetchTumExamCourses } from "../lib/integrations/tum-exam-catalog";
import type { TumExamCourseRow } from "../lib/integrations/tum-exam-catalog";

const SCHOOL = "TUM" as const;
const CHUNK = 80;
/** API rows may use longer codes than the add-course form allows; store as-is up to this length. */
const CODE_MAX = 40;
const NAME_MAX = 500;

function parseArgs() {
  const argv = process.argv.slice(2);
  return {
    dryRun: argv.includes("--dry-run"),
    replace: argv.includes("--replace"),
    iAmSure: argv.includes("--i-am-sure"),
    semesterLabel:
      (() => {
        const i = argv.indexOf("--semester-label");
        return i >= 0 && argv[i + 1] ? argv[i + 1]!.trim() : null;
      })() ?? getCurrentSemesterLabel(),
    examPath:
      (() => {
        const i = argv.indexOf("--exam-path");
        return i >= 0 && argv[i + 1] ? argv[i + 1]!.trim() : "exam";
      })(),
  };
}

function normalizeCode(raw: string): string | null {
  const c = raw.trim().toUpperCase();
  if (c.length < 2 || c.length > CODE_MAX) return null;
  if (c.includes("?")) return null;
  if (!/^[A-Z0-9.\-_/]+$/i.test(c)) return null;
  return c;
}

function truncateName(s: string): string {
  const t = s.trim();
  if (t.length <= NAME_MAX) return t;
  return `${t.slice(0, NAME_MAX - 1)}…`;
}

function pickDisplayName(row: TumExamCourseRow): string {
  const de = (row.course_name || "").trim();
  const en = (row.course_name_en || "").trim();
  const base = de.length >= 2 ? de : en.length >= 2 ? en : "";
  return truncateName(base || de || en || `Course ${row.course_id}`);
}

function prepareRows(
  raw: TumExamCourseRow[],
  semesterLabel: string,
): Array<{ code: string; name: string; courseId: number }> {
  const byCode = new Map<string, TumExamCourseRow>();
  for (const row of raw) {
    const tag = row.semester?.semester_tag?.trim();
    if (tag && tag !== semesterLabel) continue;

    const code = normalizeCode(row.course_code || "");
    if (!code) continue;

    if (!byCode.has(code)) {
      byCode.set(code, row);
    }
  }

  const list = [...byCode.entries()].map(([code, row]) => ({
    code,
    name: pickDisplayName(row),
    courseId: row.course_id,
  }));

  const nameCount = new Map<string, number>();
  for (const r of list) {
    const k = r.name;
    nameCount.set(k, (nameCount.get(k) ?? 0) + 1);
  }

  return list.map((r) => {
    if ((nameCount.get(r.name) ?? 0) > 1) {
      return { ...r, name: truncateName(`${r.name} (${r.code})`) };
    }
    return r;
  });
}

async function main() {
  const { dryRun, replace, iAmSure, semesterLabel, examPath } = parseArgs();

  if (replace && !iAmSure) {
    console.error(
      "Refusing --replace without --i-am-sure (this deletes enrollments, bookmarks, course chat, invitations for TUM + semester).",
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `TUM exam catalog sync | school=${SCHOOL} semesterLabel=${semesterLabel} examPath=${examPath} dryRun=${dryRun} replace=${replace}`,
  );

  const raw = await fetchTumExamCourses({ semesterPath: examPath });
  console.log(`Fetched ${raw.length} exam API rows.`);

  const prepared = prepareRows(raw, semesterLabel);
  console.log(`Prepared ${prepared.length} courses for semester_tag === ${JSON.stringify(semesterLabel)} (valid code + deduped).`);

  if (prepared.length === 0) {
    console.error("Nothing to import. Check --semester-label matches API semester.semester_tag.");
    process.exitCode = 1;
    return;
  }

  if (dryRun) {
    console.log("Dry run — no database writes. Sample:", prepared.slice(0, 5));
    return;
  }

  if (replace) {
    const del = await prisma.course.deleteMany({
      where: { school: SCHOOL, semesterLabel },
    });
    console.log(`Deleted ${del.count} existing TUM courses for ${semesterLabel} (CASCADE side effects).`);
  }

  let upserted = 0;
  for (let i = 0; i < prepared.length; i += CHUNK) {
    const chunk = prepared.slice(i, i + CHUNK);
    await prisma.$transaction(
      chunk.map((row) =>
        prisma.course.upsert({
          where: {
            code_school_semesterLabel: {
              code: row.code,
              school: SCHOOL,
              semesterLabel,
            },
          },
          create: {
            code: row.code,
            name: row.name,
            school: SCHOOL,
            semesterLabel,
            instructorSummary: null,
          },
          update: {
            name: row.name,
          },
        }),
      ),
    );
    upserted += chunk.length;
    if (upserted % 800 === 0 || upserted === prepared.length) {
      console.log(`Upserted ${upserted}/${prepared.length}…`);
    }
  }

  console.log(`Done. Upserted ${upserted} courses.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
