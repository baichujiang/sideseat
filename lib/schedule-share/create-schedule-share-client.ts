"use client";

import { apiFetch } from "@/lib/auth/api-fetch";
import {
  buildDefaultScheduleShareCreatePayload,
  pathFromScheduleShareUrl,
} from "@/lib/schedule-share/default-create-payload";

export async function createScheduleSharePath(
  messages: { createFailed: string; networkError: string },
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const body = buildDefaultScheduleShareCreatePayload();

  let res: Response;
  try {
    res = await apiFetch("/api/schedule-shares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: messages.networkError };
  }

  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload.success !== true) {
    const msg = typeof payload.error === "string" ? payload.error : messages.createFailed;
    return { ok: false, error: msg };
  }

  const shareUrl = payload.data?.shareUrl;
  if (typeof shareUrl !== "string") {
    return { ok: false, error: messages.createFailed };
  }

  return { ok: true, path: pathFromScheduleShareUrl(shareUrl) };
}
