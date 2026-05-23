"use client";

import type { Route } from "next";

import { LinkButton } from "@/components/ui/link-button";
import { useAppMessages } from "@/hooks/use-app-locale";
import { withReturnTo } from "@/lib/nav/back";

/**
 * Compact login / signup entry for Home and Me — not a full-page gate.
 */
export function GuestAuthBar({ returnTo }: { returnTo: string }) {
  const m = useAppMessages();
  const loginHref = withReturnTo("/login", returnTo) as Route;
  const signupHref = withReturnTo("/signup", returnTo) as Route;

  return (
    <div className="flex items-center justify-center gap-2 rounded-2xl border border-border/50 bg-card/80 px-3 py-2.5">
      <LinkButton href={loginHref} variant="outline" size="sm" className="min-h-9 flex-1">
        {m.guest.logIn}
      </LinkButton>
      <LinkButton href={signupHref} size="sm" className="min-h-9 flex-1">
        {m.guest.createAccount}
      </LinkButton>
    </div>
  );
}
