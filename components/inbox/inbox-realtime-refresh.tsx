"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { apiFetch } from "@/lib/auth/api-fetch";

export function InboxRealtimeRefresh({
  version,
  intervalMs = 5000,
}: {
  version: string;
  intervalMs?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const staleRefreshAttempts = useRef(0);

  useEffect(() => {
    staleRefreshAttempts.current = 0;
  }, [version]);

  useEffect(() => {
    async function pollInboxState() {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;

      const response = await apiFetch("/api/inbox/state", {
        cache: "no-store",
      }).catch(() => null);
      if (!response?.ok) return;

      const payload = await response.json().catch(() => null);
      const remoteVersion = payload?.data?.version;
      if (typeof remoteVersion !== "string") return;

      if (remoteVersion !== version) {
        staleRefreshAttempts.current += 1;
        window.dispatchEvent(new Event("sideseat:inbox-unread-changed"));
        router.refresh();

        if (staleRefreshAttempts.current >= 2) {
          const query = searchParams.toString();
          window.location.replace(query ? `${pathname}?${query}` : pathname);
        }
      } else {
        staleRefreshAttempts.current = 0;
      }
    }

    const id = window.setInterval(() => {
      void pollInboxState();
    }, intervalMs);
    const onFocus = () => void pollInboxState();

    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [intervalMs, pathname, router, searchParams, version]);

  return null;
}
