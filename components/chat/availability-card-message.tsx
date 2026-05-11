"use client";

import { format } from "date-fns";
import { Ban, CalendarRange, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  getCachedAvailabilityShare,
  loadAvailabilityShare,
  revokeAvailabilityShare,
} from "@/lib/api/chat-planning";
import { AvailabilityViewer } from "@/components/chat/availability-viewer";
import { Button } from "@/components/ui/button";

export function AvailabilityCardMessage({
  shareId,
  ownerName,
  isOwner,
}: {
  shareId: string;
  ownerName: string;
  isOwner: boolean;
}) {
  const router = useRouter();
  const cached = getCachedAvailabilityShare(shareId);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [preview, setPreview] = useState<Array<{ startTime: string; endTime: string }>>(
    cached ? cached.days.flatMap((day) => day.slots).slice(0, 2) : [],
  );
  const [status, setStatus] = useState<"loading" | "active" | "revoked" | "expired" | "error">(
    cached?.status ?? "loading",
  );
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadAvailabilityShare(shareId)
      .then((data) => {
        if (cancelled) return;
        setStatus(data.status);
        const next = data.days.flatMap((day) => day.slots).slice(0, 2);
        setPreview(next);
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("error");
          setPreview([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [shareId]);

  const statusLine = useMemo(() => {
    if (status === "revoked") return "This availability is no longer available.";
    if (status === "expired") return "This availability has expired.";
    if (status === "error") return "Could not load availability. Pull to refresh or open the thread again.";
    return `Pick a time to plan something with ${ownerName}.`;
  }, [ownerName, status]);

  async function revoke() {
    if (revoking) return;
    setRevoking(true);
    try {
      await revokeAvailabilityShare(shareId);
      setStatus("revoked");
      router.refresh();
    } finally {
      setRevoking(false);
    }
  }

  return (
    <>
      <div className="mx-auto w-full max-w-md overflow-hidden rounded-[1.35rem] border border-sky-200/90 bg-sky-50/70 shadow-sm">
        <div className="h-1.5 w-full bg-sky-400/80" />
        <div className="p-3.5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500/12 text-sky-700">
              <CalendarRange className="h-4.5 w-4.5" strokeWidth={2.25} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-foreground">{ownerName} shared availability</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-foreground/75">{statusLine}</p>
              {preview.length > 0 && status === "active" ? (
                <div className="mt-2 space-y-1 text-[12px] font-medium text-foreground/85">
                  {preview.map((slot) => (
                    <p key={`${slot.startTime}-${slot.endTime}`}>
                      {format(new Date(slot.startTime), "EEE HH:mm")}–{format(new Date(slot.endTime), "HH:mm")}
                    </p>
                  ))}
                </div>
              ) : status === "loading" ? (
                <div className="mt-2 flex items-center gap-2 text-[12px] text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading times…
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              size="sm"
              className="flex-1 rounded-xl"
              disabled={status !== "active"}
              onClick={() => setViewerOpen(true)}
            >
              View available times
            </Button>
            {isOwner ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="inline-flex items-center gap-1.5 rounded-xl border-[#FECACA] bg-[#FEF2F2] text-[#DC2626] shadow-none hover:bg-[#FEE2E2] hover:text-[#DC2626] hover:border-[#FECACA] focus-visible:ring-[#FECACA]/40"
                disabled={status !== "active" || revoking}
                onClick={() => void revoke()}
              >
                {revoking ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" strokeWidth={2.25} />
                    Revoking…
                  </>
                ) : (
                  <>
                    <Ban className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                    Revoke
                  </>
                )}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <AvailabilityViewer
        open={viewerOpen}
        shareId={shareId}
        peerName={ownerName}
        onClose={() => setViewerOpen(false)}
      />
    </>
  );
}
