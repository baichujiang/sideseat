/**
 * LMU München public LSF / QIS course catalog (Vorlesungsverzeichnis).
 *
 * No official JSON API — we read the same HTML pages as the public browse + search UI.
 * Be respectful: low concurrency, identifiable User-Agent, cache results per run.
 */

import { semesterLabelToLsfSemesterCode } from "@/lib/constants/lmu-semester";

export const LMU_LSF_BASE = "https://lsf.verwaltung.uni-muenchen.de/qisserver/rds";

const USER_AGENT = "ClassLink/1.0 (+https://github.com/baichujiang/sideseat; course-catalog-sync)";

/** Default delay between HTTP requests (ms). */
export const LMU_LSF_REQUEST_DELAY_MS = 180;

/** Browse/tree query param, e.g. SoSe 2026 → `root120261`. */
export function lsfTreeRootParamKey(lsfSemesterCode: string): string {
  return `root1${lsfSemesterCode}`;
}

/** Stichwort queries that return wide result sets in practice. */
export const LMU_LSF_DEFAULT_SEARCH_SEEDS = [
  "Vorlesung",
  "Seminar",
  "Übung",
  "Praktikum",
  "Tutorium",
  "Proseminar",
  "Hauptseminar",
  "Master",
  "Bachelor",
  "Grundlagen",
  "Einführung",
  "Introduction",
  "Advanced",
  "Mathematik",
  "Informatik",
  "Physik",
  "Chemie",
  "Biologie",
  "Medizin",
  "Wirtschaft",
  "Recht",
  "Philosophie",
  "Geschichte",
  "Psychologie",
  "Sprach",
  "Deutsch",
  "Englisch",
  "Analysis",
  "Algebra",
  "Programmierung",
  "Machine",
  "Learning",
  "Research",
  "Projekt",
  "Labor",
  "Kurs",
  "und",
  "International",
  "Munich",
  "Statistik",
  "Theorie",
  "Praxis",
] as const;

export type LmuLsfCatalogHit = {
  publishId: string;
  code: string | null;
  name: string;
  source: "search" | "tree";
};

export type DiscoverLmuLsfCoursesOptions = {
  semesterLabel: string;
  /** Override LSF semester code (e.g. `20261`). */
  lsfSemesterCode?: string;
  searchSeeds?: readonly string[];
  /** Max search result pages per seed (page size 100). */
  maxSearchPagesPerSeed?: number;
  /** Crawl Vorlesungsverzeichnis tree (recommended). */
  crawlTree?: boolean;
  /** Run Stichwort search seeds (recommended alongside tree). */
  runSearch?: boolean;
  requestDelayMs?: number;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
};

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function decodeHtmlText(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&ouml;/g, "ö")
    .replace(/&uuml;/g, "ü")
    .replace(/&auml;/g, "ä")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&Uuml;/g, "Ü")
    .replace(/&Auml;/g, "Ä")
    .replace(/&szlig;/g, "ß")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseLsfSearchResultsHtml(html: string): LmuLsfCatalogHit[] {
  const hits: LmuLsfCatalogHit[] = [];
  const rowRe =
    /<tr>[\s\S]*?publishSubDir=veranstaltung[\s\S]*?publishid=(\d+)[\s\S]*?<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const block = m[0];
    const publishId = m[1];
    const numMatch =
      /<td[^>]*class="mod_n_[^"]*"[^>]*>\s*(\d{3,8})\s*<\/td>/i.exec(block) ??
      /<td[^>]*>\s*(\d{3,8})\s*<\/td>/i.exec(block);
    const titleMatch =
      /title="Mehr Informationen zu ([^"]+)"/i.exec(block) ??
      /publishSubDir=veranstaltung[^"]*"[^>]*>([^<]+)</i.exec(block);
    const name = decodeHtmlText(titleMatch?.[1] ?? "");
    if (!name || name.length < 2) continue;
    hits.push({
      publishId,
      code: numMatch?.[1] ?? null,
      name,
      source: "search",
    });
  }
  return hits;
}

