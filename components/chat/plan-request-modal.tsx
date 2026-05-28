"use client";

import { format } from "date-fns";
import { CalendarClock, MapPin, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  counterProposePlanRequest,
  createDirectPlanRequest,
  createPlanRequestFromShare,
} from "@/lib/api/chat-planning";
import { ScheduleStyleDateTimeRange } from "@/components/schedule/event-datetime-pickers";
import { AppPushLayer } from "@/components/ui/app-push-layer";
import { Button } from "@/components/ui/button";
import type { PlanRequestPrefill } from "@/lib/calendar/plan-invite-from-event";
import { cn } from "@/lib/utils";

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
  prefill,
  layerZClassName = "z-50",
}: {
  open: boolean;
  onClose: () => void;
  mode: Mode;
  peerName: string;
  slot?: { startTime: string; endTime: string } | null;
  /** Prefill from Home calendar event (overrides generic defaults when open). */
  prefill?: PlanRequestPrefill | null;
  /** Stack above another push layer (e.g. availability viewer at z-50). */
  layerZClassName?: string;
}) {
  const router = useRouter();
  const defaults = useMemo(() => computeDefaults(slot, prefill), [slot, prefill]);
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [message, setMessage] = useState("");
  const [startAt, setStartAt] = useState(defaults.startAt);
  const [endAt, setEndAt] = useState(defaults.endAt);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(defaults.title);
    setLocation(defaults.location);
    setMessage(defaults.message);
    setStartAt(defaults.startAt);
    setEndAt(defaults.endAt);
    setErr(null);
  }, [open, defaults]);

  async function submit() {
    setBusy(true);
    setErr(null);
    const payload = {
      title: title.trim() || defaultTitle(),
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
    <AppPushLayer
      open={open}
      onClose={onClose}
      zClassName={layerZClassName}
      panelClassName="w-[min(100vw,28rem)] border-0"
      ariaLabel={mode.kind === "counter" ? "Suggest another time" : `Plan with ${peerName}`}
    >
      <div className="flex h-full min-h-0 flex-col bg-background pt-[env(safe-area-inset-top)]">
        <div className="shrink-0 px-4 pb-3 pt-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                <CalendarClock className="h-4.5 w-4.5" strokeWidth={2.25} />
              </span>
              <div>
                <h2 className="text-sm font-semibold">
                  {mode.kind === "counter" ? `Suggest another time` : `Plan with ${peerName}`}
                </h2>
                <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">Pick a time and add details.</p>
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

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3">
          <Labeled label="Title">
            <input
              className={FIELD_INPUT}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={defaultTitle()}
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
    </AppPushLayer>
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

function computeDefaults(
  slot?: { startTime: string; endTime: string } | null,
  prefill?: PlanRequestPrefill | null,
) {
  if (prefill?.startTime && prefill?.endTime) {
    return {
      title: prefill.title,
      location: prefill.location ?? "",
      message: prefill.message ?? "",
      startAt: format(new Date(prefill.startTime), "yyyy-MM-dd'T'HH:mm"),
      endAt: format(new Date(prefill.endTime), "yyyy-MM-dd'T'HH:mm"),
    };
  }
  if (slot?.startTime && slot?.endTime) {
    return {
      title: "",
      location: "",
      message: "",
      startAt: format(new Date(slot.startTime), "yyyy-MM-dd'T'HH:mm"),
      endAt: format(new Date(slot.endTime), "yyyy-MM-dd'T'HH:mm"),
    };
  }
  const now = new Date();
  now.setMinutes(now.getMinutes() < 30 ? 30 : 0, 0, 0);
  if (now.getMinutes() === 0) now.setHours(now.getHours() + 1);
  const end = new Date(now.getTime() + 60 * 60 * 1000);
  return {
    title: "",
    location: "",
    message: "",
    startAt: format(now, "yyyy-MM-dd'T'HH:mm"),
    endAt: format(end, "yyyy-MM-dd'T'HH:mm"),
  };
}

function defaultTitle() {
  return "Plan together";
}
