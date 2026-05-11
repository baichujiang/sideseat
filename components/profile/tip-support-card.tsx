"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { ChevronDown, Heart, Lock } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MeSettingsRowLabel,
  meSettingsRowCardSummaryClass,
  meSettingsRowChevronDownClass,
  meSettingsRowDetailsSummaryClass,
  meSettingsRowLeadClass,
  meSettingsRowTipIconShellClass,
} from "@/components/profile/me-settings-row";
import type { AppMessages } from "@/lib/i18n/messages/types";
import { cn } from "@/lib/utils";

type TipPresetEur = 1 | 3 | 5;

const PRESETS: { eur: TipPresetEur; msgKey: "preset1" | "preset3" | "preset5" }[] = [
  { eur: 1, msgKey: "preset1" },
  { eur: 3, msgKey: "preset3" },
  { eur: 5, msgKey: "preset5" },
];

function resolvedAmountEur(selectedPreset: TipPresetEur | null, customFieldStr: string): number | null {
  if (selectedPreset !== null) return selectedPreset;
  const trimmed = customFieldStr.trim();
  if (!trimmed) return null;
  const n = Number.parseFloat(trimmed.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function TipSupportCard({
  enabled,
  compact = false,
  inList = false,
  t,
}: {
  enabled: boolean;
  compact?: boolean;
  inList?: boolean;
  t: AppMessages["tip"];
}) {
  const [selectedPreset, setSelectedPreset] = useState<TipPresetEur | null>(3);
  const [customFieldStr, setCustomFieldStr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const amountEurResolved = resolvedAmountEur(selectedPreset, customFieldStr);
  const customAmountTrimmed = customFieldStr.trim();
  const customAmountParsed =
    customAmountTrimmed === "" ? null : Number.parseFloat(customAmountTrimmed.replace(",", "."));
  const customOutOfRange =
    selectedPreset === null &&
    customAmountParsed !== null &&
    Number.isFinite(customAmountParsed) &&
    (customAmountParsed < 0.5 || customAmountParsed > 200);
  const ctaAmountLabel =
    amountEurResolved !== null ? String(amountEurResolved) : "…";
  const ctaDisabled = busy || amountEurResolved === null || customOutOfRange;

  async function startCheckout() {
    const amountEur = amountEurResolved;
    if (amountEur === null || amountEur < 0.5 || amountEur > 200) {
      setError(t.errorRange);
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
        setError(typeof payload.error === "string" ? payload.error : t.errorCheckout);
        return;
      }
      window.location.href = payload.data.url;
    } catch {
      setError(t.errorNetwork);
    } finally {
      setBusy(false);
    }
  }

  if (!enabled) {
    return null;
  }

  const ctaLabel = busy ? t.ctaBusy : t.ctaButton.replace("{amount}", ctaAmountLabel);

  const stripeCheckoutFooter = (
    <p className="flex items-start justify-center gap-1.5 text-xs leading-snug text-muted-foreground">
      <Lock className="mt-0.5 h-3 w-3 shrink-0 opacity-60" strokeWidth={2} aria-hidden />
      <span className="text-center">
        {t.stripeNotice}
        {" — "}
        {t.stripeNoCard}
      </span>
    </p>
  );

  const amountAndCta = (
    <div>
      <p className="mb-1 font-medium uppercase tracking-wide text-muted-foreground text-[10px]">{t.chooseAmount}</p>
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
          {PRESETS.map(({ eur, msgKey }) => {
            const active = selectedPreset === eur;
            return (
              <button
                key={eur}
                type="button"
                disabled={busy}
                onClick={() => {
                  setSelectedPreset(eur);
                  setCustomFieldStr("");
                  setError("");
                }}
                className={cn(
                  "flex h-9 w-full min-w-0 items-center justify-center rounded-full border px-2 text-[11px] font-semibold transition-all duration-150 active:scale-[0.97] sm:text-[11.5px]",
                  active
                    ? "border-classmates-azure bg-classmates-azure/12 text-classmates-azure shadow-[0_0_0_1px_rgba(var(--classmates-azure-rgb,59,130,246),0.15)] dark:bg-classmates-azure/20"
                    : "border-border/70 bg-background text-foreground/80 [@media(hover:hover)]:hover:border-classmates-azure/40 [@media(hover:hover)]:hover:bg-classmates-azure/5 [@media(hover:hover)]:hover:text-classmates-azure",
                )}
              >
                {t[msgKey]}
              </button>
            );
          })}
          <div className="min-w-0">
            <div className="relative h-9 w-full">
              <span
                className="pointer-events-none absolute left-2.5 top-1/2 z-[1] -translate-y-1/2 text-sm font-medium text-muted-foreground"
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
                value={selectedPreset !== null ? "" : customFieldStr}
                onFocus={() => {
                  setSelectedPreset(null);
                  setError("");
                }}
                onChange={(e) => {
                  setSelectedPreset(null);
                  setCustomFieldStr(e.target.value);
                  setError("");
                }}
                placeholder={t.customPlaceholder}
                className="h-9 w-full pl-7 text-sm placeholder:text-muted-foreground/60"
                aria-label={t.customHint}
                aria-invalid={customOutOfRange || undefined}
                aria-describedby={
                  customOutOfRange ? "tip-amount-range-warning tip-amount-hint" : "tip-amount-hint"
                }
              />
            </div>
            <span id="tip-amount-hint" className="sr-only">
              {t.amountInputHint}
            </span>
          </div>
        </div>
        {customOutOfRange ? (
          <p
            id="tip-amount-range-warning"
            role="status"
            aria-live="polite"
            className="text-[11px] leading-snug text-amber-600 dark:text-amber-400"
          >
            {t.errorRange}
          </p>
        ) : null}
        <Button
          type="button"
          className="h-9 w-full shrink-0 rounded-full bg-classmates-azure text-[12px] text-white shadow-sm transition-all duration-150 [@media(hover:hover)]:hover:bg-classmates-azure/90 [@media(hover:hover)]:hover:shadow-md"
          disabled={ctaDisabled}
          onClick={() => void startCheckout()}
        >
          {ctaLabel}
        </Button>
      </div>
    </div>
  );

  const controls = (
    <div className="space-y-2.5">
      {amountAndCta}
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
      {stripeCheckoutFooter}
    </div>
  );

  const expandedIntro = (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600/80 dark:text-amber-400/70">
        {t.cardLabel}
      </p>
      <p className="mt-0.5 text-[12.5px] font-semibold leading-snug text-foreground">{t.expandedHeading}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/90">{t.expandedBody}</p>
    </div>
  );

  const expandedPanel = (
    <div className="border-t border-classmates-hairline bg-gradient-to-b from-amber-50/35 to-transparent px-3 py-2.5 dark:border-border/60 dark:from-amber-950/10">
      <div
        className={cn(
          "space-y-2.5 rounded-xl border border-border/65 bg-classmates-surface shadow-[0_1px_3px_rgba(15,23,42,0.03)] dark:bg-card/85",
          compact ? "p-2.5" : "p-2.5 sm:p-3",
        )}
      >
        {expandedIntro}
        {controls}
      </div>
    </div>
  );

  const summaryRow = (
    <>
      <div className={meSettingsRowLeadClass}>
        <span className={meSettingsRowTipIconShellClass}>
          <Heart className="h-4 w-4" strokeWidth={2} aria-hidden />
        </span>
        <MeSettingsRowLabel title={t.listTitle} subtitle={t.listSubtitle} />
      </div>
      <ChevronDown className={meSettingsRowChevronDownClass} strokeWidth={2} aria-hidden />
    </>
  );

  if (inList) {
    return (
      <details className="group">
        <summary className={meSettingsRowDetailsSummaryClass}>
          {summaryRow}
        </summary>
        {expandedPanel}
      </details>
    );
  }

  return (
    <details
      className={cn(
        "group overflow-hidden rounded-xl border border-classmates-edge bg-classmates-surface shadow-[0_1px_6px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card",
        compact && "rounded-lg",
      )}
    >
      <summary className={cn(meSettingsRowCardSummaryClass, compact && "py-2")}>{summaryRow}</summary>
      {expandedPanel}
    </details>
  );
}