export function parseLsfTreeCourseLinks(html: string): LmuLsfCatalogHit[] {
  const hits: LmuLsfCatalogHit[] = [];
  const linkRe =
    /publishid=(\d+)&amp;moduleCall=webInfo&amp;publishConfFile=webInfo&amp;publishSubDir=veranstaltung[^"]*"[^>]*title="Mehr Informationen zu ([^"]+)"[^>]*>([^<]+)</gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const name = decodeHtmlText(m[2] || m[3] || "");
    if (!name || name.length < 2) continue;
    hits.push({
      publishId: m[1],
      code: null,
      name,
      source: "tree",
    });
  }
  return hits;
}

export function extractLsfTreePaths(html: string, lsfSemesterCode: string): string[] {
  const key = `${lsfTreeRootParamKey(lsfSemesterCode)}=`;
  const re = new RegExp(`${key}([0-9A-Za-z%|]+)`, "gi");
  const paths = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    paths.add(decodeURIComponent(m[1]).replace(/%7C/gi, "|"));
  }
  return [...paths];
}

export function extractLsfBrowseRootPath(html: string, lsfSemesterCode: string): string | null {
  const paths = extractLsfTreePaths(html, lsfSemesterCode);
  if (paths.length === 0) return null;
  return paths.sort((a, b) => a.length - b.length)[0] ?? null;
}

