"use client";

import { apiFetch } from "@/lib/auth/api-fetch";
import { APP_NAME } from "@/lib/constants/app";

import { ChevronDown, Heart, Lock } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PRESETS = [1, 3, 5, 10] as const;

const listRowSummaryClasses =
  "flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 transition-colors active:bg-classmates-warm-alt dark:active:bg-muted/30 [&::-webkit-details-marker]:hidden [@media(hover:hover)]:hover:bg-classmates-warm-alt dark:[@media(hover:hover)]:hover:bg-muted/25";

function presetActive(amountStr: string, eur: number) {
  const n = Number.parseFloat(amountStr.replace(",", "."));
  return Number.isFinite(n) && Math.abs(n - eur) < 1e-9 && amountStr.trim() === String(eur);
}

export function TipSupportCard({
  enabled,
  compact = false,
  inList = false,
}: {
  enabled: boolean;
  compact?: boolean;
  inList?: boolean;
}) {
  const [amountStr, setAmountStr] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function startCheckout() {
    const amountEur = Number.parseFloat(amountStr.replace(",", "."));
    if (!Number.isFinite(amountEur) || amountEur < 0.5 || amountEur > 200) {
      setError("Pick any amount between €0.50 and €200.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const res = await apiFetch("/api/tip/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountEur }),
      });
      const payload = (await res.json()) as { success?: boolean; data?: { url?: string }; error?: string };
      if (!res.ok || !payload.success || typeof payload.data?.url !== "string") {
        setError(typeof payload.error === "string" ? payload.error : "We couldn’t open checkout — try again?");
        return;
      }
      window.location.href = payload.data.url;
    } catch {
      setError("We couldn’t reach the server. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  if (!enabled) {
    return null;
  }

  const tipIntro = !compact ? (
    <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
      {APP_NAME} stays free. If it’s been useful, a small tip helps keep things running — only if you want to, from €0.50
      up to €200.
    </p>
  ) : (
    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
      Free app · optional thanks · €0.50–€200 · Stripe
    </p>
  );

  const securityRow = (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border border-border/80 bg-muted/50 px-3 py-2 text-[11px] leading-snug text-muted-foreground dark:bg-muted/30",
        compact && "py-1.5",
      )}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-background text-foreground/80 shadow-sm dark:bg-card">
        <Lock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      </span>
      <span>
        <span className="font-medium text-foreground/90">Checkout is handled by Stripe</span>
        <span className="text-muted-foreground"> — we never see your card details.</span>
      </span>
    </div>
  );

  const faqLine = (
    <p className="text-[11px] leading-relaxed text-muted-foreground/90">
      Tips are voluntary gifts, not purchases. If something looks wrong, refunds follow{" "}
      <span className="whitespace-nowrap">Stripe’s</span> normal process.
    </p>
  );

  const presetGrid = (
    <div>
      <p
        className={cn(
          "mb-2 font-medium text-muted-foreground",
          compact || inList ? "text-[10px] uppercase tracking-wide" : "text-[11px]",
        )}
      >
        Choose an amount
      </p>
      <div className={cn("grid gap-2", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4")}>
        {PRESETS.map((e) => {
          const active = presetActive(amountStr, e);
          return (
            <button
              key={e}
              type="button"
              disabled={busy}
              onClick={() => {
                setAmountStr(String(e));
                setError("");
              }}
              className={cn(
                "rounded-2xl border font-semibold transition active:scale-[0.98]",
                compact ? "px-2 py-2 text-[12px]" : "px-3 py-2.5 text-[13px]",
                active
                  ? "border-classmates-azure bg-classmates-azure/15 text-classmates-azure shadow-sm"
                  : "border-border bg-background text-muted-foreground hover:border-border hover:bg-muted/60",
              )}
            >
              €{e}
            </button>
          );
        })}
      </div>
    </div>
  );

  const customAndCta = (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label htmlFor="tip-amount-eur" className="mb-1.5 block">
            <span
              className={cn(
                "font-medium text-foreground",
                compact || inList ? "text-[12px]" : "text-[13px]",
              )}
            >
              Custom amount
            </span>
            <span
              className={cn(
                "mt-0.5 block font-normal text-muted-foreground",
                compact || inList ? "text-[10px]" : "text-[11px]",
              )}
            >
              EUR · min €0.50, max €200
            </span>
          </label>
          <div className="relative max-w-[11rem]">
            <span
              className={cn(
                "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-medium text-muted-foreground",
                compact || inList ? "text-sm" : "text-base",
              )}
              aria-hidden
            >
              €
            </span>
            <Input
              id="tip-amount-eur"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              disabled={busy}
              value={amountStr}
              onChange={(e) => {
                setAmountStr(e.target.value);
                setError("");
              }}
              placeholder="1"
              className={cn("pl-7", (compact || inList) && "h-9 text-sm")}
              aria-describedby="tip-amount-hint"
            />
          </div>
          <span id="tip-amount-hint" className="sr-only">
            Enter amount in euros between 0.50 and 200
          </span>
        </div>
        <Button
          type="button"
          className={cn(
            "w-full shrink-0 sm:w-auto",
            compact || inList ? "h-9 sm:min-w-[9rem] text-[12px]" : "sm:min-w-[10rem]",
          )}
          disabled={busy}
          onClick={() => void startCheckout()}
        >
          {busy ? "Opening checkout…" : "Continue with Stripe"}
        </Button>
      </div>
    </div>
  );

  const controls = (
    <div className="space-y-3">
      {presetGrid}
      {customAndCta}
      {securityRow}
      {faqLine}
      {error ? (
        <p
          className={cn(
            "text-destructive",
            compact || inList ? "text-[11px]" : "text-[12px]",
          )}
        >
          {error}
        </p>
      ) : null}
    </div>
  );

  if (inList) {
    return (
      <details className="group">
        <summary className={listRowSummaryClasses}>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-500/12 text-rose-600 dark:text-rose-400">
              <Heart className="h-5 w-5" strokeWidth={2} aria-hidden />
            </span>
            <div className="min-w-0 text-left">
              <p className="text-[14px] font-semibold leading-tight text-foreground">Say thanks, if you like</p>
              <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                Optional · presets or custom · Stripe
              </p>
            </div>
          </div>
          <ChevronDown
            className="h-5 w-5 shrink-0 text-muted-foreground/50 transition-transform duration-200 group-open:rotate-180"
            strokeWidth={2}
            aria-hidden
          />
        </summary>
        <div className="border-t border-classmates-hairline bg-muted/20 px-4 py-4 dark:border-border/60">
          <div className="space-y-4 rounded-2xl border border-border bg-classmates-surface p-4 shadow-[0_1px_0_rgba(15,23,42,0.04)] dark:bg-card/80">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Support the app</p>
              <p className="mt-1 text-[13px] font-semibold leading-snug text-foreground">Thanks for using {APP_NAME}</p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                No pressure — chip in only if you want. Checkout opens in a secure Stripe window.
              </p>
            </div>
            {controls}
          </div>
        </div>
      </details>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-classmates-edge bg-classmates-surface shadow-[0_2px_10px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card",
        compact ? "border-border p-3" : "p-4 shadow-[0_4px_14px_rgba(15,23,42,0.04)]",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-xl bg-rose-500/12 text-rose-600 dark:text-rose-400",
            compact ? "h-8 w-8 rounded-lg" : "h-11 w-11",
          )}
        >
          <Heart className={compact ? "h-4 w-4" : "h-5 w-5"} strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Support the app</p>
          <p className={cn("mt-0.5 font-semibold leading-tight text-foreground", compact ? "text-[13px]" : "text-[15px]")}>
            Say thanks, if you like
          </p>
          {tipIntro}
        </div>
      </div>

      <div className={cn("mt-4 space-y-4 rounded-2xl border border-border bg-muted/25 p-4 dark:bg-muted/15", compact && "mt-3 p-3")}>
        {controls}
      </div>
    </div>
  );
}
