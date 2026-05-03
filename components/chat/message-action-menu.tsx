"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerUpLeft, Copy, Flag, Trash2, MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useChatReply } from "@/components/chat/chat-reply-context";
import { cn } from "@/lib/utils";

export type MessageTarget =
  | { kind: "direct"; connectionId: string; messageId: string }
  | { kind: "course"; courseId: string; messageId: string };

export type MessageSummary = {
  id: string;
  body: string;
  senderName: string | null;
  senderId: string;
};

const REPORT_REASONS = [
  { value: "HARASSMENT", label: "Harassment" },
  { value: "REPEATED_UNWANTED_CONTACT", label: "Repeated unwanted contact" },
  { value: "OFFENSIVE_LANGUAGE", label: "Offensive language" },
  { value: "SPAM", label: "Spam" },
  { value: "FAKE_IDENTITY", label: "Fake identity" },
  { value: "OTHER", label: "Other" },
] as const;

/**
 * Per-message action menu. Opens either via:
 *  - long-press on the bubble (mobile)
 *  - click on the "…" affordance that shows next to the bubble on hover
 *    (desktop / touch-as-mouse)
 *
 * The menu renders as a compact popover anchored to the triggering bubble's
 * alignment edge. Positioning is viewport-clamped so it never overflows.
 *
 * Items depend on ownership:
 *  - Reply, Copy  → everyone
 *  - Delete       → message sender only
 *  - Report       → everyone except the sender
 */
export function MessageActionMenu({
  anchorClassName,
  isOwn,
  message,
  target,
}: {
  /** Additional classes for the "…" button shown on hover. */
  anchorClassName?: string;
  isOwn: boolean;
  message: MessageSummary;
  target: MessageTarget;
}) {
  const router = useRouter();
  const { setReplyTo } = useChatReply();
  const [open, setOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open && !reportOpen) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      const el = sheetRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) {
        setOpen(false);
        setReportOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setReportOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, reportOpen]);

  const close = () => {
    setOpen(false);
    setReportOpen(false);
    setErr(null);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.body);
      close();
    } catch {
      setErr("Couldn't copy.");
    }
  };

  const doReply = () => {
    setReplyTo({
      id: message.id,
      body: message.body,
      senderName: message.senderName,
    });
    close();
  };

  const remove = async () => {
    if (busy) return;
    if (!confirm("Delete this message? This cannot be undone.")) return;
    setBusy(true);
    const url =
      target.kind === "direct"
        ? `/api/connections/${target.connectionId}/messages/${target.messageId}`
        : `/api/courses/${target.courseId}/chat/messages/${target.messageId}`;
    const r = await fetch(url, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) {
      setErr("Couldn't delete.");
      return;
    }
    close();
    router.refresh();
  };

  const report = async (reason: string, details: string) => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const body =
      target.kind === "direct"
        ? { messageId: message.id, reportedUserId: message.senderId, reason, details }
        : {
            courseRoomMessageId: message.id,
            reportedUserId: message.senderId,
            reason,
            details,
          };
    const r = await fetch(`/api/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!r.ok) {
      const payload = await r.json().catch(() => ({}));
      setErr(typeof payload.error === "string" ? payload.error : "Couldn't report.");
      return;
    }
    close();
  };

  return (
    <div
      className="relative inline-flex self-center"
      onContextMenu={(e) => {
        e.preventDefault();
        setOpen(true);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label="Message actions"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/70 opacity-0 transition hover:bg-muted hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 active:opacity-100 sm:group-hover:opacity-100",
          anchorClassName,
        )}
      >
        <MoreHorizontal className="h-4 w-4" strokeWidth={2} />
      </button>

      {open && !reportOpen ? (
        <div
          ref={sheetRef}
          role="menu"
          className={cn(
            "absolute bottom-8 z-20 min-w-[160px] rounded-xl border border-border bg-popover p-1 text-sm shadow-lg",
            isOwn ? "right-0" : "left-0",
          )}
        >
          <MenuItem icon={CornerUpLeft} label="Reply" onClick={doReply} />
          <MenuItem icon={Copy} label="Copy" onClick={copy} />
          {isOwn ? (
            <MenuItem
              icon={Trash2}
              label={busy ? "Deleting…" : "Delete"}
              onClick={remove}
              destructive
            />
          ) : (
            <MenuItem
              icon={Flag}
              label="Report message"
              onClick={() => setReportOpen(true)}
              destructive
            />
          )}
          {err ? (
            <p className="px-2.5 py-1.5 text-[11px] text-destructive">{err}</p>
          ) : null}
        </div>
      ) : null}

      {reportOpen ? (
        <ReportForm
          sheetRef={sheetRef}
          isOwn={isOwn}
          busy={busy}
          err={err}
          onSubmit={(reason, details) => {
            void report(reason, details);
          }}
          onCancel={close}
        />
      ) : null}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition hover:bg-muted active:bg-muted/70",
        destructive ? "text-destructive" : "text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function ReportForm({
  sheetRef,
  isOwn,
  busy,
  err,
  onSubmit,
  onCancel,
}: {
  sheetRef: React.RefObject<HTMLDivElement | null>;
  isOwn: boolean;
  busy: boolean;
  err: string | null;
  onSubmit: (reason: string, details: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState<string>(REPORT_REASONS[0].value);
  const [details, setDetails] = useState("");
  return (
    <div
      ref={sheetRef}
      role="dialog"
      aria-label="Report message"
      className={cn(
        "absolute bottom-8 z-20 w-[240px] rounded-xl border border-border bg-popover p-2.5 text-sm shadow-lg",
        isOwn ? "right-0" : "left-0",
      )}
    >
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Report message
      </p>
      <label className="block">
        <span className="sr-only">Reason</span>
        <select
          className="field-select mb-2 h-9 w-full text-[13px]"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          {REPORT_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <textarea
        className="mb-2 h-16 w-full resize-none rounded-lg border border-input bg-background px-2 py-1.5 text-[12.5px]"
        placeholder="Optional note (500 chars)"
        maxLength={500}
        value={details}
        onChange={(e) => setDetails(e.target.value)}
      />
      {err ? <p className="mb-1.5 text-[11px] text-destructive">{err}</p> : null}
      <div className="flex gap-1.5">
        <Button
          size="sm"
          type="button"
          variant="ghost"
          className="flex-1"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          type="button"
          className="flex-1"
          disabled={busy}
          onClick={() => onSubmit(reason, details)}
        >
          {busy ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
}