async function fetchLsfHtml(url: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(url, {
    signal,
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LMU LSF HTTP ${res.status} for ${url}: ${text.slice(0, 200)}`);
  }
  return res.text();
}

function browseIndexUrl(): string {
  const params = new URLSearchParams({
    state: "wtree",
    search: "1",
    category: "veranstaltung.browse",
    breadcrumb: "lectureindex",
    navigationPosition: "functions,lectureindex",
    subitem: "lectureindex",
    topitem: "functions",
  });
  return `${LMU_LSF_BASE}?${params.toString()}`;
}

function treeUrl(lsfSemesterCode: string, rootPath: string): string {
  const params = new URLSearchParams({
    state: "wtree",
    search: "1",
    trex: "step",
    [lsfTreeRootParamKey(lsfSemesterCode)]: rootPath,
    "P.vx": "kurz",
  });
  return `${LMU_LSF_BASE}?${params.toString()}`;
}

function searchUrl(lsfSemesterCode: string, query: string, start: number, count: number): string {
  const params = new URLSearchParams({
    state: "wsearchv",
    search: "1",
    subdir: "veranstaltung",
    "veranstaltung.dtxt": query,
    "veranstaltung.semester": lsfSemesterCode,
    P_start: String(start),
    P_anzahl: String(count),
    _form: "display",
  });
  return `${LMU_LSF_BASE}?${params.toString()}`;
}

async function crawlLsfTree(
  lsfSemesterCode: string,
  delayMs: number,
  signal: AbortSignal | undefined,
  onProgress?: (message: string) => void,
): Promise<LmuLsfCatalogHit[]> {
  const indexHtml = await fetchLsfHtml(browseIndexUrl(), signal);
  await sleep(delayMs, signal);

  const initialPath = extractLsfBrowseRootPath(indexHtml, lsfSemesterCode);
  if (!initialPath) {
    throw new Error(
      `Could not find LSF browse root for semester code ${lsfSemesterCode}. Is the semester offered in LSF?`,
    );
  }

  const queue: string[] = [initialPath];
  const visited = new Set<string>();
  const hits: LmuLsfCatalogHit[] = [];

  while (queue.length > 0) {
    const path = queue.shift()!;
    if (visited.has(path)) continue;
    visited.add(path);

    onProgress?.(`tree ${visited.size} nodes · queue ${queue.length} · path ${path.slice(0, 40)}…`);

    const html = await fetchLsfHtml(treeUrl(lsfSemesterCode, path), signal);
    hits.push(...parseLsfTreeCourseLinks(html));

    for (const child of extractLsfTreePaths(html, lsfSemesterCode)) {
      if (!visited.has(child) && !queue.includes(child)) {
        queue.push(child);
      }
    }

    await sleep(delayMs, signal);
  }

  return hits;
}

async function searchLsfCatalog(
  lsfSemesterCode: string,
  seeds: readonly string[],
  maxPagesPerSeed: number,
  delayMs: number,
  signal: AbortSignal | undefined,
  onProgress?: (message: string) => void,
): Promise<LmuLsfCatalogHit[]> {
  const hits: LmuLsfCatalogHit[] = [];
  const pageSize = 100;

  for (const seed of seeds) {
    for (let page = 0; page < maxPagesPerSeed; page++) {
      const start = page * pageSize;
      onProgress?.(`search “${seed}” page ${page + 1}…`);
      const html = await fetchLsfHtml(searchUrl(lsfSemesterCode, seed, start, pageSize), signal);
      const pageHits = parseLsfSearchResultsHtml(html);
      if (pageHits.length === 0) break;
      hits.push(...pageHits);
      if (pageHits.length < pageSize) break;
      await sleep(delayMs, signal);
    }
    await sleep(delayMs, signal);
  }

  return hits;
}

function mergeCatalogHits(raw: LmuLsfCatalogHit[]): LmuLsfCatalogHit[] {
  const byPublishId = new Map<string, LmuLsfCatalogHit>();
  const byCode = new Map<string, LmuLsfCatalogHit>();

  for (const hit of raw) {
    const existing = byPublishId.get(hit.publishId);
    if (!existing) {
      byPublishId.set(hit.publishId, hit);
    } else if (!existing.code && hit.code) {
      byPublishId.set(hit.publishId, { ...existing, code: hit.code });
    }

    if (hit.code) {
      const prev = byCode.get(hit.code);
      if (!prev || hit.name.length > prev.name.length) {
        byCode.set(hit.code, hit);
      }
    }
  }

  const out: LmuLsfCatalogHit[] = [];
  const usedCodes = new Set<string>();

  for (const hit of byPublishId.values()) {
    if (hit.code) {
      const canonical = byCode.get(hit.code);
      if (canonical && canonical.publishId !== hit.publishId) {
        continue;
      }
      if (usedCodes.has(hit.code)) continue;
      usedCodes.add(hit.code);
    }
    out.push(hit);
  }

  return out;
}

/**
 * Discover courses for an LSF semester by crawling the public catalog tree and
 * running broad Stichwort searches.
 */
export async function discoverLmuLsfCourses(
  options: DiscoverLmuLsfCoursesOptions,
): Promise<LmuLsfCatalogHit[]> {
  const lsfSemesterCode =
    options.lsfSemesterCode?.trim() ||
    semesterLabelToLsfSemesterCode(options.semesterLabel) ||
    null;
  if (!lsfSemesterCode) {
    throw new Error(
      `Cannot map semester label ${JSON.stringify(options.semesterLabel)} to an LSF semester code.`,
    );
  }

  const delayMs = options.requestDelayMs ?? LMU_LSF_REQUEST_DELAY_MS;
  const seeds = options.searchSeeds ?? LMU_LSF_DEFAULT_SEARCH_SEEDS;
  const maxPages = options.maxSearchPagesPerSeed ?? 8;
  const crawlTree = options.crawlTree === true;
  const runSearch = options.runSearch !== false;

  const collected: LmuLsfCatalogHit[] = [];

  if (crawlTree) {
    collected.push(...(await crawlLsfTree(lsfSemesterCode, delayMs, options.signal, options.onProgress)));
  }

  if (runSearch) {
    collected.push(
      ...(await searchLsfCatalog(
        lsfSemesterCode,
        seeds,
        maxPages,
        delayMs,
        options.signal,
        options.onProgress,
      )),
    );
  }

  return mergeCatalogHits(collected);
}
