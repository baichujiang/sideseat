/**
 * TUM NAT API — exam-oriented course list (module codes like IN0001, MA0902).
 *
 * GET /api/v1/course/exam/{semester_key}
 *
 * `semester_key` is a **path** segment (e.g. `exam`, `lecture`, `current`, `2026s`).
 * Optional query: `course_code_like`, `org_id`, `catalog_tag[]`, `ghk[]`.
 *
 * Unfiltered `…/exam/exam` returns a large JSON array (~18k rows in SS 2026);
 * prefer filtering by semester on import when you only want one `semester_tag`.
 */

export const TUM_NAT_API_BASE = "https://api.srv.nat.tum.de";

export type TumExamCourseRow = {
  course_code: string;
  course_name: string;
  course_name_en?: string | null;
  course_id: number;
  ghk: number;
  credits?: string | null;
  semester?: {
    semester_key: string;
    semester_tag?: string;
    semester_title?: string;
    semester_title_en?: string;
  };
  org?: unknown;
  exam_persons?: unknown;
  modified_tumonline?: string;
  [key: string]: unknown;
};

export type FetchTumExamCoursesOptions = {
  /** Path value after `/api/v1/course/exam/` — `exam`, `current`, `2026s`, etc. */
  semesterPath?: string;
  courseCodeLike?: string;
  orgId?: number;
  signal?: AbortSignal;
};

/**
 * Fetch the full exam list as one JSON array (can be large — ~tens of MB).
 */
export async function fetchTumExamCourses(
  options: FetchTumExamCoursesOptions = {},
): Promise<TumExamCourseRow[]> {
  const semesterPath = options.semesterPath ?? "exam";
  const params = new URLSearchParams();
  if (options.courseCodeLike?.trim()) {
    params.set("course_code_like", options.courseCodeLike.trim());
  }
  if (options.orgId != null) {
    params.set("org_id", String(options.orgId));
  }
  const q = params.toString();
  const url = `${TUM_NAT_API_BASE}/api/v1/course/exam/${encodeURIComponent(semesterPath)}${q ? `?${q}` : ""}`;
  const res = await fetch(url, { signal: options.signal });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`TUM exam catalog HTTP ${res.status}: ${text.slice(0, 240)}`);
  }
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new Error("TUM exam catalog: expected JSON array");
  }
  return data as TumExamCourseRow[];
}
