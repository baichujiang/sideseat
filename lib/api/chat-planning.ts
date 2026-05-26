"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

type JsonResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type AvailabilitySharePayload = {
  visibilityMode: "FREE_BUSY";
  rangeStart?: string;
  rangeEnd?: string;
  includedDates?: string[];
  expiresAt?: string;
};

export type PlanRequestPayload = {
  title: string;
  location?: string;
  message?: string;
  startTime: string;
  endTime: string;
  receiverUserId?: string;
};

type AvailabilityShareData = {
  id: string;
  owner: { id: string; name: string };
  visibilityMode: "FREE_BUSY";
  status: "active" | "revoked" | "expired";
  rangeStart: string;
  rangeEnd: string;
  includedDates: string[];
  days: Array<{
    date: string;
    slots: Array<{
      startTime: string;
      endTime: string;
      status: "available";
      canSuggest: boolean;
    }>;
  }>;
};

const availabilityShareCache = new Map<string, AvailabilityShareData>();
const availabilityShareInFlight = new Map<string, Promise<AvailabilityShareData>>();

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const response = await apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = (await response.json().catch(() => ({}))) as JsonResult<T>;
  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error || "Request failed.");
  }
  return payload.data;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await apiFetch(url);
  const payload = (await response.json().catch(() => ({}))) as JsonResult<T>;
  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error || "Request failed.");
  }
  return payload.data;
}

export function createAvailabilityShare(
  connectionId: string,
  payload: AvailabilitySharePayload,
) {
  return postJson<{ share: { id: string } }>(
    `/api/connections/${connectionId}/availability-shares`,
    payload,
  );
}

export function getCachedAvailabilityShare(shareId: string): AvailabilityShareData | null {
  return availabilityShareCache.get(shareId) ?? null;
}

export function loadAvailabilityShare(shareId: string) {
  const cached = availabilityShareCache.get(shareId);
  if (cached) return Promise.resolve(cached);

  const inflight = availabilityShareInFlight.get(shareId);
  if (inflight) return inflight;

  const request = getJson<AvailabilityShareData>(`/api/availability-shares/${shareId}`)
    .then((data) => {
      availabilityShareCache.set(shareId, data);
      availabilityShareInFlight.delete(shareId);
      return data;
    })
    .catch((error) => {
      availabilityShareInFlight.delete(shareId);
      throw error;
    });

  availabilityShareInFlight.set(shareId, request);
  return request;
}

export function revokeAvailabilityShare(shareId: string) {
  return postJson<{ status: string }>(`/api/availability-shares/${shareId}/revoke`).then((payload) => {
    const cached = availabilityShareCache.get(shareId);
    if (cached) {
      availabilityShareCache.set(shareId, { ...cached, status: "revoked" });
    }
    return payload;
  });
}

export function createPlanRequestFromShare(
  shareId: string,
  payload: PlanRequestPayload,
) {
  return postJson<{ planRequest: { id: string } }>(
    `/api/availability-shares/${shareId}/plan-requests`,
    payload,
  );
}

export function createDirectPlanRequest(
  connectionId: string,
  payload: PlanRequestPayload,
) {
  return postJson<{ planRequest: { id: string } }>(
    `/api/connections/${connectionId}/plan-requests`,
    payload,
  );
}

export function acceptPlanRequest(requestId: string) {
  return postJson<{ status?: string }>(`/api/plan-requests/${requestId}/accept`);
}

export function declinePlanRequest(requestId: string) {
  return postJson<{ status?: string }>(`/api/plan-requests/${requestId}/decline`);
}

export function counterProposePlanRequest(
  requestId: string,
  payload: PlanRequestPayload,
) {
  return postJson<{ counter: { id: string } }>(
    `/api/plan-requests/${requestId}/counter-propose`,
    payload,
  );
}
