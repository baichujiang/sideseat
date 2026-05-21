"use client";

import { apiFetch } from "@/lib/auth/api-fetch";
import type { ScheduleShareChatPreviewPayload } from "@/lib/schedule-share/chat-preview-types";

export type { ScheduleShareChatPreviewPayload } from "@/lib/schedule-share/chat-preview-types";

const cache = new Map<string, ScheduleShareChatPreviewPayload | null>();

export function getCachedScheduleShareChatPreview(token: string): ScheduleShareChatPreviewPayload | null | undefined {
  if (!cache.has(token)) return undefined;
  return cache.get(token) ?? null;
}

export function primeScheduleShareChatPreviewCache(
  token: string,
  preview: ScheduleShareChatPreviewPayload | null,
): void {
  cache.set(token, preview);
}

export async function loadScheduleShareChatPreview(
  token: string,
): Promise<ScheduleShareChatPreviewPayload | null> {
  const cached = getCachedScheduleShareChatPreview(token);
  if (cached !== undefined) return cached;

  try {
    const res = await apiFetch(`/api/schedule-shares/chat-preview/${encodeURIComponent(token)}`);
    const body = (await res.json().catch(() => null)) as {
      success?: boolean;
      data?: ScheduleShareChatPreviewPayload;
    } | null;
    if (!res.ok || !body?.success || !body.data?.snapshot) {
      cache.set(token, null);
      return null;
    }
    cache.set(token, body.data);
    return body.data;
  } catch {
    cache.set(token, null);
    return null;
  }
}
