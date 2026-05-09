"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { MessageSquarePlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Topic = "bug" | "idea" | "other";

const TOPICS: { value: Topic; label: string; hint: string }[] = [
  { value: "bug", label: "Bug", hint: "Something broken or confusing" },
  { value: "idea", label: "Idea", hint: "A feature you would like" },
  { value: "other", label: "Other", hint: "Anything else" },
];

export function FeedbackFormCard({
  mailtoHref,
  compact = false,
  variant = "card",
}: {
  /** Optional mailto when users prefer email (shown alongside in-app submit). */
  mailtoHref: string | null;
  compact?: boolean;
  /** `header` — compact control for the Me page toolbar (opens the same dialog). */
  variant?: "card" | "header";
}) {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState<Topic>("other");
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
      setError("Please write at least 10 characters.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const res = await apiFetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, message: trimmed }),
      });
      const payload = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !payload.success) {
        setError(typeof payload.error === "string" ? payload.error : "Could not send feedback.");
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

  const showMailtoInDialog = variant === "header" && Boolean(mailtoHref);

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
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  Your message is saved for the team. If email is configured on the server, we also get a copy. The more
                  detail you add, the easier it is for us to act on it.
                </p>
                <div className="flex flex-wrap gap-2">
                  {TOPICS.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      disabled={busy}
                      onClick={() => setTopic(t.value)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-left text-[12px] font-semibold transition",
                        topic === t.value
                          ? "border-classmates-azure bg-classmates-azure/12 text-classmates-azure"
                          : "border-border/80 bg-muted/30 text-muted-foreground hover:bg-muted/50",
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={busy}
                  placeholder="For example: On Discover, when I filter by course…"
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
              <div className="flex flex-col gap-2 border-t border-border/60 px-4 py-3 sm:flex-row">
                {showMailtoInDialog && mailtoHref ? (
                  <a
                    href={mailtoHref}
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "inline-flex h-11 flex-1 items-center justify-center rounded-full text-center text-sm font-semibold",
                    )}
                  >
                    Email us
                  </a>
                ) : null}
                <Button
                  type="button"
                  className={cn(showMailtoInDialog ? "h-11 flex-1" : "w-full")}
                  disabled={busy}
                  onClick={() => void submit()}
                >
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
          size="sm"
          className="shrink-0 gap-1.5 rounded-full px-3.5 text-[13px] font-semibold"
          onClick={() => setOpen(true)}
        >
          <MessageSquarePlus className="h-4 w-4" strokeWidth={2} aria-hidden />
          Feedback
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
              <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
                Tell us what is wrong or what you wish the app could do.
              </p>
            ) : null}
          </div>
        </div>
        <div className={cn("flex flex-col gap-2 sm:flex-row", compact ? "mt-2" : "mt-3")}>
          <Button type="button" className={cn("flex-1", compact && "h-9 text-[13px]")} onClick={() => setOpen(true)}>
            Write feedback
          </Button>
          {mailtoHref ? (
            <a
              href={mailtoHref}
              className={cn(
                buttonVariants({ variant: "outline" }),
                "inline-flex flex-1 items-center justify-center rounded-full text-center font-semibold",
                compact ? "h-9 text-[13px]" : "h-11 text-sm",
              )}
            >
              Email us
            </a>
          ) : null}
        </div>
        {!mailtoHref && !compact ? (
          <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
            Optional: set <code className="rounded bg-muted px-1">NEXT_PUBLIC_SUPPORT_EMAIL</code> to show the email
            button. With Resend and a feedback inbox configured, the team also gets messages by email.
          </p>
        ) : null}
      </div>
      {modal}
    </>
  );
}
