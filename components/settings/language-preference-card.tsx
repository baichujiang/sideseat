"use client";

import { useId, useState } from "react";
import { ChevronDown, Languages } from "lucide-react";

import { useLocaleContext } from "@/components/i18n/locale-provider";
import { meSettingsRowListIconShellLargeClass } from "@/components/profile/me-settings-row";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/lib/i18n/app-locale";

const cardClass =
  "rounded-2xl border border-classmates-edge bg-classmates-surface shadow-[0_4px_14px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card";

export function LanguagePreferenceCard() {
  const { locale, messages: m, setAppLocale } = useLocaleContext();
  const optionsId = useId();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  const onPick = async (next: AppLocale) => {
    if (next === locale || busy) return;
    setBusy(true);
    try {
      await setAppLocale(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn(cardClass, "overflow-hidden")}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={optionsId}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors active:bg-classmates-warm-alt dark:active:bg-muted/30 [@media(hover:hover)]:hover:bg-classmates-warm-alt dark:[@media(hover:hover)]:hover:bg-muted/25"
        onClick={() => setExpanded((open) => !open)}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className={meSettingsRowListIconShellLargeClass}>
            <Languages className="h-5 w-5" strokeWidth={2} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold leading-tight text-foreground">{m.language.bilingualLabel}</p>
            <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{m.language.sectionHint}</p>
          </div>
        </div>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform duration-200", expanded && "rotate-180")}
          strokeWidth={2}
          aria-hidden
        />
      </button>
      {expanded ? (
        <div id={optionsId} className="px-4 pb-4">
          <div
            className="flex rounded-full border border-classmates-edge bg-classmates-warm-alt/60 p-1 dark:border-border dark:bg-muted/40"
            role="radiogroup"
            aria-label={m.language.sectionTitle}
          >
            {(
              [
                { id: "en" as const, label: m.language.english },
                { id: "zh-CN" as const, label: m.language.chinese },
              ] satisfies { id: AppLocale; label: string }[]
            ).map((opt) => {
              const selected = locale === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={busy}
                  onClick={() => void onPick(opt.id)}
                  className={cn(
                    "min-h-[2.5rem] flex-1 rounded-full px-3 text-[13px] font-semibold transition-colors",
                    selected
                      ? "bg-white text-classmates-ink shadow-sm dark:bg-card dark:text-foreground"
                      : "text-classmates-sub active:bg-white/70 dark:text-muted-foreground dark:active:bg-muted",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
