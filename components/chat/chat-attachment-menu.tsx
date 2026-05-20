"use client";

import { apiFetch } from "@/lib/auth/api-fetch";
import type { LucideIcon } from "lucide-react";
import { CalendarClock, Image, MapPin, Plus, Share2, X } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { PlanRequestModal } from "@/components/chat/plan-request-modal";
import { useLocaleContext } from "@/components/i18n/locale-provider";
import { createScheduleSharePath } from "@/lib/schedule-share/create-schedule-share-client";
import { cn } from "@/lib/utils";

/** Square icon + one-word caption; `aria-label` carries the fuller action text. */
function AttachmentMenuTile({
  icon: Icon,
  caption,
  ariaLabel,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  caption: string;
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
        "flex min-h-[44px] w-full min-w-0 flex-col items-center justify-start gap-0.5 rounded-xl px-0.5 py-1 text-center outline-none transition",
        "hover:bg-primary/10 active:bg-primary/14",
        "focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:pointer-events-none disabled:opacity-40",
      )}
    >
      <span
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary",
        )}
        aria-hidden
      >
        <Icon className="h-[1.35rem] w-[1.35rem]" strokeWidth={2} />
      </span>
      <span className="w-full max-w-full px-0.5 text-[10px] font-medium leading-tight text-foreground/90 line-clamp-2 break-words sm:text-[11px]">
        {caption}
      </span>
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
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-input bg-background/80 text-foreground transition hover:bg-muted/50"
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
  const { messages } = useLocaleContext();
  const fileRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [planOpen, setPlanOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
          "grid w-full min-w-0 transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
        aria-hidden={!open}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="max-h-[min(320px,52dvh)] overflow-x-hidden overflow-y-auto overscroll-y-contain">
            <div
              className="border-t border-border/50 bg-transparent px-0 pb-1.5 pt-1.5"
              role="region"
              aria-label="Attachments: Photo, Location, Share schedule, Plan"
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
            <div role="menu" className="grid w-full min-w-0 grid-cols-4 gap-0 px-2.5 pb-0.5 pt-0">
              <AttachmentMenuTile
                icon={Image}
                caption="Photo"
                ariaLabel="Send photo"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              />
              <AttachmentMenuTile
                icon={MapPin}
                caption="Location"
                ariaLabel="Send location"
                disabled={busy}
                onClick={sendLocation}
              />
              <AttachmentMenuTile
                icon={Share2}
                caption="Schedule"
                ariaLabel="Share schedule link"
                disabled={busy}
                onClick={() => {
                  onClose();
                  void (async () => {
                    setBusy(true);
                    setError("");
                    const result = await createScheduleSharePath({
                      createFailed: messages.scheduleShare.createFailed,
                      networkError: messages.scheduleShare.networkError,
                    });
                    setBusy(false);
                    if (result.ok) {
                      router.push(result.path as Route);
                    } else {
                      setError(result.error);
                    }
                  })();
                }}
              />
              <AttachmentMenuTile
                icon={CalendarClock}
                caption="Plan"
                ariaLabel="Plan together"
                disabled={busy}
                onClick={() => {
                  onClose();
                  queueMicrotask(() => setPlanOpen(true));
                }}
              />
            </div>
            {error ? (
              <p className="mx-2.5 mt-1 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-[11px] leading-snug text-destructive">
                {error}
              </p>
            ) : null}
            </div>
          </div>
        </div>
      </div>

      <PlanRequestModal
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        mode={{ kind: "direct", connectionId }}
        peerName={peerName}
      />
    </>
  );
}
