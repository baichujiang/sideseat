"use client";

import { CalendarPlus, Clock3, Plus, X } from "lucide-react";
import { useState } from "react";

import { ShareAvailabilityModal } from "@/components/chat/share-availability-modal";
import { PlanRequestModal } from "@/components/chat/plan-request-modal";

export function ChatAttachmentMenu({
  connectionId,
  peerName,
}: {
  connectionId: string;
  peerName: string;
}) {
  const [open, setOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((curr) => !curr)}
          aria-label={open ? "Close attachment menu" : "Open attachment menu"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-input bg-background text-foreground shadow-sm transition hover:bg-muted/40"
        >
          {open ? <X className="h-4.5 w-4.5" strokeWidth={2.25} /> : <Plus className="h-4.5 w-4.5" strokeWidth={2.25} />}
        </button>

        {open ? (
          <div className="absolute bottom-[calc(100%+0.75rem)] left-0 z-20 w-64 rounded-2xl border border-border/70 bg-background p-2 shadow-xl">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setShareOpen(true);
              }}
              className="flex w-full items-center gap-3 rounded-[1rem] px-3 py-3 text-left transition hover:bg-muted/40"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Clock3 className="h-4.5 w-4.5" strokeWidth={2.25} />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-foreground">Share availability</p>
                <p className="text-[11px] text-muted-foreground">Show free/busy time in chat</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setPlanOpen(true);
              }}
              className="flex w-full items-center gap-3 rounded-[1rem] px-3 py-3 text-left transition hover:bg-muted/40"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CalendarPlus className="h-4.5 w-4.5" strokeWidth={2.25} />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-foreground">Suggest a plan</p>
                <p className="text-[11px] text-muted-foreground">Send a direct plan request</p>
              </div>
            </button>
          </div>
        ) : null}
      </div>

      <ShareAvailabilityModal
        open={shareOpen}
        connectionId={connectionId}
        onClose={() => setShareOpen(false)}
      />

      <PlanRequestModal
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        mode={{ kind: "direct", connectionId }}
        peerName={peerName}
      />
    </>
  );
}
