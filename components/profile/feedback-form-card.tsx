"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { MessageSquarePlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function FeedbackFormCard({
  compact = false,
  variant = "card",
}: {
  compact?: boolean;
  /** `header` — icon control on the Me page toolbar (opens the same dialog). */
  variant?: "card" | "header";
}) {
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
      setError("Please write at least 10 characters so we can understand.");
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
        setError(typeof payload.error === "string" ? payload.error : "Could not send feedback. Try again later.");
        return;
      }
      setDone(true);
      setMessage("");
      window.setTimeout(() => {
        setOpen(false);
        setDone(false);
      }, 1400);
    } catch {
      setError("Network error. Please try again.");
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
              aria-label="Close"
              onClick={() => setOpen(false)}
            />
            <div className="relative z-[71] flex max-h-[min(92dvh,640px)] w-full max-w-lg flex-col rounded-t-3xl border border-border/80 bg-background shadow-2xl sm:rounded-3xl">
              <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                <h2 id="feedback-dialog-title" className="text-base font-semibold text-foreground">
                  Feedback
                </h2>
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                >
                  <X className="h-5 w-5" strokeWidth={2} />
                </button>
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
                <p className="text-[13px] leading-relaxed text-muted-foreground">Tell us what you want.</p>
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={busy}
                  placeholder="Anything you would like us to build or fix…"
                  rows={6}
                  maxLength={4000}
                />
                {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
                {done ? (
                  <p className="text-[13px] font-medium text-emerald-700 dark:text-emerald-400">
                    Submitted — thank you.
                  </p>
                ) : null}
              </div>
              <div className="border-t border-border/60 px-4 py-3">
                <Button type="button" className="w-full" disabled={busy} onClick={() => void submit()}>
                  {busy ? "Sending…" : "Submit feedback"}
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
          variant="outline"
          size="icon"
          className={cn(
            "h-10 w-10 shrink-0 rounded-full border-sky-300/70 bg-sky-50 text-sky-800 shadow-sm",
            "transition-colors active:scale-[0.97]",
            "[@media(hover:hover)]:hover:border-sky-400 [@media(hover:hover)]:hover:bg-sky-100",
            "dark:border-sky-700/60 dark:bg-sky-950/45 dark:text-sky-100",
            "dark:[@media(hover:hover)]:hover:border-sky-600 dark:[@media(hover:hover)]:hover:bg-sky-950/70",
          )}
          onClick={() => setOpen(true)}
          aria-label="Send feedback"
        >
          <MessageSquarePlus className="h-5 w-5" strokeWidth={2} aria-hidden />
        </Button>
        {modal}
      </>
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
              "flex shrink-0 items-center justify-center rounded-lg bg-sky-500/12 text-sky-700 dark:text-sky-400",
              compact ? "h-8 w-8" : "h-11 w-11 rounded-xl",
            )}
          >
            <MessageSquarePlus className={compact ? "h-4 w-4" : "h-5 w-5"} strokeWidth={2} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn("font-semibold leading-tight text-foreground", compact ? "text-[13px]" : "text-[14px]")}>
              Feedback
            </p>
            {!compact ? (
              <p className="mt-1 text-[12px] leading-snug text-muted-foreground">Tell us what you want.</p>
            ) : null}
          </div>
        </div>
        <div className={cn("mt-3")}>
          <Button type="button" className={cn("w-full", compact && "h-9 text-[13px]")} onClick={() => setOpen(true)}>
            Write feedback
          </Button>
        </div>
      </div>
      {modal}
    </>
  );
}
