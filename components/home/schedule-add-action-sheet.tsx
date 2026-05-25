"use client";

import { useEffect, useState } from "react";
import { PenLine, Sparkles, X } from "lucide-react";
import { createPortal } from "react-dom";

import { useAppMessages } from "@/hooks/use-app-locale";
import { cn } from "@/lib/utils";

export type ScheduleAddChoice = "manual" | "natural";

export function ScheduleAddActionSheet({
  open,
  onClose,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  onChoose: (choice: ScheduleAddChoice) => void;
}) {
  const m = useAppMessages();
  const sch = m.schedule;
  const common = m.common;
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !portalReady || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center p-0"
      role="dialog"
      aria-modal="true"
      aria-labelledby="schedule-add-action-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        aria-label={common.close}
        onClick={onClose}
      />
      <div className="relative z-[61] w-full max-w-lg rounded-t-[1.25rem] border border-border/70 bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 shadow-2xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" aria-hidden />
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id="schedule-add-action-title" className="text-[15px] font-semibold text-foreground">
            {sch.addActionSheetTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            aria-label={common.close}
          >
            <X className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>

        <div className="space-y-2">
          <ActionOption
            icon={Sparkles}
            iconClassName="bg-violet-100 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300"
            title={sch.addActionSheetNaturalOption}
            subtitle={sch.addActionSheetNaturalSubtitle}
            onClick={() => {
              onClose();
              onChoose("natural");
            }}
          />
          <ActionOption
            icon={PenLine}
            iconClassName="bg-blue-50 text-[#2563EB] dark:bg-blue-950/50 dark:text-blue-300"
            title={sch.addActionSheetManualOption}
            subtitle={sch.addActionSheetManualSubtitle}
            onClick={() => {
              onClose();
              onChoose("manual");
            }}
          />
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-xl py-2.5 text-center text-[13px] font-medium text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
        >
          {sch.addActionSheetCancel}
        </button>
      </div>
    </div>,
    document.body,
  );
}

function ActionOption({
  icon: Icon,
  iconClassName,
  title,
  subtitle,
  onClick,
}: {
  icon: typeof Sparkles;
  iconClassName: string;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-2xl border border-[#E7E0D6]/90 bg-white px-3.5 py-3 text-left shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition",
        "hover:border-classmates-blue-border/70 hover:bg-classmates-blue-soft/30 active:scale-[0.99]",
        "dark:border-border/80 dark:bg-card dark:hover:bg-muted/40",
      )}
    >
      <span
        className={cn(
          "mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          iconClassName,
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold leading-snug text-foreground">{title}</span>
        <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">{subtitle}</span>
      </span>
    </button>
  );
}
