"use client";
import { useCallback, useEffect, useRef, useState } from "react";
export class WebApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}
/** The same versioned API and capability contract used by the native app. */
export async function webEnvelope<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<{
  data: T;
  meta?: {
    hasMore?: boolean;
    nextCursor?: string;
    realtimeCursor?: string;
  };
}> {
  const headers = new Headers({
    "Accept-Language": "zh-CN",
    "X-SideSeat-Platform": "web",
    "X-SideSeat-Persistent-Intent": "1",
    "X-SideSeat-Flexible-Timing": "1",
    "X-SideSeat-Discovery-Matching": "1",
  });
  if (method !== "GET") headers.set("Idempotency-Key", crypto.randomUUID());
  if (body !== undefined) headers.set("Content-Type", "application/json");
  // Web sessions use the shared HttpOnly cookie; an expired in-memory native JWT
  // must never shadow a valid browser session or sign the user out after 15 min.
  const response = await fetch(path, {
    method,
    headers,
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
    cache: "no-store",
  });
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    const error = payload.error;
    throw new WebApiError(
      typeof error === "string"
        ? error
        : (error?.message ?? "暂时无法完成，请重试。"),
      response.status,
      error?.code,
    );
  }
  return payload;
}
export async function webRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  return (await webEnvelope<T>(path, method, body, signal)).data;
}
export function refreshWebData() {
  window.dispatchEvent(new Event("sideseat:web-refresh"));
}
/** Refresh on focus and while visible, so native changes arrive without a reload. */
export function useWebResource<T>(path: string | null, interval = 15000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!!path);
  const [revision, setRevision] = useState(0);
  const previousPath = useRef<string | null>(null);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!path) {
      setData(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setInterval> | undefined;
    const load = async () => {
      try {
        const next = await webRequest<T>(
          path,
          "GET",
          undefined,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setData(next);
          setError("");
        }
      } catch (cause) {
        if (controller.signal.aborted) return;
        if (cause instanceof WebApiError && cause.status === 401) {
          window.location.assign("/web/login");
          return;
        }
        setError(cause instanceof Error ? cause.message : "加载失败，请重试。");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    if (previousPath.current !== path) {
      setData(null);
      setLoading(true);
    }
    previousPath.current = path;
    setError("");
    void load();
    const visibleLoad = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", visibleLoad);
    window.addEventListener("sideseat:web-refresh", visibleLoad);
    if (interval) timer = setInterval(visibleLoad, interval);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", visibleLoad);
      window.removeEventListener("sideseat:web-refresh", visibleLoad);
    };
  }, [path, revision, interval]);
  return { data, setData, error, loading, reload };
}
export const browserTimeZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone;
export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function localInput(iso: string | Date) {
  const date = new Date(iso);
  return `${dateKey(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
export function prettyDate(iso: string, zone?: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    weekday: "short",
    timeZone: zone,
  }).format(new Date(iso));
}
export function clock(iso: string, zone?: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: zone,
  }).format(new Date(iso));
}
export function messageOf(cause: unknown) {
  return cause instanceof Error ? cause.message : "操作失败，请重试。";
}
