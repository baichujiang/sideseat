"use client";

import { apiFetch } from "@/lib/auth/api-fetch";
import { CalendarPlus, Clock3, ImagePlus, MapPin, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { PlanRequestModal } from "@/components/chat/plan-request-modal";
import { ShareAvailabilityModal } from "@/components/chat/share-availability-modal";
import { cn } from "@/lib/utils";

function AttachmentIconButton({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition hover:bg-primary/15 active:bg-primary/20 disabled:pointer-events-none disabled:opacity-40",
      )}
    >
      {children}
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

  return (
    <>
      <div className="relative">
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

        {open ? (
          <div className="absolute bottom-[calc(100%+0.75rem)] left-0 z-20 min-w-[12.5rem] max-w-[min(100vw-1.5rem,20rem)] rounded-2xl border border-border/70 bg-background p-2 shadow-xl">
            <div className="flex flex-wrap gap-1.5">
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
              <AttachmentIconButton
                title="Photo"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus className="h-5 w-5" strokeWidth={2.25} />
              </AttachmentIconButton>
              <AttachmentIconButton title="Location" disabled={busy} onClick={sendLocation}>
                <MapPin className="h-5 w-5" strokeWidth={2.25} />
              </AttachmentIconButton>
              <AttachmentIconButton
                title="Share availability"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  setShareOpen(true);
                }}
              >
                <Clock3 className="h-5 w-5" strokeWidth={2.25} />
              </AttachmentIconButton>
              <AttachmentIconButton
                title="Suggest a plan"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  setPlanOpen(true);
                }}
              >
                <CalendarPlus className="h-5 w-5" strokeWidth={2.25} />
              </AttachmentIconButton>
            </div>
            {error ? <p className="mt-2 max-w-[16rem] text-[11px] text-destructive">{error}</p> : null}
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
