"use client";

import Link from "next/link";
import type { Route } from "next";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  DiscoverMessageButton,
  discoverPrimarySolidCtaClassName,
} from "@/components/discover/discover-message-button";
import type { DiscoverActivityRow } from "@/lib/discover/discover-activity-row";
import type { DiscoverActivityPhase } from "@/lib/discover/discover-activity-state";
import { apiFetch } from "@/lib/auth/api-fetch";
import { useAppMessages } from "@/hooks/use-app-locale";
import { cn } from "@/lib/utils";

function resolveApiError(payload: { error?: string; code?: string }, fallback: string, errors: Record<string, string>) {
  if (payload.code && payload.code in errors) {
    return errors[payload.code as keyof typeof errors];
  }
  return payload.error ?? fallback;
}

export function DiscoverActivityBottomBar({
  activity,
  phase,
  variant,
  viewerHasExistingChat,
  signInHref,
  activityPath,
}: {
  activity: DiscoverActivityRow;
  phase: DiscoverActivityPhase;
  variant: "guest" | "peer" | "organizer";
  viewerHasExistingChat: boolean;
  signInHref?: Route;
  activityPath: string;
}) {
  const router = useRouter();
  const m = useAppMessages();
  const da = m.discoverActivity;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isGoing = activity.viewerSignupStatus === "GOING";

  async function toggleSignup() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/api/discover-activities/${activity.id}/signups`,
        isGoing ? { method: "DELETE" } : { method: "POST" },
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 204) {
        throw new Error(resolveApiError(payload, da.signupFailed, da.errors));
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : da.signupFailed);
    } finally {
      setBusy(false);
    }
  }

  async function organizerAction(action: "close" | "cancel") {
    if (busy) return;
    const confirmMsg = action === "close" ? da.confirmClose : da.confirmCancel;
    if (!window.confirm(confirmMsg)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/discover-activities/${activity.id}/${action}`, { method: "POST" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.success) {
        throw new Error(resolveApiError(payload, da.actionFailed, da.errors));
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : da.actionFailed);
    } finally {
      setBusy(false);
    }
  }

  const showJoin = variant === "peer" && phase === "bookable" && !isGoing;
  const showLeave = variant === "peer" && isGoing && (phase === "bookable" || phase === "full");
  const showMessage =
    variant === "peer" && phase !== "canceled" && phase !== "expired";

  const statusNote =
    phase === "expired"
      ? da.phaseExpired
      : phase === "canceled"
        ? da.phaseCanceled
        : phase === "closed"
          ? da.phaseClosed
          : phase === "full" && !isGoing
            ? da.phaseFull
            : null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border/60 bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_24px_rgba(15,23,42,0.06)] backdrop-blur-sm dark:bg-background/90">
      {statusNote ? (
        <p className="mb-2 text-center text-[12px] text-muted-foreground">{statusNote}</p>
      ) : null}
      {error ? <p className="mb-2 text-center text-[12px] text-destructive">{error}</p> : null}

      {variant === "guest" && signInHref ? (
        <Link href={signInHref} className={cn(discoverPrimarySolidCtaClassName, "text-center no-underline")}>
          {da.signInToJoin}
        </Link>
      ) : null}

      {variant === "organizer" ? (
        <div className="flex flex-col gap-2">
          {(phase === "bookable" || phase === "full") && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void organizerAction("close")}
              className="h-11 w-full rounded-xl border border-border bg-card text-[14px] font-semibold"
            >
              {da.closeSignup}
            </button>
          )}
          {phase !== "expired" && phase !== "canceled" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void organizerAction("cancel")}
              className="h-11 w-full rounded-xl border border-destructive/40 text-[14px] font-semibold text-destructive"
            >
              {da.cancelActivity}
            </button>
          )}
        </div>
      ) : null}

      {variant === "peer" ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          {showMessage ? (
            <DiscoverMessageButton
              peerId={activity.organizerId}
              returnTo={activityPath}
              tone="outline"
              hasExistingChat={viewerHasExistingChat}
              label={viewerHasExistingChat ? da.messageOrganizer : da.contactOrganizer}
              className="sm:flex-1"
            />
          ) : null}
          {showJoin ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void toggleSignup()}
              className={cn(discoverPrimarySolidCtaClassName, "sm:flex-1")}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : da.joinCta}
            </button>
          ) : null}
          {showLeave ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void toggleSignup()}
              className="h-11 w-full rounded-xl border border-border bg-card text-[14px] font-semibold sm:flex-1"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : da.leaveCta}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
