export type CronMonitorStatus = "succeeded" | "failed";

type CronMonitorEndpoint = {
  successUrl: string;
  failureUrl: string;
};

type CronMonitorMap = Record<string, CronMonitorEndpoint>;

function publicHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") return null;
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function parseCronMonitorUrls(raw: string): CronMonitorMap {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("CRON_MONITOR_URLS must be a JSON object.");
  }

  const result: CronMonitorMap = {};
  for (const [job, candidate] of Object.entries(parsed)) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new Error(`CRON_MONITOR_URLS.${job} must contain successUrl and failureUrl.`);
    }
    const endpoint = candidate as Record<string, unknown>;
    const successUrl = publicHttpsUrl(endpoint.successUrl);
    const failureUrl = publicHttpsUrl(endpoint.failureUrl);
    if (!successUrl || !failureUrl) {
      throw new Error(`CRON_MONITOR_URLS.${job} must use public HTTPS successUrl and failureUrl.`);
    }
    result[job] = { successUrl, failureUrl };
  }
  return result;
}

export function cronMonitorUrlFor(
  job: string,
  status: CronMonitorStatus,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  const configured = environment.CRON_MONITOR_URLS?.trim();
  if (configured) {
    const endpoint = parseCronMonitorUrls(configured)[job];
    if (!endpoint) return null;
    return status === "failed" ? endpoint.failureUrl : endpoint.successUrl;
  }

  // Backward compatibility for existing non-production installations.
  return publicHttpsUrl(environment.CRON_MONITOR_URL);
}
