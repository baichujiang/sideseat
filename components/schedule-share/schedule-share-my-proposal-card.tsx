"use client";

import type { ViewerScheduleShareProposal } from "@/lib/schedule-share/viewer-proposal";
import { cn } from "@/lib/utils";

export function ScheduleShareMyProposalCard({
  proposal,
  labels,
  onEdit,
}: {
  proposal: ViewerScheduleShareProposal;
  labels: {
    proposalPendingTitle: string;
    proposalPendingHint: string;
    proposalAcceptedTitle: string;
    proposalAcceptedHint: string;
    editProposal: string;
  };
  onEdit?: () => void;
}) {
  const isPending = proposal.status === "PENDING";
  const start = new Date(proposal.startTime);
  const end = new Date(proposal.endTime);
  const when =
    Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())
      ? ""
      : `${start.toLocaleString()} – ${end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  return (
    <section
      className={cn(
        "rounded-2xl border px-4 py-4",
        isPending ? "border-primary/30 bg-primary/5" : "border-emerald-500/30 bg-emerald-500/5",
      )}
    >
      <h2 className="text-[15px] font-semibold text-foreground">
        {isPending ? labels.proposalPendingTitle : labels.proposalAcceptedTitle}
      </h2>
      <p className="mt-1 text-[13px] font-medium text-foreground">{proposal.title}</p>
      {when ? <p className="mt-1 text-[12px] text-muted-foreground">{when}</p> : null}
      {proposal.location?.trim() ? (
        <p className="mt-0.5 text-[12px] text-muted-foreground">{proposal.location.trim()}</p>
      ) : null}
      <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
        {isPending ? labels.proposalPendingHint : labels.proposalAcceptedHint}
      </p>
      {isPending && onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          className="mt-3 text-[12px] font-semibold text-primary hover:underline"
        >
          {labels.editProposal}
        </button>
      ) : null}
    </section>
  );
}
