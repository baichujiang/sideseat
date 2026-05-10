"use client";

import { apiFetch } from "@/lib/auth/api-fetch";
import type { LucideIcon } from "lucide-react";
import { CalendarPlus, Clock3, ImagePlus, MapPin, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type TransitionEvent } from "react";
import { createPortal } from "react-dom";

import { PlanRequestModal } from "@/components/chat/plan-request-modal";
import { ShareAvailabilityModal } from "@/components/chat/share-availability-modal";
import { useRegisterDismissOnEdgeSwipe } from "@/components/ui/app-push-layer";
import { cn } from "@/lib/utils";

const SHEET_TRANSITION_MS = 300;

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
  const closeTimerRef = useRef<number | null>(null);
  const onCloseRef = useRef<() => void>(() => {});
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);
  const [open, setOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const closeSheet = useCallback(() => {
    setOpen(false);
  }, []);

  onCloseRef.current = closeSheet;

  useRegisterDismissOnEdgeSwipe(open, closeSheet);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setEntered(true));
      });
      return () => cancelAnimationFrame(id);
    }
    setEntered(false);
  }, [open]);

  const onPanelTransitionEnd = useCallback(
    (e: TransitionEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget || e.propertyName !== "transform") return;
      if (!open) {
        if (closeTimerRef.current !== null) {
          window.clearTimeout(closeTimerRef.current);
          closeTimerRef.current = null;
        }
        setMounted(false);
      }
    },
    [open],
  );

  useEffect(() => {
    if (!open && mounted) {
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;
        setMounted(false);
      }, SHEET_TRANSITION_MS + 120);
      return () => {
        if (closeTimerRef.current !== null) {
          window.clearTimeout(closeTimerRef.current);
          closeTimerRef.current = null;
        }
      };
    }
  }, [open, mounted]);

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);

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

  const dur = `${SHEET_TRANSITION_MS}ms`;

  const sheet =
    mounted && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[60] flex flex-col"
            role="presentation"
          >
            <button
              type="button"
              aria-label="Close attachment menu"
              onClick={closeSheet}
              className={cn(
                "absolute inset-0 bg-black/45 transition-opacity ease-out dark:bg-black/55",
                entered ? "opacity-100" : "opacity-0",
              )}
              style={{ transitionDuration: dur }}
            />
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 flex max-h-[min(70dvh,28rem)] justify-center"
              role="dialog"
              aria-modal="true"
              aria-label="Attachments and actions"
            >
              <div
                className={cn(
                  "pointer-events-auto w-full max-w-lg rounded-t-[1.35rem] border border-border/80 bg-background shadow-[0_-8px_40px_-12px_rgba(15,23,42,0.28)] dark:bg-card dark:shadow-[0_-12px_48px_-8px_rgba(0,0,0,0.55)]",
                  "transition-transform ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform",
                  entered ? "translate-y-0" : "translate-y-full",
                )}
                style={{
                  transitionDuration: dur,
                  paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
                }}
                onTransitionEnd={onPanelTransitionEnd}
              >
                <div className="flex flex-col pt-2">
                  <div
                    className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/25"
                    aria-hidden
                  />
                  <p className="mb-1 px-4 text-center text-[13px] font-semibold text-foreground">
                    Attach
                  </p>
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
                    className="flex flex-row flex-wrap justify-center gap-x-1 gap-y-1 px-3 pb-1 pt-2"
                  >
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
                    <p className="mx-4 mt-1 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] leading-snug text-destructive">
                      {error}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

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
          aria-expanded={open}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-input bg-background text-foreground shadow-sm transition hover:bg-muted/40"
        >
          {open ? (
            <X className="h-4.5 w-4.5" strokeWidth={2.25} />
          ) : (
            <Plus className="h-4.5 w-4.5" strokeWidth={2.25} />
          )}
        </button>
      </div>

      {sheet}

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
