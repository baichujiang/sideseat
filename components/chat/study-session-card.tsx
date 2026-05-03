"use client";

import { useState } from "react";
import { StudySessionProposalStatus } from "@prisma/client";
import {
  BookOpen,
  CalendarClock,
  Check,
  Coffee,
  MapPin,
  MessageSquareReply,
  Users,
  X,
} from "lucide-react";
import { format, isToday, isTomorrow } from "date-fns";

import { Button } from "@/components/ui/button";
import { StudySessionSheet } from "@/components/chat/study-session-sheet";
import { ACTIVITY_TYPE_LABEL, type ActivityTypeValue } from "@/lib/constants/activities";
import { cn } from "@/lib/utils";

export type ProposalCard = {
  id: string;
  proposerId: string;
  proposerName: string | null;
  activityType: ActivityTypeValue;
  startAt: Date;
  endAt: Date;
  location: string | null;
  note: string | null;
  status: StudySessionProposalStatus;
  /** For display when status === SUPERSEDED (rare — the newer proposal
   *  usually carries the conversation forward). */
  supersededByCounter?: boolean;
};

/**
 * A proposal card rendered inline in the chat stream. Visually an event
 * card (not a speech bubble) to distinguish structured content from text.
 *
 * State rendering:
 *  - PROPOSED: recipient sees Accept / Decline / Counter; proposer sees
 *    "Waiting for X" + Cancel.
 *  - ACCEPTED: both see a confirmed banner with "Added to your calendar".
 *  - DECLINED / CANCELED / SUPERSEDED / EXPIRED: muted state with reason.
 *
 * All state-changing buttons POST to the per-proposal endpoint; the sheet
 * (for counter) posts JSON. `router.refresh()` is handled by the sheet
 * itself; native form posts redirect back via the server.
 */
export function StudySessionCard({
  connectionId,
  viewerId,
  proposal,
  returnTo,
}: {
  connectionId: string;
  viewerId: string;
  proposal: ProposalCard;
  returnTo: string;
}) {
  const [counterOpen, setCounterOpen] = useState(false);
  const isProposer = proposal.proposerId === viewerId;
  const action = `/api/connections/${connectionId}/proposals/${proposal.id}`;
  const when = formatWhen(proposal.startAt, proposal.endAt);
  const activityLabel = ACTIVITY_TYPE_LABEL[proposal.activityType];
  const isAccepted = proposal.status === StudySessionProposalStatus.ACCEPTED;
  const tone = activityTone(proposal.activityType, proposal.status);
  const ActivityIcon = tone.icon;

  return (
    <div className="mx-auto w-full max-w-md">
      <div
        className={cn(
          "overflow-hidden rounded-[1.35rem] border bg-background shadow-sm",
          tone.borderClass,
        )}
      >
        <div className={cn("h-1.5 w-full", tone.topBarClass)} />
        <div className="flex items-start gap-3 p-3.5">
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
              tone.iconBgClass,
            )}
          >
            <ActivityIcon className="h-4.5 w-4.5" strokeWidth={2.25} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", tone.badgeClass)}>
                {activityLabel}
              </span>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {statusLabel(proposal.status, isProposer, proposal.proposerName)}
              </p>
            </div>
            <p className="mt-2 text-[15px] font-semibold leading-tight text-foreground">
              {headlineForActivity(proposal.activityType)}
            </p>
            <p className="mt-1.5 text-[14px] font-semibold leading-tight">{when}</p>
            {proposal.location ? (
              <p className="mt-1 flex items-center gap-1 text-[12.5px] text-muted-foreground">
                <MapPin className="h-3 w-3" strokeWidth={2.25} />
                <span className="truncate">{proposal.location}</span>
              </p>
            ) : null}
            {proposal.note ? (
              <p className="mt-2 line-clamp-3 text-[12.5px] leading-relaxed text-foreground/80">
                {proposal.note}
              </p>
            ) : null}
          </div>
        </div>

        {proposal.status === StudySessionProposalStatus.PROPOSED ? (
          <div className="border-t border-border/60 bg-muted/20 p-2.5">
            {isProposer ? (
              <form action={action} method="post">
                <input name="action" type="hidden" value="cancel" />
                <input name="returnTo" type="hidden" value={returnTo} />
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full rounded-xl text-muted-foreground hover:text-foreground"
                  type="submit"
                >
                  Cancel proposal
                </Button>
              </form>
            ) : (
              <div className="flex gap-1.5">
                <form action={action} method="post" className="flex-1">
                  <input name="action" type="hidden" value="decline" />
                  <input name="returnTo" type="hidden" value={returnTo} />
                  <Button size="sm" variant="ghost" className="w-full rounded-xl" type="submit">
                    <X className="mr-1 h-3.5 w-3.5" strokeWidth={2.25} />
                    Decline
                  </Button>
                </form>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 rounded-xl"
                  type="button"
                  onClick={() => setCounterOpen(true)}
                >
                  <MessageSquareReply
                    className="mr-1 h-3.5 w-3.5"
                    strokeWidth={2.25}
                  />
                  Counter
                </Button>
                <form action={action} method="post" className="flex-1">
                  <input name="action" type="hidden" value="accept" />
                  <input name="returnTo" type="hidden" value={returnTo} />
                  <Button size="sm" className="w-full rounded-xl" type="submit">
                    <Check className="mr-1 h-3.5 w-3.5" strokeWidth={2.25} />
                    Accept
                  </Button>
                </form>
              </div>
            )}
          </div>
        ) : isAccepted ? (
          <div className="border-t border-emerald-200/80 bg-emerald-50 px-3.5 py-2.5 text-[11.5px] font-medium text-emerald-800">
            Added to both calendars.
          </div>
        ) : null}
      </div>

      <StudySessionSheet
        open={counterOpen}
        onClose={() => setCounterOpen(false)}
        mode="counter"
        action={action}
        initial={{
          activityType: proposal.activityType,
          startAt: proposal.startAt,
          endAt: proposal.endAt,
          location: proposal.location,
          note: proposal.note,
        }}
      />
    </div>
  );
}

