"use client";

import { apiFetch } from "@/lib/auth/api-fetch";
import type { LucideIcon } from "lucide-react";
import { CalendarPlus, Clock3, ImagePlus, MapPin, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { PlanRequestModal } from "@/components/chat/plan-request-modal";
import { ShareAvailabilityModal } from "@/components/chat/share-availability-modal";
import { cn } from "@/lib/utils";

function AttachmentMenuTile({
  icon: Icon,
  title,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-[4.75rem] shrink-0 flex-col items-center gap-1.5 rounded-xl py-2 transition outline-none",
        "hover:bg-muted/80 active:bg-muted/95",
        "focus-visible:bg-muted/80 focus-visible:ring-2 focus-visible:ring-ring/40",
        "disabled:pointer-events-none disabled:opacity-40",
      )}
    >
      <span
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary"
        aria-hidden
      >
        <Icon className="h-7 w-7" strokeWidth={2} />
      </span>
      <span className="line-clamp-2 w-full px-0.5 text-center text-[11px] font-medium leading-tight text-foreground">
        {title}
      </span>
    </button>
  );
}

export function ChatAttachmentMenu({
  connectionId,
  peerName,
}: {
  connectionId: string;
  peerName: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; bottom: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function sendImageFile(file: File) {
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.set("file", file);
      const up = await apiFetch(`/api/connections/${connectionId}/chat-images`, {
        method: "POST",
        body: fd,
      });
      const uploadPayload = await up.json().catch(() => ({}));
      if (!up.ok || uploadPayload.success !== true) {
        const msg =
          typeof uploadPayload.error === "string"
            ? uploadPayload.error
            : "Upload failed.";
        setError(msg);
        return;
      }
      const url = uploadPayload.data?.url;
      if (typeof url !== "string") {
        setError("Upload failed.");
        return;
      }
      const msgRes = await apiFetch(`/api/connections/${connectionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "IMAGE", imageUrl: url, body: "" }),
      });
      const msgPayload = await msgRes.json().catch(() => ({}));
      if (!msgRes.ok || msgPayload.success !== true) {
        const msg =
          typeof msgPayload.error === "string"
            ? msgPayload.error
            : "Could not send photo.";
        setError(msg);
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function sendLocation() {
    if (!navigator.geolocation) {
      setError("Location is not supported on this device.");
      return;
    }
    setBusy(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await apiFetch(`/api/connections/${connectionId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "LOCATION",
              locationLat: pos.coords.latitude,
              locationLng: pos.coords.longitude,
              body: "",
            }),
          });
          const payload = await r.json().catch(() => ({}));
          if (!r.ok || payload.success !== true) {
            const msg =
              typeof payload.error === "string"
                ? payload.error
                : "Could not send location.";
            setError(msg);
            return;
          }
          setOpen(false);
          router.refresh();
        } finally {
          setBusy(false);
        }
      },
      () => {
        setError("Could not read location. Check permissions in your browser settings.");
        setBusy(false);
      },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 120_000 },
    );
  }

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }

    const anchor = anchorRef.current;
    if (!anchor) return;

    const sync = () => {
      const r = anchor.getBoundingClientRect();
      const gap = 12;
      const bottom = window.innerHeight - r.top + gap;
      const panelMaxW = 352;
      const margin = 12;
      const left = Math.max(margin, Math.min(r.left, window.innerWidth - panelMaxW - margin));
      setMenuPos({ left, bottom });
    };

    sync();
    window.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("scroll", sync);
    document.addEventListener("scroll", sync, true);
    return () => {
      window.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("scroll", sync);
      document.removeEventListener("scroll", sync, true);
    };
  }, [open]);

  const menu =
    open && menuPos && typeof document !== "undefined"
      ? createPortal(
          <div
            role="menu"
            aria-label="Attachments and actions"
            className="fixed z-[60] w-[min(100vw-1.5rem,22rem)] rounded-2xl border border-border/70 bg-popover px-2 py-2 text-popover-foreground shadow-xl"
            style={{ left: menuPos.left, bottom: menuPos.bottom }}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void sendImageFile(f);
              }}
            />
            <div className="flex flex-row flex-wrap justify-center gap-x-1 gap-y-1">
              <AttachmentMenuTile
                icon={ImagePlus}
                title="Photo"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              />
              <AttachmentMenuTile icon={MapPin} title="Location" disabled={busy} onClick={sendLocation} />
              <AttachmentMenuTile
                icon={Clock3}
                title="Availability"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  setShareOpen(true);
                }}
              />
              <AttachmentMenuTile
                icon={CalendarPlus}
                title="Plan"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  setPlanOpen(true);
                }}
              />
            </div>
            {error ? (
              <p className="mt-2 border-t border-border/60 px-2 pb-1 pt-2 text-[12px] leading-snug text-destructive">
                {error}
              </p>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div className="relative" ref={anchorRef}>
        <button
          type="button"
          onClick={() => {
            setError("");
            setOpen((curr) => !curr);
          }}
          aria-label={open ? "Close attachment menu" : "Open attachment menu"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-input bg-background text-foreground shadow-sm transition hover:bg-muted/40"
        >
          {open ? (
            <X className="h-4.5 w-4.5" strokeWidth={2.25} />
          ) : (
            <Plus className="h-4.5 w-4.5" strokeWidth={2.25} />
          )}
        </button>
      </div>

      {menu}

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
