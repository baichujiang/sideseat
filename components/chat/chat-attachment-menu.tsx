"use client";

import { apiFetch } from "@/lib/auth/api-fetch";
import type { LucideIcon } from "lucide-react";
import { CalendarClock, CalendarRange, Image, MapPin, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { PlanRequestModal } from "@/components/chat/plan-request-modal";
import { ShareAvailabilityModal } from "@/components/chat/share-availability-modal";
import { useRegisterDismissOnEdgeSwipe } from "@/components/ui/app-push-layer";
import { cn } from "@/lib/utils";

/** Icon-only actions — labels are for accessibility only (no on-screen captions). */
function AttachmentIconAction({
  icon: Icon,
  ariaLabel,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  ariaLabel: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary transition outline-none",
        "hover:bg-primary/18 active:bg-primary/22",
        "focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:pointer-events-none disabled:opacity-40",
      )}
    >
      <Icon className="h-[1.35rem] w-[1.35rem]" strokeWidth={2} aria-hidden />
    </button>
  );
}

export function ChatAttachmentPlusButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={open ? "Close attachment menu" : "Open attachment menu"}
      aria-expanded={open}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-input bg-background text-foreground shadow-sm transition hover:bg-muted/40"
    >
      {open ? <X className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} /> : <Plus className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} />}
    </button>
  );
}

export function ChatAttachmentTray({
  open,
  onClose,
  connectionId,
  peerName,
}: {
  open: boolean;
  onClose: () => void;
  connectionId: string;
  peerName: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [shareOpen, setShareOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useRegisterDismissOnEdgeSwipe(open, onClose);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

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
          typeof uploadPayload.error === "string" ? uploadPayload.error : "Upload failed.";
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
          typeof msgPayload.error === "string" ? msgPayload.error : "Could not send photo.";
        setError(msg);
        return;
      }
      onClose();
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
              typeof payload.error === "string" ? payload.error : "Could not send location.";
            setError(msg);
            return;
          }
          onClose();
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

  useEffect(() => {
    if (open) setError("");
  }, [open]);

  return (
    <>
      <div
        className={cn(
          "w-full min-w-0 overflow-hidden transition-[max-height] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          open ? "max-h-[min(240px,42dvh)]" : "max-h-0",
        )}
        aria-hidden={!open}
      >
        <div
          className={cn(
            "border-t border-border/60 bg-muted/20 px-1 pb-1 pt-2 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] dark:bg-muted/15",
            open ? "translate-y-0" : "translate-y-full",
          )}
          role="region"
          aria-label="Photo, location, availability, plan"
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
          <div
            role="menu"
            className="flex flex-row items-center justify-between gap-2 px-2 pb-0.5 pt-0.5 sm:justify-evenly sm:px-4"
          >
            <AttachmentIconAction
              icon={Image}
              ariaLabel="Send photo"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            />
            <AttachmentIconAction
              icon={MapPin}
              ariaLabel="Send location"
              disabled={busy}
              onClick={sendLocation}
            />
            <AttachmentIconAction
              icon={CalendarRange}
              ariaLabel="Share availability"
              disabled={busy}
              onClick={() => {
                onClose();
                setShareOpen(true);
              }}
            />
            <AttachmentIconAction
              icon={CalendarClock}
              ariaLabel="Plan together"
              disabled={busy}
              onClick={() => {
                onClose();
                setPlanOpen(true);
              }}
            />
          </div>
          {error ? (
            <p className="mx-1 mt-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-[11px] leading-snug text-destructive">
              {error}
            </p>
          ) : null}
        </div>
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
