"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { GuestAppCta } from "@/components/app/guest-app-cta";
import { ScheduleShareMyProposalCard } from "@/components/schedule-share/schedule-share-my-proposal-card";
import { ScheduleShareProposalPanel } from "@/components/schedule-share/schedule-share-proposal-panel";
import { ScheduleShareViewer } from "@/components/schedule-share/schedule-share-viewer";
import { useLocaleContext } from "@/components/i18n/locale-provider";
import { apiFetch } from "@/lib/auth/api-fetch";
import type { PublicScheduleShareSnapshot } from "@/lib/schedule-share/build-schedule-share-snapshot";
import { buildSharePublicHeadline } from "@/lib/schedule-share/format-share-public-headline";
import {
  clearScheduleShareProposalDraft,
  loadScheduleShareProposalDraft,
  type ScheduleShareProposalDraft,
} from "@/lib/schedule-share/proposal-draft-storage";
import type { ScheduleShareProposalSelection } from "@/lib/schedule-share/proposal-selection";
import { findContainingFreeSlot } from "@/lib/schedule-share/public-blocks-to-week-calendar";
import type { ViewerScheduleShareProposal } from "@/lib/schedule-share/viewer-proposal";

export function ScheduleSharePublicClient({
  token,
  snapshot,
  unavailable,
  showGuestNudge = true,
  initialMyProposal = null,
}: {
  token?: string;
  snapshot?: PublicScheduleShareSnapshot;
  unavailable?: boolean;
  showGuestNudge?: boolean;
  initialMyProposal?: ViewerScheduleShareProposal | null;
}) {
  const { messages: ui, locale } = useLocaleContext();
  const s = ui.scheduleShare;

  const [myProposal, setMyProposal] = useState<ViewerScheduleShareProposal | null>(initialMyProposal);
  const [proposalSelection, setProposalSelection] = useState<ScheduleShareProposalSelection | null>(null);
  const [isEditingProposal, setIsEditingProposal] = useState(false);
  const [storedDraft, setStoredDraft] = useState<ScheduleShareProposalDraft | null>(null);
  const [proposalTimeEditorOpen, setProposalTimeEditorOpen] = useState(false);

  const ownerLabel = useMemo(() => {
    if (!snapshot?.ownerDisplayLabel?.trim()) return s.ownerDisplayFallback;
    return snapshot.ownerDisplayLabel.trim();
  }, [snapshot?.ownerDisplayLabel, s.ownerDisplayFallback]);

  const shareHeadline = useMemo(() => {
    if (!snapshot) return null;
    return buildSharePublicHeadline({
      ownerDisplayLabel: ownerLabel,
      ownerFallback: s.ownerDisplayFallback,
      rangeStart: new Date(snapshot.rangeStart),
      rangeEnd: new Date(snapshot.rangeEnd),
      locale,
      messages: ui,
    });
  }, [snapshot, ownerLabel, s.ownerDisplayFallback, locale, ui]);

  const returnTo = token ? `/share/schedule/${encodeURIComponent(token)}` : "/share/schedule";
  const allowProposals = snapshot?.allowGuestProposals === true;
  const isSignedIn = !showGuestNudge;
  const hasAcceptedProposal = myProposal?.status === "ACCEPTED";
  const hasPendingProposal = myProposal?.status === "PENDING";
  /** Guests may pick before login; signed-in users with a pending proposal must use Edit. */
  const canPickNewTime =
    allowProposals && !hasAcceptedProposal && !(isSignedIn && hasPendingProposal);

  const refreshMyProposal = useCallback(async () => {
    if (!token || !isSignedIn) return;
    try {
      const res = await apiFetch(`/api/public/schedule-shares/${encodeURIComponent(token)}/my-proposal`);
      const body = (await res.json().catch(() => null)) as {
        success?: boolean;
        data?: { proposal?: ViewerScheduleShareProposal | null };
      } | null;
      if (res.ok && body?.success) {
        setMyProposal(body.data?.proposal ?? null);
      }
    } catch {
      /* ignore */
    }
  }, [token, isSignedIn]);

  useEffect(() => {
    void refreshMyProposal();
  }, [refreshMyProposal]);

  useEffect(() => {
    if (!token || !allowProposals || myProposal) return;
    const draft = loadScheduleShareProposalDraft(token);
    if (!draft) return;
    setStoredDraft(draft);
    setProposalSelection({
      start: new Date(draft.startTime),
      end: new Date(draft.endTime),
      bounds: { start: draft.boundsStart, end: draft.boundsEnd },
    });
    setProposalTimeEditorOpen(true);
  }, [token, allowProposals, myProposal]);

  const startEditProposal = useCallback(() => {
    if (!myProposal || !snapshot) return;
    const start = new Date(myProposal.startTime);
    const end = new Date(myProposal.endTime);
    const slot = findContainingFreeSlot(snapshot.freeSlots, start, end);
    setProposalSelection({
      start,
      end,
      bounds: slot
        ? { start: slot.start, end: slot.end }
        : { start: myProposal.startTime, end: myProposal.endTime },
    });
    setIsEditingProposal(true);
    setProposalTimeEditorOpen(true);
  }, [myProposal, snapshot]);

  if (unavailable || !snapshot || !token || !shareHeadline) {
    return (
      <div className="mx-auto max-w-lg space-y-6 px-4 py-8">
        <div className="rounded-2xl border border-border/70 bg-card/60 px-4 py-6 text-center">
          <h1 className="text-[17px] font-semibold text-foreground">{s.publicUnavailableTitle}</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{s.publicUnavailableBody}</p>
        </div>
        {showGuestNudge ? (
          <GuestAppCta headline={s.registerNudgeHeadline} body={s.registerNudgeBody} returnTo="/share/schedule" />
        ) : null}
      </div>
    );
  }

  const viewerLabels = {
    busyAnonymous: s.busyAnonymous,
    prevWeekAria: s.prevWeekAria,
    nextWeekAria: s.nextWeekAria,
    proposePickHint: canPickNewTime ? s.proposePickHint : undefined,
    selectionPreview: proposalSelection ? ui.schedule.newEvent : undefined,
  };

  const panelLabels = {
    proposalFormTitle: s.proposalFormTitle,
    proposalTitle: s.proposalTitle,
    proposalNote: s.proposalNote,
    proposalLocation: s.proposalLocation,
    proposalStart: s.proposalStart,
    proposalEnd: s.proposalEnd,
    proposalDurationLabel: s.proposalDurationLabel,
    proposalWithinBoundsHint: s.proposalWithinBoundsHint,
    proposalDurationInvalid: s.proposalDurationInvalid,
    submitProposal: s.submitProposal,
    proposalCancel: s.proposalCancel,
    proposalSignInToSend: s.proposalSignInToSend,
    continueEditing: s.continueEditing,
    adjustTime: s.adjustTime,
    optionalDetails: s.optionalDetails,
    rateLimited: s.rateLimited,
    timeUnavailable: s.timeUnavailable,
    submitProposalFailed: s.submitProposalFailed,
    invalidProposalTimes: s.invalidProposalTimes,
    proposalOutsideSlot: s.proposalOutsideSlot,
    proposalAlreadyAccepted: s.proposalAlreadyAccepted,
    sending: s.sending,
    updateProposal: s.updateProposal,
  };

  const myProposalCardLabels = {
    proposalPendingTitle: s.proposalPendingTitle,
    proposalPendingHint: s.proposalPendingHint,
    proposalAcceptedTitle: s.proposalAcceptedTitle,
    proposalAcceptedHint: s.proposalAcceptedHint,
    editProposal: s.editProposal,
  };

  const showProposalPanel =
    allowProposals && proposalSelection && !hasAcceptedProposal && (isEditingProposal || !hasPendingProposal);

  const panelInitialDraft =
    isEditingProposal && myProposal
      ? {
          token,
          title: myProposal.title,
          note: myProposal.note ?? "",
          location: myProposal.location ?? "",
          startTime: myProposal.startTime,
          endTime: myProposal.endTime,
          boundsStart: proposalSelection?.bounds.start ?? myProposal.startTime,
          boundsEnd: proposalSelection?.bounds.end ?? myProposal.endTime,
        }
      : storedDraft;

  return (
    <div className="mx-auto max-w-3xl space-y-6 overscroll-y-contain px-3 py-6 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-4 sm:py-8">
      <ScheduleShareViewer
        snapshot={snapshot}
        pageHeadline={shareHeadline.headline}
        rangeDetail={shareHeadline.rangeDetail}
        labels={viewerLabels}
        allowGuestProposals={canPickNewTime}
        freeSlots={snapshot.freeSlots}
        proposalSelection={proposalSelection}
        onProposalSelectionChange={
          canPickNewTime
            ? (next) => {
                setProposalSelection(next);
                if (next) setProposalTimeEditorOpen(true);
              }
            : undefined
        }
        onEditProposalSelection={() => setProposalTimeEditorOpen(true)}
      />

      {allowProposals && isSignedIn && myProposal && !isEditingProposal ? (
        <ScheduleShareMyProposalCard
          proposal={myProposal}
          labels={myProposalCardLabels}
          onEdit={myProposal.status === "PENDING" ? startEditProposal : undefined}
        />
      ) : null}

      {showProposalPanel ? (
        <ScheduleShareProposalPanel
          token={token}
          selection={proposalSelection}
          freeSlots={snapshot.freeSlots}
          returnTo={returnTo}
          isSignedIn={isSignedIn}
          isUpdate={isEditingProposal}
          initialDraft={panelInitialDraft}
          labels={panelLabels}
          onSelectionChange={setProposalSelection}
          adjustTimeOpen={proposalTimeEditorOpen}
          onAdjustTimeOpenChange={setProposalTimeEditorOpen}
          onCancel={() => {
            setProposalSelection(null);
            setIsEditingProposal(false);
            setStoredDraft(null);
            setProposalTimeEditorOpen(false);
            clearScheduleShareProposalDraft();
          }}
          onSent={(proposal) => {
            setMyProposal(proposal);
            setProposalSelection(null);
            setIsEditingProposal(false);
            setStoredDraft(null);
            setProposalTimeEditorOpen(false);
            clearScheduleShareProposalDraft();
          }}
        />
      ) : null}

      {!allowProposals && showGuestNudge ? (
        <GuestAppCta headline={s.registerNudgeHeadline} body={s.registerNudgeBody} returnTo={returnTo} />
      ) : null}
    </div>
  );
}
