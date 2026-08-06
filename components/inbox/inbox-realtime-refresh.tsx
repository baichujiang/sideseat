"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { apiFetch } from "@/lib/auth/api-fetch";
import { INBOX_POLL_INTERVAL_MS } from "@/lib/constants/app";

export function InboxRealtimeRefresh({
  version,
  intervalMs = INBOX_POLL_INTERVAL_MS,
}: {
  version: string;
  intervalMs?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const staleRefreshAttempts = useRef(0);
  const routeDepartureStarted = useRef(false);

  useEffect(() => {
    staleRefreshAttempts.current = 0;
  }, [version]);

  useEffect(() => {
    const markRouteDeparture = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      if (`${destination.pathname}${destination.search}` !== `${pathname}${window.location.search}`) {
        routeDepartureStarted.current = true;
      }
    };

    document.addEventListener("click", markRouteDeparture, true);
    return () => document.removeEventListener("click", markRouteDeparture, true);
  }, [pathname]);

  useEffect(() => {
    async function pollInboxState() {
      if (
        routeDepartureStarted.current ||
        window.location.pathname !== pathname ||
        document.visibilityState !== "visible" ||
        !navigator.onLine
      ) {
        return;
      }

      const response = await apiFetch("/api/inbox/state", {
        cache: "no-store",
      }).catch(() => null);
      if (!response?.ok) return;

      const payload = await response.json().catch(() => null);
      const remoteVersion = payload?.data?.version;
      if (typeof remoteVersion !== "string") return;

      if (remoteVersion !== version) {
        if (routeDepartureStarted.current || window.location.pathname !== pathname) return;
        staleRefreshAttempts.current += 1;
        window.dispatchEvent(new Event("sideseat:inbox-unread-changed"));
        router.refresh();

        if (
          staleRefreshAttempts.current >= 2 &&
          !routeDepartureStarted.current &&
          window.location.pathname === pathname
        ) {
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
    const onVis = () => {
      if (document.visibilityState === "visible") void pollInboxState();
    };

    void pollInboxState();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [intervalMs, pathname, router, searchParams, version]);

  return null;
}
