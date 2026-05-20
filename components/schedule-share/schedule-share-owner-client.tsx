"use client";

import { ArrowLeft, Copy, Settings2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppPushLayer } from "@/components/ui/app-push-layer";
import { Button } from "@/components/ui/button";
import { useLocaleContext } from "@/components/i18n/locale-provider";
import {
  ScheduleShareOptionsForm,
  type ScheduleShareCategoryInput,
} from "@/components/schedule-share/schedule-share-options-form";
import { ScheduleShareViewer } from "@/components/schedule-share/schedule-share-viewer";
import { apiFetch } from "@/lib/auth/api-fetch";
import type { PublicScheduleShareSnapshot } from "@/lib/schedule-share/build-schedule-share-snapshot";
import { formatShareCreateRangeSummary } from "@/lib/schedule-share/format-share-create-summary";
import {
  scheduleShareFormFromLink,
  scheduleShareFormToPayload,
  type ScheduleShareFormState,
} from "@/lib/schedule-share/schedule-share-form-state";
import type { ScheduleShareUsageLimitInput } from "@/lib/schedule-share/usage-limit";

export type ScheduleShareLinkSettingsInput = {
  rangeStart: string;
  rangeEnd: string;
  revealConfig: unknown;
  allowGuestProposals: boolean;
  usageLimit: ScheduleShareUsageLimitInput;
  expiresAt: string;
  createdAt: string;
};

export function ScheduleShareOwnerClient({
  token,
  shareUrl,
  initialSnapshot,
  linkSettings,
  calendarCategories,
}: {
  token: string;
  shareUrl: string;
  initialSnapshot: PublicScheduleShareSnapshot;
  linkSettings: ScheduleShareLinkSettingsInput;
  calendarCategories: ScheduleShareCategoryInput[];
}) {
  const router = useRouter();
  const { locale, messages: ui } = useLocaleContext();
  const s = ui.scheduleShare;

  const baseNow = useMemo(() => new Date(linkSettings.createdAt), [linkSettings.createdAt]);

  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [form, setForm] = useState<ScheduleShareFormState>(() =>
    scheduleShareFormFromLink({
      rangeStart: new Date(linkSettings.rangeStart),
      rangeEnd: new Date(linkSettings.rangeEnd),
      revealConfig: linkSettings.revealConfig,
      allowGuestProposals: linkSettings.allowGuestProposals,
      usageLimit: linkSettings.usageLimit,
      expiresAt: new Date(linkSettings.expiresAt),
      createdAt: baseNow,
    }),
  );
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [expiryError, setExpiryError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const skipNextSave = useRef(true);
  const formRef = useRef(form);
  formRef.current = form;

  const persist = useCallback(async () => {
    const current = formRef.current;
    const rangeStart = new Date(current.rangeStartInput);
    const rangeEnd = new Date(current.rangeEndInput);
    if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime()) || rangeEnd <= rangeStart) {
      setRangeError(s.invalidRange);
      return;
    }
    if (current.expiresInput.trim()) {
      const exp = new Date(current.expiresInput);
      if (Number.isNaN(exp.getTime())) {
        setExpiryError(s.invalidRange);
        return;
      }
    }

    setSaving(true);
    setSaveError(null);
    setRangeError(null);
    setExpiryError(null);

    try {
      const res = await apiFetch(`/api/schedule-shares/by-token/${encodeURIComponent(token)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scheduleShareFormToPayload(current)),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload.success !== true) {
        const msg = typeof payload.error === "string" ? payload.error : s.createFailed;
        setSaveError(msg);
        return;
      }
      if (payload.data?.snapshot) {
        setSnapshot(payload.data.snapshot as PublicScheduleShareSnapshot);
      }
    } catch {
      setSaveError(s.networkError);
    } finally {
      setSaving(false);
    }
  }, [token, s]);

  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      void persist();
    }, 450);
    return () => window.clearTimeout(timer);
  }, [form, persist]);

  const rangeDetail = useMemo(() => {
    const start = new Date(snapshot.rangeStart);
    const end = new Date(snapshot.rangeEnd);
    return formatShareCreateRangeSummary(start, end, locale);
  }, [snapshot.rangeStart, snapshot.rangeEnd, locale]);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setSaveError(s.copyFailed);
    }
  }

  const viewerLabels = {
    busyAnonymous: s.busyAnonymous,
    prevWeekAria: s.prevWeekAria,
    nextWeekAria: s.nextWeekAria,
  };

  return (
    <>
      <div className="mx-auto flex h-dvh max-h-dvh min-w-0 max-w-md flex-col overflow-hidden bg-background">
        <header className="flex shrink-0 items-center gap-2 border-b border-border/50 px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={() => router.push("/home")}
            aria-label={ui.common.back}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={2.25} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold">{s.ownerPageTitle}</h1>
            <p className="truncate text-[11px] text-muted-foreground">{rangeDetail}</p>
          </div>
          <button
            type="button"
            onClick={() => setOptionsOpen(true)}
            aria-label={s.ownerAdjustOptionsAria}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <Settings2 className="h-5 w-5" strokeWidth={2.25} />
          </button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-9 shrink-0 rounded-full px-3 text-[12px]"
            onClick={() => void copyUrl()}
          >
            <Copy className="mr-1 h-3.5 w-3.5" />
            {copied ? s.copied : s.copyLink}
          </Button>
        </header>

        {saveError ? (
          <p className="shrink-0 px-3 py-1 text-[11px] text-destructive">{saveError}</p>
        ) : null}
        {saving ? (
          <p className="shrink-0 px-3 py-1 text-[11px] text-muted-foreground">{s.savingSettings}</p>
        ) : null}

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-[env(safe-area-inset-bottom)]">
          <ScheduleShareViewer
            fillParent
            snapshot={snapshot}
            pageHeadline={s.ownerPageTitle}
            rangeDetail={rangeDetail}
            labels={viewerLabels}
            allowGuestProposals={false}
            freeSlots={snapshot.freeSlots}
          />
        </section>
      </div>

      <AppPushLayer
        open={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        zClassName="z-50"
        panelClassName="w-[min(100vw,28rem)] border-0"
      >
        <div className="flex h-full min-h-0 flex-col bg-background pt-[env(safe-area-inset-top)]">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/50 px-4 py-3">
            <h2 className="text-sm font-semibold">{s.ownerOptionsTitle}</h2>
            <button
              type="button"
              onClick={() => setOptionsOpen(false)}
              aria-label={ui.common.close}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" strokeWidth={2.25} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <ScheduleShareOptionsForm
              value={form}
              onChange={setForm}
              baseNow={baseNow}
              categories={calendarCategories}
              rangeError={rangeError}
              expiryError={expiryError}
            />
          </div>
          <div className="border-t border-border/60 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <Button type="button" className="h-11 w-full rounded-xl" onClick={() => setOptionsOpen(false)}>
              {ui.common.done}
            </Button>
          </div>
        </div>
      </AppPushLayer>
    </>
  );
}
