"use client";

import { PlanRequestStatus, PlanType } from "@prisma/client";
import { format, isToday, isTomorrow } from "date-fns";
import { CalendarClock, Check, MapPin, MessageSquareReply, X } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { PlanRequestModal } from "@/components/chat/plan-request-modal";
import { acceptPlanRequest, declinePlanRequest } from "@/lib/api/chat-planning";

export function PlanRequestCardMessage({
  requestId,
  proposerName,
  receiverName,
  viewerUserId,
  proposerUserId,
  receiverUserId,
  planType,
  title,
  location,
  message,
  startTimeISO,
  endTimeISO,
  status,
}: {
  requestId: string;
  proposerName: string;
  receiverName: string;
  viewerUserId: string;
  proposerUserId: string;
  receiverUserId: string;
  planType: PlanType;
  title: string;
  location: string | null;
  message: string | null;
  startTimeISO: string;
  endTimeISO: string;
  status: PlanRequestStatus;
}) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<"accept" | "decline" | null>(null);
  const [counterOpen, setCounterOpen] = useState(false);
  const isReceiver = viewerUserId === receiverUserId;
  const start = new Date(startTimeISO);
  const end = new Date(endTimeISO);

  async function onAccept() {
    setBusyAction("accept");
    try {
      await acceptPlanRequest(requestId);
      router.refresh();
    } finally {
      setBusyAction(null);
    }
  }

  async function onDecline() {
    setBusyAction("decline");
    try {
      await declinePlanRequest(requestId);
      router.refresh();
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <>
      <div className="mx-auto w-full max-w-md overflow-hidden rounded-[1.35rem] border border-amber-200/90 bg-amber-50/80 shadow-sm">
        <div className="h-1.5 w-full bg-amber-400/80" />
        <div className="p-3.5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/12 text-amber-700">
              <CalendarClock className="h-4.5 w-4.5" strokeWidth={2.25} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                {status === "ACCEPTED"
                  ? "Plan confirmed"
                  : `${proposerName} suggested a plan`}
              </p>
              <p className="mt-1 text-[15px] font-semibold text-foreground">{title}</p>
              <p className="mt-1 text-[13px] font-medium text-foreground/85">{formatWhen(start, end)}</p>
              {location ? (
                <p className="mt-1 flex items-center gap-1 text-[12.5px] text-muted-foreground">
                  <MapPin className="h-3 w-3" strokeWidth={2.25} />
                  <span className="truncate">Location: {location}</span>
                </p>
              ) : null}
              {message ? (
                <p className="mt-2 text-[12.5px] leading-relaxed text-foreground/80">{message}</p>
              ) : null}
              <p className="mt-2 text-[11px] font-medium text-muted-foreground">
                {labelForType(planType)}
              </p>
            </div>
          </div>

          {status === "PENDING" && isReceiver ? (
            <div className="mt-3 flex gap-1.5">
              <Button type="button" size="sm" variant="ghost" className="flex-1 rounded-xl" onClick={() => void onDecline()} disabled={busyAction !== null}>
                <X className="mr-1 h-3.5 w-3.5" strokeWidth={2.25} />
                Decline
              </Button>
              <Button type="button" size="sm" variant="outline" className="flex-1 rounded-xl" onClick={() => setCounterOpen(true)} disabled={busyAction !== null}>
                <MessageSquareReply className="mr-1 h-3.5 w-3.5" strokeWidth={2.25} />
                Suggest another time
              </Button>
              <Button type="button" size="sm" className="flex-1 rounded-xl" onClick={() => void onAccept()} disabled={busyAction !== null}>
                <Check className="mr-1 h-3.5 w-3.5" strokeWidth={2.25} />
                Accept & add
              </Button>
            </div>
          ) : status === "PENDING" ? (
            <div className="mt-3 rounded-xl bg-background/80 px-3 py-2 text-[12px] text-muted-foreground">
              Waiting for {receiverName}'s reply.
            </div>
          ) : status === "ACCEPTED" ? (
            <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-[12px] font-medium text-emerald-800">
              Added to both schedules.
            </div>
          ) : status === "DECLINED" ? (
            <div className="mt-3 rounded-xl bg-background/80 px-3 py-2 text-[12px] text-muted-foreground">
              Declined.
            </div>
          ) : status === "COUNTER_PROPOSED" ? (
            <div className="mt-3 rounded-xl bg-background/80 px-3 py-2 text-[12px] text-muted-foreground">
              A new time was suggested in chat.
            </div>
          ) : null}
        </div>
      </div>

      <PlanRequestModal
        open={counterOpen}
        onClose={() => setCounterOpen(false)}
        mode={{ kind: "counter", requestId }}
        peerName={proposerName}
        slot={{ startTime: startTimeISO, endTime: endTimeISO }}
      />
    </>
  );
}

export function PlanConfirmedCardMessage({
  title,
  startTimeISO,
  endTimeISO,
}: {
  title: string;
  startTimeISO: string;
  endTimeISO: string;
}) {
  return (
    <div className="mx-auto w-full max-w-md overflow-hidden rounded-[1.35rem] border border-emerald-200/90 bg-emerald-50/80 shadow-sm">
      <div className="h-1.5 w-full bg-emerald-400/80" />
      <div className="p-3.5">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-emerald-800">
          Plan confirmed
        </p>
        <p className="mt-1 text-[15px] font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-[13px] font-medium text-foreground/85">
          {formatWhen(new Date(startTimeISO), new Date(endTimeISO))}
        </p>
        <p className="mt-3 text-[12px] font-medium text-emerald-800">Added to both schedules.</p>
      </div>
    </div>
  );
}

function formatWhen(start: Date, end: Date) {
  const dayLabel = isToday(start)
    ? "Today"
    : isTomorrow(start)
      ? "Tomorrow"
      : format(start, "EEE, MMM d");
  return `${dayLabel} · ${format(start, "HH:mm")}–${format(end, "HH:mm")}`;
}

function labelForType(planType: PlanType) {
  switch (planType) {
    case "MEAL":
      return "Meal";
    case "SPORTS":
      return "Sports";
    case "LANGUAGE":
      return "Language";
    case "CUSTOM":
      return "Custom";
    default:
      return "Study";
  }
}
