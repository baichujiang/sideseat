"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { GuestAuthBar } from "@/components/app/guest-auth-bar";
import { OfflineStateCard } from "@/components/offline/offline-state-card";
import { setAccessToken } from "@/lib/auth/client-access-token";
import { useAppMessages } from "@/hooks/use-app-locale";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { Button } from "@/components/ui/button";

type Phase = "loading" | "error";

/**
 * Server had no session (cookie pending or DB was down). Client creates guest + bot chat.
 */
export function InboxSessionBootstrap() {
  const router = useRouter();
  const m = useAppMessages();
  const isOnline = useOnlineStatus();
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  const bootstrap = useCallback(async () => {
    if (!isOnline) {
      setPhase("error");
      setErrorDetail(m.offline.inboxNeedsInternetBody);
      return;
    }
    setPhase("loading");
    setErrorDetail(null);
    try {
      const guestRes = await fetch("/api/auth/ensure-guest", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const guestBody = await guestRes.json().catch(() => ({}));
      if (!guestRes.ok) {
        const msg =
          typeof guestBody.error === "string"
            ? guestBody.error
            : guestRes.status === 503
              ? m.inbox.dbUnavailableBody
              : m.inbox.sessionBootstrapFailed;
        setErrorDetail(msg);
        setPhase("error");
        return;
      }
      if (guestBody.data?.accessToken) {
        setAccessToken(guestBody.data.accessToken);
      }
      const refreshRes = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });
      if (refreshRes.ok) {
        const refreshBody = (await refreshRes.json()) as { data?: { accessToken?: string } };
        if (refreshBody.data?.accessToken) {
          setAccessToken(refreshBody.data.accessToken);
        }
      }
      router.refresh();
    } catch {
      setErrorDetail(m.inbox.sessionBootstrapFailed);
      setPhase("error");
    }
  }, [isOnline, m.inbox.dbUnavailableBody, m.inbox.sessionBootstrapFailed, m.offline.inboxNeedsInternetBody, router]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (phase === "error") {
    if (!isOnline) {
      return (
        <div className="space-y-4 px-1 py-6">
          <header className="text-center">
            <h1 className="page-screen-title">{m.inbox.screenTitle}</h1>
          </header>
          <OfflineStateCard
            title={m.offline.needsInternetTitle}
            description={m.offline.inboxNeedsInternetBody}
          />
          <GuestAuthBar returnTo="/inbox" />
        </div>
      );
    }

    return (
      <div className="space-y-4 px-1 py-6">
        <header className="text-center">
          <h1 className="page-screen-title">{m.inbox.screenTitle}</h1>
          <p className="page-screen-subtitle mt-1 text-destructive/90">
            {m.inbox.dbUnavailableTitle}
          </p>
          {errorDetail ? (
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{errorDetail}</p>
          ) : null}
        </header>
        <div className="flex justify-center gap-2">
          <Button type="button" variant="outline" onClick={() => void bootstrap()}>
            {m.inbox.retryBootstrap}
          </Button>
        </div>
        <GuestAuthBar returnTo="/inbox" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 px-4 text-center">
      <p className="text-[14px] text-muted-foreground">{m.common.loading}</p>
      <p className="text-[12px] text-muted-foreground/80">{m.inbox.sessionBootstrapHint}</p>
    </div>
  );
}
