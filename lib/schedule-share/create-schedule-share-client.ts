"use client";

import { apiFetch } from "@/lib/auth/api-fetch";
import { buildDefaultScheduleShareCreatePayload } from "@/lib/schedule-share/default-create-payload";
import { withReturnTo } from "@/lib/nav/back";
import { scheduleShareOwnerEditPathFromRecipientUrl } from "@/lib/schedule-share/share-link-urls";

export async function createScheduleSharePath(
  messages: { createFailed: string; networkError: string },
  options?: { returnTo?: string | null },
): Promise<{ ok: true; path: string; shareUrl: string } | { ok: false; error: string }> {
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

  const editPath = scheduleShareOwnerEditPathFromRecipientUrl(shareUrl);
  return {
    ok: true,
    path: options?.returnTo ? withReturnTo(editPath, options.returnTo) : editPath,
    shareUrl,
  };
}
