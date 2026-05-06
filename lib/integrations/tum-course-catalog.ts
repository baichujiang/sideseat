/**
 * TUM School of Computation, Information & Technology — public course catalog API.
 *
 * Base: https://api.srv.nat.tum.de
 * Endpoint: GET /api/v1/course (`course_read_courses`)
 *
 * Use this to refresh `Course` rows (code + name + semester) periodically — typically
 * once per semester, but safe to re-run any time (idempotent upserts on your side).
 *
 * Pagination: responses include `total_count`, `offset`, `count`, `next_offset`, and `hits`.
 * Use `limit` up to 200 and advance `offset` via `next_offset` until exhausted.
 *
 * Practical defaults (verified against the live API):
 * - `semester_key`: `lecture` | `current` | concrete e.g. `2026s` — relative keys resolve to the
 *   active teaching semester; use a concrete key if you need a fixed snapshot.
 * - `only_show_open_registration=false` — include the full catalog (not only open registration).
 * - `order_by=code` — stable ordering for paging.
 *
 * Optional filters (usually omitted for full sync): `org_id`, `catalog_tag[]`, `ghk`, `rule_id[]`.
 * `columns` / `hx-request` target HTMX HTML fragments; JSON clients normally omit them.
 */

export const TUM_NAT_API_BASE = "https://api.srv.nat.tum.de";

export type TumCourseCatalogSemesterKey =
  | "lecture"
  | "current"
  | "next"
  | "previous"
  | "exam"
  | "calendar"
  | "planning"
  | "next_exam"
  | "next_lecture"
  | "next_planning"
  | "previous_exam"
  | "previous_lecture"
  | "previous_planning"
  | "nextnext"
  | "nextnext_exam"
  | "nextnext_lecture"
  | "nextnext_planning"
  /** Concrete semester, e.g. SS 2026 → `2026s` */
  | (string & {});

export type TumCourseCatalogHit = {
  course_code: string;
  course_name: string;
  course_name_en?: string | null;
  course_id: number;
  ghk: number;
  semester?: {
    semester_key: string;
    semester_tag?: string;
    semester_title?: string;
    semester_title_en?: string;
  };
  /** Additional fields (persons, activity, etc.) are omitted here but present on the wire. */
  [key: string]: unknown;
};

export type TumCourseCatalogPage = {
  total_count: number;
  count: number;
  offset: number;
  next_offset: number | null;
  hits: TumCourseCatalogHit[];
};

export type FetchTumCourseCatalogOptions = {
  semesterKey?: TumCourseCatalogSemesterKey;
  /** 1–200, default 200 */
  limit?: number;
  onlyShowOpenRegistration?: boolean;
  orderBy?: "code" | "code:desc" | "title" | "title:desc";
  orgId?: number;
  signal?: AbortSignal;
};

function buildCatalogUrl(opts: Required<Pick<FetchTumCourseCatalogOptions, "limit">> & FetchTumCourseCatalogOptions, offset: number): string {
  const params = new URLSearchParams();
  params.set("semester_key", opts.semesterKey ?? "lecture");
  params.set("limit", String(opts.limit));
  params.set("offset", String(offset));
  params.set("only_show_open_registration", String(opts.onlyShowOpenRegistration ?? false));
  params.set("order_by", opts.orderBy ?? "code");
  if (opts.orgId != null) params.set("org_id", String(opts.orgId));

  return `${TUM_NAT_API_BASE}/api/v1/course?${params.toString()}`;
}

/** Single page (use {@link fetchAllTumCourseCatalogHits} for full catalog). */
export async function fetchTumCourseCatalogPage(
  offset: number,
  options: FetchTumCourseCatalogOptions = {},
): Promise<TumCourseCatalogPage> {
  const limit = Math.min(200, Math.max(1, options.limit ?? 200));
  const url = buildCatalogUrl({ ...options, limit }, offset);
  const res = await fetch(url, { signal: options.signal });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`TUM course catalog HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as TumCourseCatalogPage;
}

/**
 * Iterate all catalog hits for the given semester scope (paginated).
 * Yields raw API rows; map to your `Course` model in the caller.
 */
export async function* fetchAllTumCourseCatalogHits(
  options: FetchTumCourseCatalogOptions = {},
): AsyncGenerator<TumCourseCatalogHit, TumCourseCatalogPage["total_count"], void> {
  let offset = 0;
  let total = 0;
  for (;;) {
    const page = await fetchTumCourseCatalogPage(offset, options);
    total = page.total_count;
    for (const hit of page.hits) {
      yield hit;
    }
    if (page.next_offset == null || page.hits.length === 0) {
      return total;
    }
    offset = page.next_offset;
  }
}
