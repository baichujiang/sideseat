"use client";

import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { setAccessToken } from "@/lib/auth/client-access-token";
import { isPublicAppPath } from "@/lib/nav/public-app-path";

/**
 * On app load: POST `/api/auth/refresh` with refresh cookie → in-memory access JWT.
 * 401 on non-public routes → redirect to login.
 */
export function AuthBootstrap() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
        if (cancelled) return;
        if (res.ok) {
          const body = (await res.json()) as { data?: { accessToken?: string } };
          if (body.data?.accessToken) {
            setAccessToken(body.data.accessToken);
          }
          return;
        }
        if (res.status === 401) {
          setAccessToken(null);
          if (!isPublicAppPath(pathname)) {
            const returnTo = `${pathname}${typeof window !== "undefined" ? window.location.search : ""}`;
            router.replace(
              `/login?returnTo=${encodeURIComponent(returnTo)}` as Route,
            );
          }
        }
      } catch {
        if (!cancelled) setAccessToken(null);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return null;
}
