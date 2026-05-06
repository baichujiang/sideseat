"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

import { setAccessToken } from "@/lib/auth/client-access-token";

/**
 * Clears HttpOnly refresh cookie (via API) and in-memory access JWT, then opens `/login`.
 */
export function LogoutForm({ children, className }: { children: ReactNode; className?: string }) {
  const router = useRouter();

  return (
    <form
      className={className}
      onSubmit={async (e) => {
        e.preventDefault();
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        setAccessToken(null);
        router.push("/login");
        router.refresh();
      }}
    >
      {children}
    </form>
  );
}
