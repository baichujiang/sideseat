"use client";

import type { Route } from "next";
import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { GuestAppCta } from "@/components/app/guest-app-cta";
import { useLocaleContext } from "@/components/i18n/locale-provider";
import { LinkButton } from "@/components/ui/link-button";
import { ScheduleShareGuestViewer } from "@/components/schedule-share/schedule-share-guest-viewer";
import { ScheduleShareMyProposalCard } from "@/components/schedule-share/schedule-share-my-proposal-card";
import { ScheduleShareProposalPanel } from "@/components/schedule-share/schedule-share-proposal-panel";
import { AppPushLayer } from "@/components/ui/app-push-layer";
import { apiFetch } from "@/lib/auth/api-fetch";
import type { PublicScheduleShareSnapshot } from "@/lib/schedule-share/build-schedule-share-snapshot";
import {
  clearScheduleShareProposalDraft,
  loadScheduleShareProposalDraft,
  type ScheduleShareProposalDraft,
} from "@/lib/schedule-share/proposal-draft-storage";
import type { ScheduleShareProposalSelection } from "@/lib/schedule-share/proposal-selection";
import { findContainingFreeSlot } from "@/lib/schedule-share/public-blocks-to-week-calendar";
import {
  scheduleShareOwnerEditPath,
  scheduleShareRecipientViewPath,
} from "@/lib/schedule-share/share-link-urls";
import type { ViewerScheduleShareProposal } from "@/lib/schedule-share/viewer-proposal";
import { cn } from "@/lib/utils";

/**
 * Standalone page for people who open a generated share link (view + optional time proposal).
 */
