"use client";

import { addMinutes, differenceInMinutes, format } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useLocaleContext } from "@/components/i18n/locale-provider";
import { ScheduleShareProposalAuthSheet } from "@/components/schedule-share/schedule-share-proposal-auth-sheet";
import {
  SCHEDULE_SHARE_MAX_PROPOSAL_MINUTES,
  SCHEDULE_SHARE_MIN_PROPOSAL_MINUTES,
} from "@/lib/schedule-share/constants";
import {
  clearScheduleShareProposalDraft,
  saveScheduleShareProposalDraft,
  type ScheduleShareProposalDraft,
} from "@/lib/schedule-share/proposal-draft-storage";
import type { ScheduleShareProposalSelection } from "@/lib/schedule-share/proposal-selection";
import {
  clampProposalEndToBounds,
  proposalRangeFitsFreeSlots,
} from "@/lib/schedule-share/public-blocks-to-week-calendar";
import type { ViewerScheduleShareProposal } from "@/lib/schedule-share/viewer-proposal";
import { cn } from "@/lib/utils";

const DURATION_MINUTES = [30, 60, 90, 120] as const;

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string): Date | null {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function refreshSessionActive(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
    return res.ok;
  } catch {
    return false;
  }
}

export function ScheduleShareProposalPanel({
  token,
  selection,
  freeSlots,
  returnTo,
  isSignedIn,
  isUpdate = false,
  initialDraft,
  labels,
  onSelectionChange,
  onCancel,
  onSent,
  adjustTimeOpen,
  onAdjustTimeOpenChange,
  /** Omit card chrome when embedded in {@link AppPushLayer} (share page proposal sheet). */
  bare = false,
}: {
  token: string;
  selection: ScheduleShareProposalSelection;
  freeSlots: { start: string; end: string }[];
  returnTo: string;
  isSignedIn: boolean;
  isUpdate?: boolean;
  initialDraft?: ScheduleShareProposalDraft | null;
  labels: {
    proposalFormTitle: string;
    proposalTitle: string;
    proposalNote: string;
    proposalLocation: string;
    proposalStart: string;
    proposalEnd: string;
    proposalDurationLabel: string;
    proposalWithinBoundsHint: string;
    proposalDurationInvalid: string;
    submitProposal: string;
    proposalCancel: string;
    proposalSignInToSend: string;
    continueEditing: string;
    adjustTime: string;
    optionalDetails: string;
    rateLimited: string;
    timeUnavailable: string;
    submitProposalFailed: string;
    invalidProposalTimes: string;
    proposalOutsideSlot: string;
    proposalAlreadyAccepted: string;
    sending: string;
    updateProposal: string;
  };
  onSelectionChange: (next: ScheduleShareProposalSelection) => void;
  onCancel: () => void;
  onSent: (proposal: ViewerScheduleShareProposal) => void;
  adjustTimeOpen?: boolean;
  onAdjustTimeOpenChange?: (open: boolean) => void;
  bare?: boolean;
}) {
  const { locale } = useLocaleContext();
  const dateLocale = locale === "zh-CN" ? zhCN : enUS;

  const [title, setTitle] = useState(initialDraft?.title ?? "");
  const [note, setNote] = useState(initialDraft?.note ?? "");
  const [location, setLocation] = useState(initialDraft?.location ?? "");
  const [startInput, setStartInput] = useState(() => toDatetimeLocalValue(selection.start));
  const [endInput, setEndInput] = useState(() => toDatetimeLocalValue(selection.end));
  const [error, setError] = useState<string | null>(null);
  const [authSheetOpen, setAuthSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [adjustTimeOpenInternal, setAdjustTimeOpenInternal] = useState(false);
  const isAdjustTimeOpen = adjustTimeOpen ?? adjustTimeOpenInternal;
  const setAdjustTimeOpen = onAdjustTimeOpenChange ?? setAdjustTimeOpenInternal;
  const [detailsOpen, setDetailsOpen] = useState(
    Boolean(initialDraft?.note?.trim() || initialDraft?.location?.trim()),
  );

  useEffect(() => {
    setStartInput(toDatetimeLocalValue(selection.start));
    setEndInput(toDatetimeLocalValue(selection.end));
  }, [selection.start, selection.end]);

  useEffect(() => {
    if (!initialDraft) return;
    setTitle(initialDraft.title);
    setNote(initialDraft.note);
    setLocation(initialDraft.location);
    setDetailsOpen(Boolean(initialDraft.note?.trim() || initialDraft.location?.trim()));
  }, [initialDraft]);

  const timeSummary = useMemo(() => {
    const sameDay =
      format(selection.start, "yyyy-MM-dd") === format(selection.end, "yyyy-MM-dd");
    const startFmt = format(selection.start, sameDay ? "EEE, MMM d · HH:mm" : "EEE, MMM d HH:mm", {
      locale: dateLocale,
    });
    const endFmt = format(selection.end, "HH:mm", { locale: dateLocale });
    return `${startFmt} – ${endFmt}`;
  }, [selection.end, selection.start, dateLocale]);

  const activeDuration = useMemo(() => {
    const mins = differenceInMinutes(selection.end, selection.start);
    return DURATION_MINUTES.includes(mins as (typeof DURATION_MINUTES)[number]) ? mins : null;
  }, [selection.end, selection.start]);

  const applyTimes = useCallback(
    (start: Date, end: Date) => {
      const clampedEnd = clampProposalEndToBounds(start, end, selection.bounds);
      onSelectionChange({ ...selection, start, end: clampedEnd });
    },
    [onSelectionChange, selection],
  );

  const setDuration = (minutes: number) => {
    const end = clampProposalEndToBounds(
      selection.start,
      addMinutes(selection.start, minutes),
      selection.bounds,
    );
    applyTimes(selection.start, end);
  };

  const commitDatetimeInputs = () => {
    const start = fromDatetimeLocalValue(startInput);
    const end = fromDatetimeLocalValue(endInput);
    if (!start || !end) {
      setError(labels.invalidProposalTimes);
      return;
    }
    const mins = differenceInMinutes(end, start);
    if (mins < SCHEDULE_SHARE_MIN_PROPOSAL_MINUTES || mins > SCHEDULE_SHARE_MAX_PROPOSAL_MINUTES) {
      setError(labels.proposalDurationInvalid);
      return;
    }
    if (!proposalRangeFitsFreeSlots(freeSlots, start, end)) {
      setError(labels.proposalOutsideSlot);
      return;
    }
    setError(null);
    applyTimes(start, end);
  };

  const persistDraft = () => {
    saveScheduleShareProposalDraft({
      token,
      title: title.trim(),
      note: note.trim(),
      location: location.trim(),
      startTime: selection.start.toISOString(),
      endTime: selection.end.toISOString(),
      boundsStart: selection.bounds.start,
      boundsEnd: selection.bounds.end,
    });
  };

  const submitProposal = async () => {
    setError(null);
    if (!title.trim()) {
      setError(labels.proposalTitle);
      return;
    }
    if (!proposalRangeFitsFreeSlots(freeSlots, selection.start, selection.end)) {
      setError(labels.proposalOutsideSlot);
      return;
    }

    const signedIn = isSignedIn || (await refreshSessionActive());
    if (!signedIn) {
      persistDraft();
      setAuthSheetOpen(true);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/schedule-shares/${encodeURIComponent(token)}/proposals`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          note: note.trim() || "",
          location: location.trim() || "",
          startTime: selection.start.toISOString(),
          endTime: selection.end.toISOString(),
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        data?: { proposal?: ViewerScheduleShareProposal };
      } | null;
      if (res.status === 401) {
        persistDraft();
        setAuthSheetOpen(true);
        return;
      }
      if (res.status === 429) {
        setError(labels.rateLimited);
        return;
      }
      if (res.status === 409) {
        const msg = body?.error?.trim() ?? "";
        setError(
          msg.includes("accepted") ? labels.proposalAlreadyAccepted : labels.timeUnavailable,
        );
        return;
      }
      if (!res.ok || !body?.success) {
        setError(body?.error?.trim() || labels.submitProposalFailed);
        return;
      }
      clearScheduleShareProposalDraft();
      const proposal = body.data?.proposal;
      if (!proposal) {
        setError(labels.submitProposalFailed);
        return;
      }
      onSent(proposal);
    } catch {
      setError(labels.submitProposalFailed);
    } finally {
      setSubmitting(false);
    }
  };

  const formFields = (
    <>
        <div className={cn(bare ? "mt-0" : "mt-3", "rounded-xl bg-muted/40 px-3 py-2.5")}>
          <p className="text-[13px] font-medium text-foreground">{timeSummary}</p>
          <button
            type="button"
            onClick={() => setAdjustTimeOpen(!isAdjustTimeOpen)}
            className="mt-1 text-[12px] font-medium text-primary hover:underline"
          >
            {labels.adjustTime}
          </button>
        </div>

        {isAdjustTimeOpen ? (
          <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-[11px] font-medium text-muted-foreground">{labels.proposalStart}</span>
                <input
                  type="datetime-local"
                  value={startInput}
                  onChange={(e) => setStartInput(e.target.value)}
                  onBlur={commitDatetimeInputs}
                  className="mt-1 w-full rounded-lg border border-border/80 bg-background px-3 py-2 text-[13px]"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-medium text-muted-foreground">{labels.proposalEnd}</span>
                <input
                  type="datetime-local"
                  value={endInput}
                  onChange={(e) => setEndInput(e.target.value)}
                  onBlur={commitDatetimeInputs}
                  className="mt-1 w-full rounded-lg border border-border/80 bg-background px-3 py-2 text-[13px]"
                />
              </label>
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">{labels.proposalDurationLabel}</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {DURATION_MINUTES.map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setDuration(mins)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-[12px] font-medium transition",
                      activeDuration === mins
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/80 text-muted-foreground hover:bg-muted/50",
                    )}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <label className="mt-3 block">
          <span className="text-[11px] font-medium text-muted-foreground">{labels.proposalTitle}</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border/80 bg-background px-3 py-2 text-[13px]"
            autoComplete="off"
            placeholder={labels.proposalTitle}
          />
        </label>

        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          className="mt-3 flex w-full items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronDown
            className={cn("h-4 w-4 transition", detailsOpen && "rotate-180")}
            strokeWidth={2}
          />
          {labels.optionalDetails}
        </button>

        {detailsOpen ? (
          <div className="mt-2 space-y-2">
            <label className="block">
              <span className="text-[11px] font-medium text-muted-foreground">{labels.proposalNote}</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="mt-1 w-full resize-none rounded-lg border border-border/80 bg-background px-3 py-2 text-[13px]"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-muted-foreground">{labels.proposalLocation}</span>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border/80 bg-background px-3 py-2 text-[13px]"
                autoComplete="off"
              />
            </label>
          </div>
        ) : null}

        {error ? <p className="mt-3 text-[12px] text-destructive">{error}</p> : null}

        <button
          type="button"
          disabled={submitting}
          onClick={() => void submitProposal()}
          className={cn(
            "mt-4 w-full rounded-xl bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground",
            "disabled:opacity-60",
          )}
        >
          {submitting ? labels.sending : isUpdate ? labels.updateProposal : labels.submitProposal}
        </button>
    </>
  );

  return (
    <>
      {bare ? (
        formFields
      ) : (
        <section className="rounded-2xl border border-border/70 bg-card/80 p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-[15px] font-semibold text-foreground">{labels.proposalFormTitle}</h2>
            <button
              type="button"
              onClick={onCancel}
              className="shrink-0 text-[12px] font-medium text-muted-foreground hover:text-foreground"
            >
              {labels.proposalCancel}
            </button>
          </div>
          {formFields}
        </section>
      )}

      <ScheduleShareProposalAuthSheet
        open={authSheetOpen}
        onClose={() => setAuthSheetOpen(false)}
        message={labels.proposalSignInToSend}
        returnTo={returnTo}
        continueEditingLabel={labels.continueEditing}
      />
    </>
  );
}
