"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { Heart } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PRESETS = [1, 3, 5] as const;

export function TipSupportCard({ enabled, compact = false }: { enabled: boolean; compact?: boolean }) {
  const [amountStr, setAmountStr] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function startCheckout() {
    const amountEur = Number.parseFloat(amountStr.replace(",", "."));
    if (!Number.isFinite(amountEur) || amountEur < 0.5 || amountEur > 200) {
      setError("Enter an amount between €0.50 and €200.");
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
        setError(typeof payload.error === "string" ? payload.error : "Could not start checkout.");
        return;
      }
      window.location.href = payload.data.url;
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!enabled) {
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed border-border/80 bg-muted/25 text-muted-foreground",
          compact ? "px-3 py-2 text-[11px] leading-snug" : "px-4 py-3.5 text-[13px] leading-relaxed",
        )}
      >
        {compact ? (
          <>Tips off — set Stripe keys in deploy.</>
        ) : (
          <>
            Tips are not enabled in this environment. Add{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">STRIPE_SECRET_KEY</code> and{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">NEXT_PUBLIC_APP_URL</code> in production to turn them
            on.
          </>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-classmates-edge bg-classmates-surface shadow-[0_2px_10px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card",
        compact ? "p-3" : "p-4 shadow-[0_4px_14px_rgba(15,23,42,0.04)] rounded-2xl",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-lg bg-rose-500/12 text-rose-600 dark:text-rose-400",
            compact ? "h-8 w-8" : "h-11 w-11 rounded-xl",
          )}
        >
          <Heart className={compact ? "h-4 w-4" : "h-5 w-5"} strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("font-semibold leading-tight text-foreground", compact ? "text-[13px]" : "text-[14px]")}>
            Tip
          </p>
          {!compact ? (
            <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
              Optional tip, defaults to €1. Choose any amount from €0.50–€200. Paid securely with Stripe.
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">€0.50–€200 · Stripe</p>
          )}
        </div>
      </div>

      <div className={cn("flex flex-wrap gap-2", compact ? "mt-2" : "mt-3")}>
        {PRESETS.map((e) => {
          const active = amountStr === String(e);
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
                "rounded-full border font-semibold transition",
                compact ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-[12px]",
                active
                  ? "border-classmates-azure bg-classmates-azure/15 text-classmates-azure"
                  : "border-border/80 bg-background text-muted-foreground hover:bg-muted/50",
              )}
            >
              €{e}
            </button>
          );
        })}
      </div>

      <div className={cn("flex flex-col gap-2 sm:flex-row sm:items-end", compact ? "mt-2" : "mt-3")}>
        <div className="min-w-0 flex-1">
          <label
            htmlFor="tip-amount-eur"
            className={cn("mb-1 block font-medium text-muted-foreground", compact ? "text-[10px]" : "text-[11px]")}
          >
            €
          </label>
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
            className={cn("max-w-[10rem]", compact && "h-9 text-sm")}
          />
        </div>
        <Button
          type="button"
          className={cn("shrink-0", compact ? "h-9 sm:min-w-[7rem] text-[12px]" : "sm:min-w-[8.5rem]")}
          disabled={busy}
          onClick={() => void startCheckout()}
        >
          {busy ? "Redirecting…" : "Continue to pay"}
        </Button>
      </div>

      {error ? (
        <p className={cn("text-destructive", compact ? "mt-1.5 text-[11px]" : "mt-2 text-[12px]")}>{error}</p>
      ) : null}
    </div>
  );
}
