"use client";

import { CalendarPlus, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { apiFetch } from "@/lib/auth/api-fetch";
import { useAppMessages } from "@/hooks/use-app-locale";
import { cn } from "@/lib/utils";

export function DiscoverActivityAddCalendar({
  activityId,
  initialCalendarEntryId,
}: {
  activityId: string;
  initialCalendarEntryId: string | null;
}) {
  const da = useAppMessages().discoverActivity;
  const router = useRouter();
  const [entryId, setEntryId] = useState(initialCalendarEntryId);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function add() {
    if (busy || entryId) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await apiFetch(`/api/discover-activities/${activityId}/add-to-calendar`, {
        method: "POST",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error ?? da.addCalendarFailed);
      }
      setEntryId(payload.data.calendarEntryId);
      setMessage(da.addCalendarSuccess);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : da.addCalendarFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-dashed border-border/80 bg-muted/20 px-4 py-3">
      <button
        type="button"
        disabled={busy || Boolean(entryId)}
        onClick={() => void add()}
        className={cn(
          "inline-flex w-full items-center justify-center gap-2 rounded-xl border border-classmates-blue-border bg-classmates-blue-soft px-4 py-2.5 text-[13px] font-semibold text-classmates-blue",
          "disabled:opacity-60",
        )}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CalendarPlus className="h-4 w-4" aria-hidden />
        )}
        {entryId ? da.addCalendarDone : da.addCalendarCta}
      </button>
      {message ? <p className="mt-2 text-center text-[12px] text-muted-foreground">{message}</p> : null}
    </div>
  );
}