export function ScheduleShareRecipientPage({
  token,
  snapshot,
  pageHeadline,
  rangeDetail,
  unavailable = false,
  showGuestNudge = true,
  isLinkOwner = false,
  ownerEditPath,
  initialMyProposal = null,
}: {
  token?: string;
  snapshot?: PublicScheduleShareSnapshot;
  pageHeadline?: string;
  rangeDetail?: string;
  unavailable?: boolean;
  showGuestNudge?: boolean;
  isLinkOwner?: boolean;
  ownerEditPath?: string;
  initialMyProposal?: ViewerScheduleShareProposal | null;
}) {
  const { messages: ui } = useLocaleContext();
  const s = ui.scheduleShare;

  const [myProposal, setMyProposal] = useState<ViewerScheduleShareProposal | null>(initialMyProposal);
  const [proposalSelection, setProposalSelection] = useState<ScheduleShareProposalSelection | null>(null);
  const [isEditingProposal, setIsEditingProposal] = useState(false);
  const [storedDraft, setStoredDraft] = useState<ScheduleShareProposalDraft | null>(null);
  const [proposalTimeEditorOpen, setProposalTimeEditorOpen] = useState(false);

  const returnTo = token ? scheduleShareRecipientViewPath(token) : "/share/view";
  const allowProposals = snapshot?.allowGuestProposals === true;
  const isSignedIn = !showGuestNudge;
  const hasAcceptedProposal = myProposal?.status === "ACCEPTED";
  const hasPendingProposal = myProposal?.status === "PENDING";
  const canPickNewTime =
    allowProposals &&
    !isLinkOwner &&
    !hasAcceptedProposal &&
    !(isSignedIn && hasPendingProposal);

  const ownerSettingsPath =
    ownerEditPath ?? (token ? scheduleShareOwnerEditPath(token) : undefined);

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
    if (!token || !allowProposals || isLinkOwner || myProposal) return;
    const draft = loadScheduleShareProposalDraft(token);
    if (!draft) return;
    setStoredDraft(draft);
    setProposalSelection({
      start: new Date(draft.startTime),
      end: new Date(draft.endTime),
      bounds: { start: draft.boundsStart, end: draft.boundsEnd },
    });
    setProposalTimeEditorOpen(true);
  }, [token, allowProposals, isLinkOwner, myProposal]);

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

  const cancelProposal = useCallback(() => {
    setProposalSelection(null);
    setIsEditingProposal(false);
    setStoredDraft(null);
    setProposalTimeEditorOpen(false);
    clearScheduleShareProposalDraft();
  }, []);

  useEffect(() => {
    if (unavailable || !snapshot) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [unavailable, snapshot]);

  if (unavailable || !snapshot || !token || !pageHeadline) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-6">
        <div className="max-w-sm text-center">
          <h1 className="text-[17px] font-semibold text-foreground">{s.publicUnavailableTitle}</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{s.publicUnavailableBody}</p>
        </div>
        {showGuestNudge ? (
          <GuestAppCta headline={s.registerNudgeHeadline} body={s.registerNudgeBody} returnTo={returnTo} />
        ) : null}
      </div>
    );
  }

  const viewerLabels = {
    busyAnonymous: s.busyAnonymous,
    shareExcludedDayBadge: s.shareExcludedDayBadge,
    proposePickHint: canPickNewTime ? s.proposePickHint : undefined,
    selectionPreview: proposalSelection ? ui.schedule.newEvent : undefined,
  };

  const showGuestProposeBanner = allowProposals && showGuestNudge && !isLinkOwner;
  const showOwnerPreviewBanner = allowProposals && isLinkOwner;
  const showVisitorProposeBanner =
    allowProposals && isSignedIn && !isLinkOwner && canPickNewTime && !proposalSelection;

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

  const showFooter =
    (allowProposals && isSignedIn && myProposal && !isEditingProposal) ||
    (!allowProposals && showGuestNudge);

  return (
    <>
      <div className="mx-auto flex h-dvh max-h-dvh min-w-0 max-w-md flex-col overflow-hidden bg-background">
        <header className="shrink-0 space-y-1 border-b border-border/50 px-4 pb-2.5 pt-[max(0.75rem,env(safe-area-inset-top))] text-center">
          <h1 className="text-[15px] font-semibold leading-snug text-foreground">{pageHeadline}</h1>
          {rangeDetail ? (
            <p className="text-[12px] leading-snug text-muted-foreground">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
                {s.publicRangeHint}
              </span>
              <span className="mx-1.5 text-border">·</span>
              {rangeDetail}
            </p>
          ) : null}
        </header>

        {showOwnerPreviewBanner ? (
          <div className="shrink-0 border-b border-amber-200/80 bg-amber-50/90 px-4 py-2.5 dark:border-amber-900/50 dark:bg-amber-950/40">
            <p className="text-center text-[12px] leading-snug text-amber-950 dark:text-amber-100">
              {s.recipientOwnerProposeHint}
            </p>
            {ownerSettingsPath ? (
              <div className="mt-2 flex justify-center">
                <LinkButton href={ownerSettingsPath as Route} variant="outline" size="sm">
                  {s.recipientOwnerEditLink}
                </LinkButton>
              </div>
            ) : null}
          </div>
        ) : null}

        {showGuestProposeBanner ? (
          <div className="shrink-0 border-b border-border/50 px-3 py-2">
            <GuestAppCta
              headline={s.proposeSignInFirstHeadline}
              body={s.proposeSignInFirstBody}
              returnTo={returnTo}
            />
          </div>
        ) : null}

        {showVisitorProposeBanner ? (
          <p
            className={cn(
              "shrink-0 border-b border-border/50 px-4 py-2 text-center text-[12px] leading-snug text-muted-foreground",
            )}
          >
            {s.recipientVisitorProposeHint}
          </p>
        ) : null}

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden px-1 pb-1">
          <ScheduleShareGuestViewer
            fillParent
            readOnly={!allowProposals}
            snapshot={snapshot}
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
        </section>

        {showFooter ? (
          <div className="shrink-0 overflow-y-auto overscroll-y-contain border-t border-border/50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
            {allowProposals && isSignedIn && myProposal && !isEditingProposal ? (
              <ScheduleShareMyProposalCard
                proposal={myProposal}
                labels={myProposalCardLabels}
                onEdit={myProposal.status === "PENDING" ? startEditProposal : undefined}
              />
            ) : null}
            {!allowProposals && showGuestNudge ? (
              <GuestAppCta headline={s.registerNudgeHeadline} body={s.registerNudgeBody} returnTo={returnTo} />
            ) : null}
          </div>
        ) : null}
      </div>

      {showProposalPanel && proposalSelection ? (
        <AppPushLayer
          open
          onClose={cancelProposal}
          zClassName="z-50"
          panelClassName="w-[min(100vw,28rem)] border-0"
        >
          <div className="flex h-full min-h-0 flex-col bg-card pt-[env(safe-area-inset-top)]">
            <section className="flex min-h-0 flex-1 flex-col overflow-hidden border-border/60">
              <div className="relative flex min-h-12 shrink-0 items-center justify-center border-b border-border/50 px-4 py-2.5">
                <button
                  type="button"
                  onClick={cancelProposal}
                  aria-label={ui.common.close}
                  className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  <X className="h-5 w-5" strokeWidth={2.25} />
                </button>
                <h2 className="pointer-events-none text-center text-[15px] font-semibold text-foreground">
                  {panelLabels.proposalFormTitle}
                </h2>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2.5">
                <ScheduleShareProposalPanel
                  bare
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
                  onCancel={cancelProposal}
                  onSent={(proposal) => {
                    setMyProposal(proposal);
                    cancelProposal();
                  }}
                />
              </div>
            </section>
          </div>
        </AppPushLayer>
      ) : null}
    </>
  );
}