function formatWhen(start: Date, end: Date): string {
  const dayLabel = isToday(start)
    ? "Today"
    : isTomorrow(start)
      ? "Tomorrow"
      : format(start, "EEE MMM d");
  const sameDay =
    start.toDateString() === end.toDateString();
  const startT = format(start, "HH:mm");
  const endT = format(end, sameDay ? "HH:mm" : "EEE HH:mm");
  return `${dayLabel} · ${startT} – ${endT}`;
}

function statusLabel(
  status: StudySessionProposalStatus,
  isProposer: boolean,
  proposerName: string | null,
): string {
  const name = proposerName?.trim() || "they";
  switch (status) {
    case "PROPOSED":
      return isProposer ? "Waiting for their reply" : `${name} proposed`;
    case "ACCEPTED":
      return "Activity confirmed";
    case "DECLINED":
      return "Declined";
    case "CANCELED":
      return isProposer ? "You canceled" : `${name} canceled`;
    case "SUPERSEDED":
      return "Superseded by a counter-proposal";
    case "EXPIRED":
      return "Expired";
    default:
      return "Activity";
  }
}

function headlineForActivity(activityType: ActivityTypeValue): string {
  switch (activityType) {
    case "LUNCH":
      return "Lunch together";
    case "MEETUP":
      return "Meet up";
    case "GO_TO_CLASS":
      return "Go to class together";
    case "STUDY_SESSION":
    default:
      return "Study together";
  }
}

function activityTone(
  activityType: ActivityTypeValue,
  status: StudySessionProposalStatus,
): {
  icon: typeof CalendarClock;
  borderClass: string;
  topBarClass: string;
  iconBgClass: string;
  badgeClass: string;
} {
  const accepted = status === StudySessionProposalStatus.ACCEPTED;
  if (accepted) {
    return {
      icon: CalendarClock,
      borderClass: "border-emerald-300/80",
      topBarClass: "bg-emerald-400/80",
      iconBgClass: "bg-emerald-500/15 text-emerald-700",
      badgeClass: "bg-emerald-500/12 text-emerald-800",
    };
  }

  switch (activityType) {
    case "LUNCH":
      return {
        icon: Coffee,
        borderClass: "border-amber-300/75",
        topBarClass: "bg-amber-300/80",
        iconBgClass: "bg-amber-100 text-amber-800",
        badgeClass: "bg-amber-100 text-amber-800",
      };
    case "MEETUP":
      return {
        icon: Users,
        borderClass: "border-sky-300/75",
        topBarClass: "bg-sky-300/80",
        iconBgClass: "bg-sky-100 text-sky-800",
        badgeClass: "bg-sky-100 text-sky-800",
      };
    case "GO_TO_CLASS":
      return {
        icon: CalendarClock,
        borderClass: "border-violet-300/75",
        topBarClass: "bg-violet-300/80",
        iconBgClass: "bg-violet-100 text-violet-800",
        badgeClass: "bg-violet-100 text-violet-800",
      };
    case "STUDY_SESSION":
    default:
      return {
        icon: BookOpen,
        borderClass: "border-primary/30",
        topBarClass: "bg-primary/55",
        iconBgClass: "bg-primary/10 text-primary",
        badgeClass: "bg-primary/10 text-primary",
      };
  }
}
