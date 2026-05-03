"use client";

import { PlanType } from "@prisma/client";
import { format } from "date-fns";
import { CalendarClock, MapPin, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  counterProposePlanRequest,
  createDirectPlanRequest,
  createPlanRequestFromShare,
} from "@/lib/api/chat-planning";
import { ScheduleStyleDateTimeRange } from "@/components/schedule/event-datetime-pickers";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PLAN_OPTIONS: Array<{ value: PlanType; label: string }> = [
  { value: "STUDY", label: "Study" },
  { value: "MEAL", label: "Meal" },
  { value: "SPORTS", label: "Sports" },
  { value: "LANGUAGE", label: "Language" },
  { value: "CUSTOM", label: "Custom" },
];

const FIELD_INPUT =
  "h-11 w-full rounded-xl border border-input bg-background px-3.5 text-[14px] outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

type Mode =
  | { kind: "direct"; connectionId: string }
  | { kind: "from-share"; shareId: string }
  | { kind: "counter"; requestId: string };

export function PlanRequestModal({
  open,
  onClose,
  mode,
  peerName,
  slot,
}: {
  open: boolean;
  onClose: () => void;
  mode: Mode;
  peerName: string;
  slot?: { startTime: string; endTime: string } | null;
}) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const defaults = useMemo(() => computeDefaults(slot), [slot]);
  const [planType, setPlanType] = useState<PlanType>("STUDY");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [message, setMessage] = useState("");
  const [startAt, setStartAt] = useState(defaults.startAt);
  const [endAt, setEndAt] = useState(defaults.endAt);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPlanType("STUDY");
    setTitle("");
    setLocation("");
    setMessage("");
    setStartAt(defaults.startAt);
    setEndAt(defaults.endAt);
    setErr(null);
  }, [open, defaults]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const panel = panelRef.current;
      if (panel && e.target instanceof Node && !panel.contains(e.target)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown, { passive: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  async function submit() {
    setBusy(true);
    setErr(null);
    const payload = {
      planType,
      title: title.trim() || defaultTitle(planType),
      location: location.trim() || undefined,
      message: message.trim() || undefined,
      startTime: new Date(startAt).toISOString(),
      endTime: new Date(endAt).toISOString(),
    };
    try {
      if (mode.kind === "from-share") {
        await createPlanRequestFromShare(mode.shareId, payload);
      } else if (mode.kind === "counter") {
        await counterProposePlanRequest(mode.requestId, payload);
      } else {
        await createDirectPlanRequest(mode.connectionId, payload);
      }
      onClose();
      router.refresh();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Unable to send request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panelRef} className="flex w-full max-w-md flex-col rounded-t-[1.75rem] bg-background shadow-2xl">
        <div className="px-4 pb-3 pt-2">
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-muted" />
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                <CalendarClock className="h-4.5 w-4.5" strokeWidth={2.25} />
              </span>
              <div>
                <h2 className="text-sm font-semibold">
                  {mode.kind === "counter" ? `Suggest another time` : `Plan with ${peerName}`}
                </h2>
                <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                  What do you want to plan?
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" strokeWidth={2.25} />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-3">
          <Labeled label="Type">
            <div className="grid grid-cols-2 gap-2">
              {PLAN_OPTIONS.map((option) => {
                const active = option.value === planType;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPlanType(option.value)}
                    className={cn(
                      "min-h-11 rounded-[0.95rem] border px-3 py-2 text-left text-[13px] font-medium transition",
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-foreground/80",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </Labeled>

          <Labeled label="Title">
            <input
              className={FIELD_INPUT}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={defaultTitle(planType)}
              maxLength={120}
            />
          </Labeled>

          <Labeled label="Location">
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={2.25} />
              <input
                className={cn(FIELD_INPUT, "pl-10")}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Library / Mensa / Online / TBD"
                maxLength={120}
              />
            </div>
          </Labeled>

          <Labeled label="Time">
            <ScheduleStyleDateTimeRange
              startAt={startAt}
              endAt={endAt}
              onChangeStart={setStartAt}
              onChangeEnd={setEndAt}
            />
          </Labeled>

          <Labeled label="Message (optional)">
            <textarea
              className={cn(FIELD_INPUT, "min-h-[88px] resize-none py-3")}
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={500}
              placeholder="Want to review the exercise sheet together?"
            />
          </Labeled>
        </div>

        <div className="border-t border-border/60 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {err ? <p className="mb-2 text-[11.5px] text-destructive">{err}</p> : null}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" className="h-11 flex-1 rounded-xl" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" className="h-11 flex-1 rounded-xl" onClick={submit} disabled={busy}>
              {busy ? "Sending…" : "Send request"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function computeDefaults(slot?: { startTime: string; endTime: string } | null) {
  if (slot?.startTime && slot?.endTime) {
    return {
      startAt: format(new Date(slot.startTime), "yyyy-MM-dd'T'HH:mm"),
      endAt: format(new Date(slot.endTime), "yyyy-MM-dd'T'HH:mm"),
    };
  }
  const now = new Date();
  now.setMinutes(now.getMinutes() < 30 ? 30 : 0, 0, 0);
  if (now.getMinutes() === 0) now.setHours(now.getHours() + 1);
  const end = new Date(now.getTime() + 60 * 60 * 1000);
  return {
    startAt: format(now, "yyyy-MM-dd'T'HH:mm"),
    endAt: format(end, "yyyy-MM-dd'T'HH:mm"),
  };
}

function defaultTitle(planType: PlanType) {
  switch (planType) {
    case "MEAL":
      return "Lunch together";
    case "SPORTS":
      return "Sports session";
    case "LANGUAGE":
      return "Language practice";
    case "CUSTOM":
      return "Plan together";
    default:
      return "Study together";
  }
}
