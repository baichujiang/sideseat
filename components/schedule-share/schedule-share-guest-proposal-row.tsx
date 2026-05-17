"use client";

import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { apiFetch } from "@/lib/auth/api-fetch";
import { Button } from "@/components/ui/button";
import { useLocaleContext } from "@/components/i18n/locale-provider";
import { cn } from "@/lib/utils";

export type GuestProposalRowModel = {
  id: string;
  guestDisplayName: string;
  guestContact: string | null;
  title: string;
  note: string | null;
  location: string | null;
  startTime: string;
  endTime: string;
};

export function ScheduleShareGuestProposalRow({
  proposal,
  isLast,
}: {
  proposal: GuestProposalRowModel;
  isLast: boolean;
}) {
  const router = useRouter();
  const { messages } = useLocaleContext();
  const s = messages.scheduleShare;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/schedule-share-proposals/${proposal.id}/accept`, {
        method: "POST",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload.success !== true) {
        setError(typeof payload.error === "string" ? payload.error : messages.scheduleShare.timeUnavailable);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/schedule-share-proposals/${proposal.id}/decline`, {
        method: "POST",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload.success !== true) {
        setError(typeof payload.error === "string" ? payload.error : messages.scheduleShare.submitProposalFailed);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const start = new Date(proposal.startTime);
  const end = new Date(proposal.endTime);

  return (
    <li className={cn(!isLast && "border-b border-border/50")}>
      <div className="flex flex-col gap-3 px-4 py-3.5">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-foreground">{proposal.title}</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {format(start, "EEE, MMM d")} · {format(start, "HH:mm")}–{format(end, "HH:mm")}
          </p>
          <p className="mt-1 text-[13px] text-foreground/90">
            {proposal.guestDisplayName}
            {proposal.guestContact ? ` · ${proposal.guestContact}` : ""}
          </p>
          {proposal.location ? (
            <p className="mt-0.5 text-[12px] text-muted-foreground">{proposal.location}</p>
          ) : null}
          {proposal.note ? (
            <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{proposal.note}</p>
          ) : null}
        </div>
        {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
        <div className="flex gap-2">
          <Button type="button" className="h-10 flex-1 rounded-xl" disabled={busy} onClick={accept}>
            {s.acceptProposal}
          </Button>
          <Button type="button" variant="outline" className="h-10 flex-1 rounded-xl" disabled={busy} onClick={decline}>
            {s.declineProposal}
          </Button>
        </div>
      </div>
    </li>
  );
}
