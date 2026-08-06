"use client";

import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { getAccessToken, setAccessToken } from "@/lib/auth/client-access-token";
import { shouldAutoGuestSession } from "@/lib/nav/auto-guest-path";
import { isNativeWebPath } from "@/lib/nav/legacy-web-freeze";
import { isPublicAppPath } from "@/lib/nav/public-app-path";

async function refreshAccessToken(): Promise<"ok" | "guest" | "unauthorized" | "unavailable"> {
  try {
    const res = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
    if (res.ok) {
      const body = (await res.json()) as { data?: { accessToken?: string } };
      if (body.data?.accessToken) {
        setAccessToken(body.data.accessToken);
      }
      return "ok";
    }
    if (res.status === 401 || res.status === 503) {
      setAccessToken(null);
      return res.status === 401 ? "unauthorized" : "unavailable";
    }
    setAccessToken(null);
    return "unauthorized";
  } catch {
    setAccessToken(null);
    return "unavailable";
  }
}

/**
 * On app load: POST `/api/auth/refresh` with refresh cookie → in-memory access JWT.
 * 401 on non-public routes → redirect to login.
 *
 * Refresh runs once per mount — not on every tab navigation — to avoid competing with RSC.
 */
export function AuthBootstrap() {
  const pathname = usePathname();
  const router = useRouter();
  const bootstrappedRef = useRef(false);
  const [sessionReady, setSessionReady] = useState(false);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    let cancelled = false;
    const pathAtMount = pathnameRef.current;

    if (isNativeWebPath(pathAtMount)) {
      setSessionReady(true);
      return;
    }

    const run = async () => {
      try {
        const status = await refreshAccessToken();
        if (cancelled) return;

        if (status === "ok") return;

        if (status === "unauthorized" || status === "unavailable") {
          if (shouldAutoGuestSession(pathAtMount)) {
            const guestRes = await fetch("/api/auth/ensure-guest", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: "{}",
            });
            if (!cancelled && guestRes.ok) {
              const again = await refreshAccessToken();
              if (!cancelled && again === "ok") {
                router.refresh();
                return;
              }
            }
          }
          if (status === "unauthorized" && !isPublicAppPath(pathAtMount)) {
            const returnTo = `${pathAtMount}${typeof window !== "undefined" ? window.location.search : ""}`;
            router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}` as Route);
          }
        }
      } finally {
        if (!cancelled) setSessionReady(true);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!sessionReady) return;
    if (getAccessToken()) return;
    if (isPublicAppPath(pathname) || shouldAutoGuestSession(pathname)) return;
    const returnTo = `${pathname}${typeof window !== "undefined" ? window.location.search : ""}`;
    router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}` as Route);
  }, [sessionReady, pathname, router]);

  return null;
}
