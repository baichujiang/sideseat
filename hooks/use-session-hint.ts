"use client";

import { useEffect, useState } from "react";

export type SessionHint = {
  signedIn: boolean;
  isGuest: boolean;
};

/** Lightweight client read of refresh cookie state (guest vs full account). */
export function useSessionHint(): SessionHint | null {
  const [hint, setHint] = useState<SessionHint | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch("/api/auth/refresh", {
          method: "POST",
          credentials: "include",
        });
        if (cancelled) return;
        if (!res.ok) {
          setHint({ signedIn: false, isGuest: true });
          return;
        }
        const body = (await res.json()) as { data?: { isGuest?: boolean } };
        setHint({
          signedIn: true,
          isGuest: body.data?.isGuest === true,
        });
      } catch {
        if (!cancelled) setHint({ signedIn: false, isGuest: true });
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return hint;
}
