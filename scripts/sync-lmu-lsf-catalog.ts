/**
 * Import LMU courses from the public LSF Vorlesungsverzeichnis into `Course` (school=LMU).
 *
 * Usage:
 *   npx tsx scripts/sync-lmu-lsf-catalog.ts [--dry-run]
 *   npx tsx scripts/sync-lmu-lsf-catalog.ts --semester-label "SS 2026"
 *   npx tsx scripts/sync-lmu-lsf-catalog.ts --replace --i-am-sure
 *
 * --replace --i-am-sure  → DELETE all LMU courses for the semester first (CASCADE enrollments, etc.).
 *
 * Discovery uses public LSF Stichwort search (default). Optional `--with-tree` crawls the
 * Vorlesungsverzeichnis tree (slow; tree rows lack Veranstaltungsnummer until merged with search).
 * Only rows with a numeric Veranstaltungsnummer are imported (stable course code in ClassLink).
 */

import { prisma } from "../lib/db/prisma";
import { getCurrentSemesterLabel } from "../lib/constants/semester";
import { semesterLabelToLsfSemesterCode } from "../lib/constants/lmu-semester";
import {
  discoverLmuLsfCourses,
  type LmuLsfCatalogHit,
} from "../lib/integrations/lmu-lsf-catalog";

const SCHOOL = "LMU" as const;
const CHUNK = 80;
const CODE_MAX = 40;
const NAME_MAX = 500;

function parseArgs() {
  const argv = process.argv.slice(2);
  return {
    dryRun: argv.includes("--dry-run"),
    replace: argv.includes("--replace"),
    iAmSure: argv.includes("--i-am-sure"),
    treeOnly: argv.includes("--tree-only"),
    withTree: argv.includes("--with-tree"),
    semesterLabel:
      (() => {
        const i = argv.indexOf("--semester-label");
        return i >= 0 && argv[i + 1] ? argv[i + 1]!.trim() : null;
      })() ?? getCurrentSemesterLabel(),
    maxSearchPages:
      (() => {
        const i = argv.indexOf("--max-search-pages");
        return i >= 0 && argv[i + 1] ? Math.max(1, Number(argv[i + 1])) : 8;
      })(),
  };
}

function normalizeCode(raw: string | null | undefined): string | null {
  const c = raw?.trim();
  if (!c || !/^\d{3,8}$/.test(c)) return null;
  if (c.length > CODE_MAX) return null;
  return c;
}

function truncateName(s: string): string {
  const t = s.trim();
  if (t.length <= NAME_MAX) return t;
  return `${t.slice(0, NAME_MAX - 1)}…`;
}

function prepareRows(hits: LmuLsfCatalogHit[]): Array<{ code: string; name: string }> {
  const byCode = new Map<string, { code: string; name: string }>();

  for (const hit of hits) {
    const code = normalizeCode(hit.code);
    if (!code) continue;
    const name = truncateName(hit.name);
    if (name.length < 2) continue;

    const existing = byCode.get(code);
    if (!existing || name.length > existing.name.length) {
      byCode.set(code, { code, name });
    }
  }

  const list = [...byCode.values()];
  const nameCount = new Map<string, number>();
  for (const r of list) {
    nameCount.set(r.name, (nameCount.get(r.name) ?? 0) + 1);
  }

  return list.map((r) => {
    if ((nameCount.get(r.name) ?? 0) > 1) {
      return { ...r, name: truncateName(`${r.name} (${r.code})`) };
    }
    return r;
  });
}

async function main() {
  const { dryRun, replace, iAmSure, treeOnly, withTree, semesterLabel, maxSearchPages } =
    parseArgs();

  if (replace && !iAmSure) {
    console.error(
      "Refusing --replace without --i-am-sure (this deletes enrollments, bookmarks, course chat, invitations for LMU + semester).",
    );
    process.exitCode = 1;
    return;
  }

  const lsfCode = semesterLabelToLsfSemesterCode(semesterLabel);
  if (!lsfCode) {
    console.error(`Unknown semester label for LSF: ${JSON.stringify(semesterLabel)}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `LMU LSF catalog sync | school=${SCHOOL} semesterLabel=${semesterLabel} lsfCode=${lsfCode} dryRun=${dryRun} replace=${replace} treeOnly=${treeOnly} withTree=${withTree}`,
  );

  const discovered = await discoverLmuLsfCourses({
    semesterLabel,
    lsfSemesterCode: lsfCode,
    crawlTree: treeOnly || withTree,
    runSearch: !treeOnly,
    maxSearchPagesPerSeed: maxSearchPages,
    onProgress: (msg) => console.log(msg),
  });

  console.log(`Discovered ${discovered.length} unique LSF events (publishId deduped).`);

  const withCode = discovered.filter((h) => normalizeCode(h.code));
  console.log(`${withCode.length} events include a Veranstaltungsnummer (importable code).`);

  const prepared = prepareRows(discovered);
  console.log(`Prepared ${prepared.length} courses after code dedupe.`);

  if (prepared.length === 0) {
    console.error("Nothing to import. Try another --semester-label or check LSF availability.");
    process.exitCode = 1;
    return;
  }

  if (dryRun) {
    console.log("Dry run — no database writes. Sample:", prepared.slice(0, 8));
    return;
  }

  if (replace) {
    const del = await prisma.course.deleteMany({
      where: { school: SCHOOL, semesterLabel },
    });
    console.log(`Deleted ${del.count} existing LMU courses for ${semesterLabel} (CASCADE side effects).`);
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
    if (upserted % 400 === 0 || upserted === prepared.length) {
      console.log(`Upserted ${upserted}/${prepared.length}…`);
    }
  }

  console.log(`Done. Upserted ${upserted} LMU courses for ${semesterLabel}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
