"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { ChevronRight, MessageSquareText, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import {
  MePageSettingsRowLabel,
  mePageChevronClass,
  mePageIconMutedClass,
  mePageIconShellClass,
  mePageRowButtonClass,
  mePageRowLeadClass,
  meSettingsRowFeedbackIconShellLargeClass,
  meSettingsRowFeedbackIconSurfaceClass,
} from "@/components/profile/me-settings-row";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAppMessages } from "@/hooks/use-app-locale";
import { cn } from "@/lib/utils";

export function FeedbackFormCard({
  compact = false,
  variant = "card",
}: {
  compact?: boolean;
  /** `header` — icon control on the Me page toolbar (opens the same dialog). `listRow` — full-width row in a divided list. */
  variant?: "card" | "header" | "listRow";
}) {
  const { meFeedback: f, common: c } = useAppMessages();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError("");
    setDone(false);
  }, [open]);

  async function submit() {
    const trimmed = message.trim();
    if (trimmed.length < 10) {
      setError(f.errorMinLength);
      return;
    }

    setBusy(true);
    setError("");
    try {
      const res = await apiFetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const payload = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !payload.success) {
        setError(typeof payload.error === "string" ? payload.error : f.errorSendFailed);
        return;
      }
      setDone(true);
      setMessage("");
      window.setTimeout(() => {
        setOpen(false);
        setDone(false);
      }, 1400);
    } catch {
      setError(f.errorNetwork);
    } finally {
      setBusy(false);
    }
  }

  const modal =
    open && portalReady && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-dialog-title"
          >
            <button
              type="button"
              className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
              aria-label={c.close}
              onClick={() => setOpen(false)}
            />
            <div className="relative z-[71] flex max-h-[min(92dvh,640px)] w-full max-w-lg flex-col rounded-t-3xl border border-border/80 bg-background shadow-2xl sm:rounded-3xl">
              <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                <h2 id="feedback-dialog-title" className="text-base font-semibold text-foreground">
                  {f.dialogTitle}
                </h2>
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted"
                  onClick={() => setOpen(false)}
                  aria-label={c.close}
                >
                  <X className="h-5 w-5" strokeWidth={2} />
                </button>
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
                <p className="text-[13px] leading-relaxed text-muted-foreground">{f.intro}</p>
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={busy}
                  placeholder={f.placeholder}
                  rows={6}
                  maxLength={4000}
                />
                {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
                {done ? (
                  <p className="text-[13px] font-medium text-emerald-700 dark:text-emerald-400">{f.successLine}</p>
                ) : null}
              </div>
              <div className="border-t border-border/60 px-4 py-3">
                <Button type="button" className="w-full" disabled={busy} onClick={() => void submit()}>
                  {busy ? f.submitBusy : f.submit}
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  if (variant === "header") {
    return (
      <>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            meSettingsRowFeedbackIconShellLargeClass,
            "transition-[filter,transform] hover:bg-transparent dark:hover:bg-transparent active:scale-[0.97]",
            "[@media(hover:hover)]:brightness-[1.04] dark:[@media(hover:hover)]:brightness-[1.07]",
          )}
          onClick={() => setOpen(true)}
          aria-label={f.sendFeedbackAria}
        >
          <MessageSquareText className="h-5 w-5" strokeWidth={2} aria-hidden />
        </Button>
        {modal}
      </>
    );
  }

  if (variant === "listRow") {
    return (
      <div className="contents">
        <button type="button" className={mePageRowButtonClass} onClick={() => setOpen(true)}>
          <div className={mePageRowLeadClass}>
            <span className={mePageIconShellClass}>
              <MessageSquareText className={mePageIconMutedClass} strokeWidth={2} aria-hidden />
            </span>
            <MePageSettingsRowLabel title={f.listRowTitle} subtitle={f.listRowSubtitle} />
          </div>
          <ChevronRight className={mePageChevronClass} strokeWidth={2} aria-hidden />
        </button>
        {modal}
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          "overflow-hidden rounded-xl border border-classmates-edge bg-classmates-surface dark:border-border dark:bg-card",
          compact ? "p-3 shadow-[0_2px_10px_rgba(15,23,42,0.04)]" : "p-4 shadow-[0_4px_14px_rgba(15,23,42,0.04)] rounded-2xl",
        )}
      >
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex shrink-0 items-center justify-center rounded-full",
              meSettingsRowFeedbackIconSurfaceClass,
              compact ? "h-8 w-8" : "h-11 w-11",
            )}
          >
            <MessageSquareText
              className={compact ? "h-4 w-4" : "h-5 w-5"}
              strokeWidth={compact ? 2.25 : 2}
              aria-hidden
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn("font-semibold leading-tight text-foreground", compact ? "text-[13px]" : "text-[14px]")}>
              {f.cardTitle}
            </p>
            {!compact ? (
              <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{f.cardSubtitle}</p>
            ) : null}
          </div>
        </div>
        <div className={cn("mt-3")}>
          <Button type="button" className={cn("w-full", compact && "h-9 text-[13px]")} onClick={() => setOpen(true)}>
            {f.writeButton}
          </Button>
        </div>
      </div>
      {modal}
    </>
  );
}
