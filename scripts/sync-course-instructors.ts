import { prisma } from "@/lib/db/prisma";

type ExamCourse = {
  course_id: number;
  course_code?: string | null;
  semester?: { semester_key?: string | null } | null;
};

type Lecturer = { fullname?: string | null; firstname?: string | null; lastname?: string | null };

function normalizeInstructorName(person: Lecturer): string | null {
  const full = person.fullname?.trim();
  if (full) return full;
  const fallback = [person.firstname, person.lastname].filter(Boolean).join(" ").trim();
  return fallback || null;
}

function summarizeLecturers(lecturers: Lecturer[]): string | null {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const person of lecturers) {
    const name = normalizeInstructorName(person);
    if (!name) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  if (names.length === 0) return null;
  return names.slice(0, 3).join(", ");
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}

async function resolveCourseIdByCode(code: string, semesterKey: string): Promise<number | null> {
  const endpoint =
    `https://api.srv.nat.tum.de/api/v1/course/exam/${semesterKey}` +
    `?course_code_like=${encodeURIComponent(code)}`;
  const rows = await fetchJson<ExamCourse[]>(endpoint);
  const exact = rows.find((row) => row.course_code?.toUpperCase() === code.toUpperCase());
  return exact?.course_id ?? null;
}

async function fetchInstructorSummary(courseId: number): Promise<string | null> {
  const detail = await fetchJson<{
    groups?: Array<{ events?: Array<{ lecturers?: Lecturer[] | null } | null> | null }>;
    roles?: Array<{ persons?: Lecturer[] | null }>;
  }>(`https://api.srv.nat.tum.de/api/v1/course/${courseId}`);

  const eventLecturers =
    detail.groups
      ?.flatMap((group) => group?.events ?? [])
      .flatMap((event) => event?.lecturers ?? []) ?? [];

  // Fallback: role persons when event-level lecturers are unavailable.
  const roleLecturers = detail.roles?.flatMap((role) => role.persons ?? []) ?? [];
  return summarizeLecturers(eventLecturers.length > 0 ? eventLecturers : roleLecturers);
}

async function main() {
  const semesterLabel = process.argv[2] ?? "SS 2026";
  const semesterKey = toSemesterKey(semesterLabel);
  const takeArg = Number(process.argv[3] ?? "200");
  const take = Number.isFinite(takeArg) && takeArg > 0 ? takeArg : 200;

  const courses = await prisma.course.findMany({
    where: {
      semesterLabel: semesterLabel.toUpperCase(),
      code: { not: null },
    },
    select: { id: true, code: true, instructorSummary: true },
    take,
  });

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const course of courses) {
    const code = course.code?.trim().toUpperCase();
    if (!code) {
      skipped += 1;
      continue;
    }

    try {
      const courseId = await resolveCourseIdByCode(code, semesterKey);
      if (!courseId) {
        skipped += 1;
        continue;
      }

      const instructorSummary = await fetchInstructorSummary(courseId);
      if (!instructorSummary) {
        skipped += 1;
        continue;
      }

      if (course.instructorSummary?.trim() === instructorSummary) {
        skipped += 1;
        continue;
      }

      await prisma.course.update({
        where: { id: course.id },
        data: { instructorSummary },
      });
      updated += 1;
    } catch (error) {
      failed += 1;
      console.error(`Failed for ${code}:`, error);
    }
  }

  console.log(
    `sync-course-instructors done | semester=${semesterLabel} take=${take} updated=${updated} skipped=${skipped} failed=${failed}`,
  );
}

function toSemesterKey(input: string): string {
  const normalized = input.trim();
  const direct = normalized.match(/^(\d{4})([sw])$/i);
  if (direct) {
    return `${direct[1]}${direct[2]!.toLowerCase()}`;
  }

  const label = normalized.match(/^(SS|WS)\s+(\d{4})$/i);
  if (label) {
    const year = label[2]!;
    const season = label[1]!.toUpperCase() === "SS" ? "s" : "w";
    return `${year}${season}`;
  }

  return normalized.toLowerCase();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
