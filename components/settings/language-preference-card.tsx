"use client";

import { useState } from "react";
import { Languages } from "lucide-react";

import { useLocaleContext } from "@/components/i18n/locale-provider";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/lib/i18n/app-locale";

const cardClass =
  "rounded-2xl border border-classmates-edge bg-classmates-surface px-4 py-4 shadow-[0_4px_14px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card";

export function LanguagePreferenceCard() {
  const { locale, messages: m, setAppLocale } = useLocaleContext();
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
    <div className={cn(cardClass, "space-y-3")}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[20px] bg-muted/70 text-muted-foreground">
          <Languages className="h-5 w-5" strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-[15px] font-semibold leading-tight text-classmates-ink dark:text-foreground">
            {m.language.bilingualLabel}
          </p>
          <p className="text-[12px] leading-snug text-classmates-sub dark:text-zinc-400">{m.language.sectionHint}</p>
        </div>
      </div>
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
  );
}
