"use client";

import { format } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import { Loader2, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  CategoryNoneRow,
  CategoryPickerRow,
  type CalendarCategoryOption,
} from "@/components/calendar/category-picker-row";
import { useLocaleContext } from "@/components/i18n/locale-provider";
import { discoverPrimarySolidCtaClassName } from "@/components/discover/discover-message-button";
import { AppPushLayer } from "@/components/ui/app-push-layer";
import { apiFetch } from "@/lib/auth/api-fetch";
import { formatMessage } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

type DraftEvent = {
  title: string;
  location: string;
  note: string;
  startAt: string;
  endAt: string;
  repeat: string;
  repeatUntil: string;
  categoryId: string | null;
};

const naturalTextareaClassName = cn(
  "min-h-[7.5rem] w-full resize-none rounded-2xl border border-border/70 bg-muted/10 px-4 py-3.5",
  "text-[15px] leading-relaxed text-foreground shadow-none placeholder:text-muted-foreground/75",
  "transition-[border-color,box-shadow] focus-visible:border-classmates-blue-border focus-visible:outline-none",
  "focus-visible:ring-2 focus-visible:ring-classmates-blue-border/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  "dark:bg-muted/20",
);

const naturalParseCtaClassName = cn(
  "inline-flex h-11 w-full touch-manipulation items-center justify-center gap-2 rounded-xl",
  "border border-classmates-blue-border bg-gradient-to-br from-classmates-blue-soft via-white to-classmates-blue-soft/60",
  "text-[14px] font-semibold text-classmates-blue shadow-[0_4px_16px_-8px_rgba(37,99,235,0.45)]",
  "transition hover:border-classmates-blue/45 hover:shadow-[0_6px_20px_-8px_rgba(37,99,235,0.5)] active:scale-[0.99]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  "disabled:pointer-events-none disabled:opacity-45",
  "dark:from-blue-950/55 dark:via-zinc-950/40 dark:to-blue-950/35 dark:text-blue-200",
);

function formatEventWhen(isoStart: string, isoEnd: string, locale: "zh-CN" | "en") {
  const start = new Date(isoStart);
  const end = new Date(isoEnd);
  const dfLocale = locale === "zh-CN" ? zhCN : enUS;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return isoStart;
  }
  const sameDay = format(start, "yyyy-MM-dd") === format(end, "yyyy-MM-dd");
  if (sameDay) {
    return `${format(start, "PPp", { locale: dfLocale })} – ${format(end, "p", { locale: dfLocale })}`;
  }
  return `${format(start, "PPp", { locale: dfLocale })} – ${format(end, "PPp", { locale: dfLocale })}`;
}

