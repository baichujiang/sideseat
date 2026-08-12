import "server-only";

import { cronMonitorUrlFor } from "@/lib/ops/cron-monitor-config";

export type ObservedCronJob =
  | "calendar-reminders"
  | "chat-realtime-retention"
  | "student-verification-retention"
  | "lmu-course-catalog"
  | "tum-course-catalog";

type CronMonitorPayload = {
  job: ObservedCronJob;
  status: "succeeded" | "failed";
  durationMs: number;
  occurredAt: string;
  error?: string;
};

const MONITOR_TIMEOUT_MS = 5_000;
const ERROR_MAX_LENGTH = 1_500;

function cronErrorMessage(cause: unknown) {
  return (cause instanceof Error ? cause.message : String(cause)).slice(0, ERROR_MAX_LENGTH);
}

async function reportCronResult(payload: CronMonitorPayload) {
  try {
    const monitorUrl = cronMonitorUrlFor(payload.job, payload.status);
    if (!monitorUrl) {
      console.error(`[cron-monitor] No monitor endpoint configured for ${payload.job}.`);
      return;
    }
    const response = await fetch(monitorUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(MONITOR_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(`[cron-monitor] ${payload.job} report returned ${response.status}.`);
    }
  } catch (cause) {
    console.error(`[cron-monitor] ${payload.job} report failed.`, cause);
  }
}

export async function runObservedCron<T>(
  job: ObservedCronJob,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await operation();
    await reportCronResult({
      job,
      status: "succeeded",
      durationMs: Date.now() - startedAt,
      occurredAt: new Date().toISOString(),
    });
    return result;
  } catch (cause) {
    await reportCronResult({
      job,
      status: "failed",
      durationMs: Date.now() - startedAt,
      occurredAt: new Date().toISOString(),
      error: cronErrorMessage(cause),
    });
    throw cause;
  }
}
