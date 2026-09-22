"use client";

import { apiFetch } from "@/lib/auth/api-fetch";
import type { LucideIcon } from "lucide-react";
import { CalendarClock, Image, MapPin, Plus, Share2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { PlanRequestModal } from "@/components/chat/plan-request-modal";
import { ChatComposerSlotButton } from "@/components/chat/chat-composer-chrome";
import { CreateScheduleShareDialog } from "@/components/schedule-share/create-schedule-share-dialog";
import { useLocaleContext } from "@/components/i18n/locale-provider";
import { cn } from "@/lib/utils";

/** Matches schedule-share cards (sky), plan cards (amber), and other product accents. */
type AttachmentMenuTone = "violet" | "emerald" | "sky" | "amber";

const attachmentMenuToneClass: Record<
  AttachmentMenuTone,
  { shell: string; hover: string; focusRing: string }
> = {
  violet: {
    shell:
      "bg-violet-500/12 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
    hover: "hover:bg-violet-500/8 active:bg-violet-500/12",
    focusRing: "focus-visible:ring-violet-500/35",
  },
  emerald: {
    shell:
      "bg-emerald-500/12 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    hover: "hover:bg-emerald-500/8 active:bg-emerald-500/12",
    focusRing: "focus-visible:ring-emerald-500/35",
  },
  sky: {
    shell: "bg-sky-500/12 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    hover: "hover:bg-sky-500/8 active:bg-sky-500/12",
    focusRing: "focus-visible:ring-sky-500/35",
  },
  amber: {
    shell:
      "bg-amber-500/12 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    hover: "hover:bg-amber-500/8 active:bg-amber-500/12",
    focusRing: "focus-visible:ring-amber-500/35",
  },
};

/** Square icon + one-word caption; `aria-label` carries the fuller action text. */
function AttachmentMenuTile({
  icon: Icon,
  caption,
  ariaLabel,
  tone,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  caption: string;
  ariaLabel: string;
  tone: AttachmentMenuTone;
  onClick: () => void;
  disabled?: boolean;
}) {
  const toneStyle = attachmentMenuToneClass[tone];

  return (
    <button
      type="button"
      role="menuitem"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-[44px] w-full min-w-0 flex-col items-center justify-start gap-0.5 rounded-xl px-0.5 py-1 text-center outline-none transition",
        toneStyle.hover,
        "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        toneStyle.focusRing,
        "disabled:pointer-events-none disabled:opacity-40",
      )}
    >
      <span
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg",
          toneStyle.shell,
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
  const { messages } = useLocaleContext();
  return (
    <ChatComposerSlotButton
      onClick={onToggle}
      active={open}
      aria-label={open ? messages.chat.attachmentMenuCloseAria : messages.chat.attachmentMenuOpenAria}
      aria-expanded={open}
    >
      {open ? (
        <X className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} />
      ) : (
        <Plus className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} />
      )}
    </ChatComposerSlotButton>
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
  const [scheduleShareOpen, setScheduleShareOpen] = useState(false);
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
          typeof uploadPayload.error === "string" ? uploadPayload.error : messages.chat.uploadFailed;
        setError(msg);
        return;
      }
      const url = uploadPayload.data?.url;
      if (typeof url !== "string") {
        setError(messages.chat.uploadFailed);
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
          typeof msgPayload.error === "string" ? msgPayload.error : messages.chat.couldNotSendPhoto;
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
      setError(messages.chat.locationUnsupported);
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
              typeof payload.error === "string" ? payload.error : messages.chat.couldNotSendLocation;
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
        setError(messages.chat.locationPermissionDenied);
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
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
              className="border-t border-border/50 bg-muted/15 px-1 pb-1.5 pt-1.5"
              role="region"
              aria-label={messages.chat.attachmentMenuAria}
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
                caption={messages.chat.attachmentPhotoCaption}
                ariaLabel={messages.chat.attachmentPhotoAria}
                tone="violet"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              />
              <AttachmentMenuTile
                icon={MapPin}
                caption={messages.chat.attachmentLocationCaption}
                ariaLabel={messages.chat.attachmentLocationAria}
                tone="emerald"
                disabled={busy}
                onClick={sendLocation}
              />
              <AttachmentMenuTile
                icon={Share2}
                caption={messages.chat.attachmentScheduleCaption}
                ariaLabel={messages.chat.attachmentScheduleAria}
                tone="sky"
                disabled={busy}
                onClick={() => {
                  onClose();
                  queueMicrotask(() => setScheduleShareOpen(true));
                }}
              />
              <AttachmentMenuTile
                icon={CalendarClock}
                caption={messages.chat.attachmentPlanCaption}
                ariaLabel={messages.chat.attachmentPlanAria}
                tone="amber"
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
      <CreateScheduleShareDialog
        open={scheduleShareOpen}
        onClose={() => setScheduleShareOpen(false)}
        connectionId={connectionId}
        onSentToChat={() => {
          setScheduleShareOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}