export function NaturalScheduleSheet({
  open,
  onClose,
  onSaved,
  calendarCategories = [],
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  calendarCategories?: CalendarCategoryOption[];
}) {
  const router = useRouter();
  const { messages, locale } = useLocaleContext();
  const sch = messages.schedule;

  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<DraftEvent[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  const resetPreview = () => {
    setDrafts([]);
    setWarnings([]);
    setError("");
  };

  const handleClose = () => {
    resetPreview();
    setText("");
    onClose();
  };

  const applyExample = (example: string) => {
    setText(example);
    resetPreview();
  };

  const updateDraftCategory = (index: number, categoryId: string | null) => {
    setDrafts((prev) =>
      prev.map((ev, i) => (i === index ? { ...ev, categoryId } : ev)),
    );
  };

  const parse = async () => {
    const trimmed = text.trim();
    if (!trimmed || parsing) return;
    setParsing(true);
    setError("");
    resetPreview();

    const res = await apiFetch("/api/calendar/parse-natural", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: trimmed, locale }),
    });
    const payload = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
      data?: {
        events: Array<DraftEvent & { categoryPreset?: string | null }>;
        warnings?: string[];
      };
    };
    setParsing(false);

    if (!res.ok) {
      setError(typeof payload.error === "string" ? payload.error : sch.naturalParseError);
      return;
    }

    const data = payload.data;
    const events = data?.events ?? [];
    if (!events.length) {
      setError(sch.naturalParseEmpty);
      return;
    }
    setDrafts(
      events.map((ev) => ({
        title: ev.title,
        location: ev.location ?? "",
        note: ev.note ?? "",
        startAt: ev.startAt,
        endAt: ev.endAt,
        repeat: ev.repeat ?? "NONE",
        repeatUntil: ev.repeatUntil ?? "",
        categoryId: ev.categoryId ?? null,
      })),
    );
    setWarnings(data?.warnings ?? []);
  };

  const confirm = async () => {
    if (!drafts.length || saving) return;
    setSaving(true);
    setError("");

    const res = await apiFetch("/api/calendar/events/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        events: drafts.map((d) => ({
          title: d.title,
          location: d.location,
          note: d.note,
          startAt: d.startAt,
          endAt: d.endAt,
          repeat: d.repeat,
          repeatUntil: d.repeatUntil,
          withUserIds: [],
          categoryId: d.categoryId,
        })),
      }),
    });
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    setSaving(false);

    if (!res.ok) {
      setError(typeof payload.error === "string" ? payload.error : sch.naturalSaveError);
      return;
    }

    if (onSaved) {
      onSaved();
    } else {
      handleClose();
      router.refresh();
    }
  };

  return (
    <AppPushLayer
      open={open}
      onClose={handleClose}
      zClassName="z-50"
      panelClassName="w-[min(100vw,28rem)] border-0"
    >
      <div className="flex h-full min-h-0 flex-col bg-card pt-[env(safe-area-inset-top)]">
        <div className="relative flex min-h-12 shrink-0 items-center justify-center border-b border-border/50 px-4 py-2.5">
          <button
            type="button"
            onClick={handleClose}
            aria-label={sch.naturalSheetCloseAria}
            className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" strokeWidth={2.25} aria-hidden />
          </button>
          <h2 className="pointer-events-none text-center text-[15px] font-semibold text-foreground">
            {sch.naturalSheetTitle}
          </h2>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
          <div className="space-y-4">
            <div
              className={cn(
                "flex gap-3 rounded-2xl border border-classmates-blue-border/60 bg-gradient-to-br from-classmates-blue-soft/80 via-white/90 to-transparent px-3.5 py-3",
                "dark:border-blue-500/25 dark:from-blue-950/40 dark:via-zinc-950/20 dark:to-transparent",
              )}
            >
              <span
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-classmates-blue-border/70 bg-white text-classmates-blue shadow-sm dark:border-blue-500/35 dark:bg-blue-950/50 dark:text-blue-300"
                aria-hidden
              >
                <Sparkles className="h-4 w-4" strokeWidth={2} />
              </span>
              <div className="min-w-0 space-y-0.5">
                <p className="text-[13px] font-medium leading-snug text-foreground">{sch.naturalSheetHint}</p>
                <p className="text-[12px] leading-snug text-muted-foreground">{sch.naturalSheetHintDetail}</p>
              </div>
            </div>

            <div className="space-y-2.5">
              <label className="sr-only" htmlFor="natural-schedule-input">
                {sch.naturalInputPlaceholder}
              </label>
              <textarea
                id="natural-schedule-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={sch.naturalInputPlaceholder}
                rows={5}
                className={naturalTextareaClassName}
              />

              {sch.naturalExampleChips.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {sch.naturalExamplesLabel}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {sch.naturalExampleChips.map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => applyExample(example)}
                        className={cn(
                          "max-w-full rounded-full border border-border/70 bg-muted/15 px-3 py-1.5 text-left text-[12px] leading-snug text-foreground transition",
                          "hover:border-classmates-blue-border hover:bg-classmates-blue-soft hover:text-classmates-blue active:scale-[0.98]",
                          "dark:hover:bg-blue-950/40 dark:hover:text-blue-200",
                        )}
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              className={naturalParseCtaClassName}
              disabled={!text.trim() || parsing}
              onClick={() => void parse()}
            >
              {parsing ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden />
              )}
              {parsing ? sch.naturalParsing : sch.naturalParseCta}
            </button>

            {warnings.length > 0 ? (
              <ul className="space-y-1 rounded-2xl border border-amber-200/80 bg-amber-50/90 px-3.5 py-2.5 text-[12px] leading-snug text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-100">
                {warnings.map((w) => (
                  <li key={w}>• {w}</li>
                ))}
              </ul>
            ) : null}

            {drafts.length > 0 ? (
              <div className="space-y-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {formatMessage(sch.naturalPreviewCount, { count: drafts.length })}
                </p>
                <ul className="space-y-2">
                  {drafts.map((ev, i) => (
                    <li
                      key={`${ev.startAt}-${i}`}
                      className="space-y-2 rounded-2xl border border-border/70 bg-background/80 px-3.5 py-3 shadow-sm"
                    >
                      <div>
                        <p className="text-[14px] font-semibold text-foreground">{ev.title}</p>
                        <p className="mt-1 text-[12px] text-muted-foreground">
                          {formatEventWhen(ev.startAt, ev.endAt, locale)}
                        </p>
                        {ev.location?.trim() ? (
                          <p className="mt-0.5 text-[12px] text-muted-foreground">{ev.location}</p>
                        ) : null}
                      </div>
                      {calendarCategories.length > 0 ? (
                        <CategoryPickerRow
                          categories={calendarCategories}
                          value={ev.categoryId}
                          onChange={(id) => updateDraftCategory(i, id)}
                          labels={sch}
                          compact
                        />
                      ) : (
                        <CategoryNoneRow labels={sch} />
                      )}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={cn(discoverPrimarySolidCtaClassName, "rounded-xl")}
                  disabled={saving}
                  onClick={() => void confirm()}
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      {sch.naturalSaving}
                    </>
                  ) : (
                    sch.naturalConfirmCta
                  )}
                </button>
              </div>
            ) : null}

            {error ? (
              <p
                className="rounded-xl border border-red-200/80 bg-red-50/80 px-3 py-2 text-center text-[13px] text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
                role="alert"
              >
                {error}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </AppPushLayer>
  );
}
