"use client";

import { PlanType } from "@prisma/client";

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
  planType: PlanType;
  title: string;
  location?: string;
  message?: string;
  startTime: string;
  endTime: string;
  receiverUserId?: string;
};

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
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
  const response = await fetch(url);
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

export function loadAvailabilityShare(shareId: string) {
  return getJson<{
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
  }>(`/api/availability-shares/${shareId}`);
}

export function revokeAvailabilityShare(shareId: string) {
  return postJson<{ status: string }>(`/api/availability-shares/${shareId}/revoke`);
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
