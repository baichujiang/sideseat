import { authHeaderInit } from "@/lib/auth/client-access-token";

/** Same-origin API fetch with refresh cookie + optional in-memory Bearer access token. */
export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const extra = new Headers(authHeaderInit());
  extra.forEach((value, key) => {
    headers.set(key, value);
  });
  return fetch(input, {
    ...init,
    credentials: init?.credentials ?? "include",
    headers,
  });
}
