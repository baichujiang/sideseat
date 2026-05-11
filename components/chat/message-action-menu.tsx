"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CornerUpLeft, Copy, Flag, Trash2, MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useChatReply } from "@/components/chat/chat-reply-context";
import { cn } from "@/lib/utils";

export type MessageTarget =
  | { kind: "direct"; connectionId: string; messageId: string }
  | { kind: "course"; courseId: string; messageId: string };

export type MessageSummary = {
  id: string;
  body: string;
  /** Reply / copy when `body` is not enough (e.g. image had no caption). */
  actionSnippet?: string;
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
 * Content is portaled with Radix collision handling so it stays within the
 * viewport and is not clipped by the chat scroll container.
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
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleOpenChange = (next: boolean) => {
    setPopoverOpen(next);
    if (!next) {
      setReportOpen(false);
      setErr(null);
    }
  };

  const close = () => {
    handleOpenChange(false);
  };

  const copy = async () => {
    try {
      const text = (message.actionSnippet ?? message.body).trim();
      await navigator.clipboard.writeText(text);
      close();
    } catch {
      setErr("Couldn't copy.");
    }
  };

  const doReply = () => {
    setReplyTo({
      id: message.id,
      body: message.actionSnippet ?? message.body,
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
    const r = await apiFetch(url, { method: "DELETE" });
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
    const r = await apiFetch(`/api/reports`, {
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
    <Popover open={popoverOpen} onOpenChange={handleOpenChange} modal>
      <div
        className="inline-flex self-center"
        onContextMenu={(e) => {
          e.preventDefault();
          setReportOpen(false);
          setErr(null);
          setPopoverOpen(true);
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Message actions"
            aria-expanded={popoverOpen}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/70 opacity-0 transition hover:bg-muted hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 active:opacity-100 sm:group-hover:opacity-100",
              anchorClassName,
            )}
          >
            <MoreHorizontal className="h-4 w-4" strokeWidth={2} />
          </button>
        </PopoverTrigger>
      </div>

      <PopoverContent
        side="top"
        sideOffset={8}
        align={isOwn ? "end" : "start"}
        collisionPadding={16}
        avoidCollisions
        className={cn(
          "max-h-[min(22rem,calc(100dvh-1.5rem))] overflow-y-auto p-1 text-sm",
          reportOpen ? "w-[min(100vw-2rem,240px)] p-2.5" : "min-w-[160px]",
        )}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {!reportOpen ? (
          <div role="menu">
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
        ) : (
          <ReportForm
            busy={busy}
            err={err}
            onSubmit={(reason, details) => {
              void report(reason, details);
            }}
            onCancel={close}
          />
        )}
      </PopoverContent>
    </Popover>
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
  busy,
  err,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  err: string | null;
  onSubmit: (reason: string, details: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState<string>(REPORT_REASONS[0].value);
  const [details, setDetails] = useState("");
  return (
    <div role="dialog" aria-label="Report message">
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
