"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, X } from "lucide-react";

import { AppPushLayer } from "@/components/ui/app-push-layer";
import { Button } from "@/components/ui/button";
import { ACTIVITY_TYPE_OPTIONS, type ActivityTypeValue } from "@/lib/constants/activities";
import { cn } from "@/lib/utils";

const FIELD_INPUT =
  "h-11 w-full rounded-xl border border-input bg-background px-3.5 text-[14px] outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

/**
 * Modal sheet used to create OR counter a study-session proposal.
 *
 * Defaults are chosen to get users to "send" in one tap on mobile:
 *  - start = next half hour, duration 60 min
 *  - <input type="datetime-local"> (native picker on iOS/Android)
 *
 * Validation happens server-side; this UI surfaces the API error if the
 * server rejects (e.g., start time in the past).
 */
export function StudySessionSheet({
  open,
  onClose,
  mode,
  action,
  initial,
  presentation = "modal",
}: {
  open: boolean;
  onClose: () => void;
  mode: "create" | "counter";
  presentation?: "modal" | "anchored";
  /** Full URL for POST. Create and counter both hit POST endpoints. */
  action: string;
  /** Prefill values (used when countering). */
  initial?: {
    activityType?: ActivityTypeValue;
    startAt?: Date;
    endAt?: Date;
    location?: string | null;
    note?: string | null;
  };
}) {
  const router = useRouter();
  const defaults = useMemo(() => computeDefaults(initial), [initial]);
  const [activityType, setActivityType] = useState<ActivityTypeValue>(defaults.activityType);
  const [startAt, setStartAt] = useState(defaults.startAt);
  const [endAt, setEndAt] = useState(defaults.endAt);
  const [location, setLocation] = useState(defaults.location);
  const [note, setNote] = useState(defaults.note);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      setActivityType(defaults.activityType);
      setStartAt(defaults.startAt);
      setEndAt(defaults.endAt);
      setLocation(defaults.location);
      setNote(defaults.note);
      setErr(null);
    }
  }, [open, defaults]);

  useEffect(() => {
    if (!open || presentation !== "anchored") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const panel = panelRef.current;
      if (panel && e.target instanceof Node && !panel.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown, { passive: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open, onClose, presentation]);

  const anchoredShellClassName =
    "absolute inset-x-0 bottom-[calc(100%+0.75rem)] z-40 flex justify-center px-1";
  const anchoredPanelClassName = cn(
    "flex w-full max-w-md flex-col bg-background shadow-xl",
    "max-h-[min(70dvh,42rem)] rounded-[1.5rem] border border-border/70",
  );

  const submit = async () => {
    setBusy(true);
    setErr(null);
    // "datetime-local" values are interpreted in the user's locale timezone
    // automatically by the Date constructor — which is what we want for the
    // API (it coerces via Zod's `z.coerce.date()`).
    const payload: Record<string, unknown> = {
      activityType,
      startAt: new Date(startAt).toISOString(),
      endAt: new Date(endAt).toISOString(),
      location: location.trim() || undefined,
      note: note.trim() || undefined,
    };
    if (mode === "counter") payload.action = "counter";

    const r = await fetch(action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!r.ok) {
      const p = await r.json().catch(() => ({}));
      setErr(typeof p.error === "string" ? p.error : "Couldn't send.");
      return;
    }
    onClose();
    router.refresh();
  };

  const sheetBody = (
    <>
        <div className="shrink-0 px-4 pb-3 pt-2">
          {presentation === "modal" ? (
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-muted sm:hidden" />
          ) : null}
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                <CalendarClock className="h-4.5 w-4.5" strokeWidth={2.25} />
              </span>
              <div>
                <h2 className="text-sm font-semibold">
                  {mode === "counter" ? "Counter a plan" : "Plan together"}
                </h2>
                <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                  Pick the activity, time, and place. Once accepted, it lands in both calendars.
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

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 [-webkit-overflow-scrolling:touch]">
          <div className="space-y-3">
            <Labeled label="Activity">
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0">
                {ACTIVITY_TYPE_OPTIONS.map((option) => {
                  const active = option.value === activityType;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setActivityType(option.value)}
                      className={cn(
                        "min-h-11 shrink-0 rounded-[0.95rem] border px-3.5 py-2.5 text-left text-[13px] font-medium transition sm:min-h-0 sm:w-auto",
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-foreground/80 hover:border-foreground/20",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </Labeled>
            <div className="grid gap-3 sm:grid-cols-2">
              <Labeled label="Start">
                <input
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  className={FIELD_INPUT}
                />
              </Labeled>
              <Labeled label="End">
                <input
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                  className={FIELD_INPUT}
                />
              </Labeled>
            </div>
            <Labeled label="Location (optional)">
              <input
                type="text"
                maxLength={120}
                placeholder={locationPlaceholder(activityType)}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className={FIELD_INPUT}
                enterKeyHint="next"
              />
            </Labeled>
            <Labeled label="Note (optional)">
              <textarea
                maxLength={240}
                rows={3}
                placeholder={notePlaceholder(activityType)}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className={cn(FIELD_INPUT, "min-h-[88px] resize-none py-3")}
              />
            </Labeled>
          </div>
        </div>

        <div
          className={cn(
            "shrink-0 border-t border-border/60 px-4 pt-3",
            presentation === "modal"
              ? "pb-[max(1rem,env(safe-area-inset-bottom))]"
              : "pb-4",
          )}
        >
          {err ? (
            <p className="mb-2 text-[11.5px] text-destructive">{err}</p>
          ) : null}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              className="h-11 flex-1 rounded-xl"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="button" className="h-11 flex-1 rounded-xl" onClick={submit} disabled={busy}>
              {busy ? "Sending…" : "Confirm"}
            </Button>
          </div>
        </div>
    </>
  );

  if (presentation === "anchored") {
    if (!open) return null;
    return (
      <div className={anchoredShellClassName} role="dialog" aria-modal="true">
        <div ref={panelRef} className={anchoredPanelClassName}>
          {sheetBody}
        </div>
      </div>
    );
  }

  return (
    <AppPushLayer open={open} onClose={onClose} zClassName="z-40" panelClassName="w-[min(100vw,28rem)] border-0">
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background pt-[env(safe-area-inset-top)]">
        {sheetBody}
      </div>
    </AppPushLayer>
  );
}

function Labeled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function computeDefaults(initial?: {
  activityType?: ActivityTypeValue;
  startAt?: Date;
  endAt?: Date;
  location?: string | null;
  note?: string | null;
}) {
  if (initial?.startAt && initial?.endAt) {
    return {
      activityType: initial.activityType ?? "STUDY_SESSION",
      startAt: toLocalInputValue(initial.startAt),
      endAt: toLocalInputValue(initial.endAt),
      location: initial.location ?? "",
      note: initial.note ?? "",
    };
  }
  const now = new Date();
  // Round up to the next :00 or :30; skip ahead an hour so the user has time
  // to actually finish the form before the proposed start.
  const m = now.getMinutes();
  const roundTo = m < 30 ? 30 : 60;
  const start = new Date(now);
  start.setMinutes(roundTo, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    activityType: initial?.activityType ?? "STUDY_SESSION",
    startAt: toLocalInputValue(start),
    endAt: toLocalInputValue(end),
    location: "",
    note: "",
  };
}

function locationPlaceholder(activityType: ActivityTypeValue): string {
  switch (activityType) {
    case "LUNCH":
      return "Mensa, cafe, sushi place…";
    case "GO_TO_CLASS":
      return "Main entrance, U-Bahn, lecture hall…";
    case "MEETUP":
      return "Library, cafe, campus lawn…";
    case "STUDY_SESSION":
    default:
      return "Library 3rd floor, cafe, Zoom…";
  }
}

function notePlaceholder(activityType: ActivityTypeValue): string {
  switch (activityType) {
    case "LUNCH":
      return "Quick lunch after class?";
    case "GO_TO_CLASS":
      return "Want to head there together?";
    case "MEETUP":
      return "Let’s meet before class / on campus.";
    case "STUDY_SESSION":
    default:
      return "Bringing the problem set…";
  }
}
