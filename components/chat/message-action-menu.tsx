"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerUpLeft, Copy, Flag, Trash2, MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useChatMessageSelection } from "@/components/chat/chat-message-selection";
import { useChatReply } from "@/components/chat/chat-reply-context";
import { useLocaleContext } from "@/components/i18n/locale-provider";
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

const REPORT_REASON_VALUES = [
  "HARASSMENT",
  "REPEATED_UNWANTED_CONTACT",
  "OFFENSIVE_LANGUAGE",
  "SPAM",
  "FAKE_IDENTITY",
  "OTHER",
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
  const { messages } = useLocaleContext();
  const chat = messages.chat;
  const common = messages.common;
  const { setReplyTo } = useChatReply();
  const { isSelected, selectMessage } = useChatMessageSelection();
  const actionsVisible = isSelected(message.id);
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
      setErr(chat.copyFailed);
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
    if (!confirm(chat.deleteMessageConfirm)) return;
    setBusy(true);
    const url =
      target.kind === "direct"
        ? `/api/connections/${target.connectionId}/messages/${target.messageId}`
        : `/api/courses/${target.courseId}/chat/messages/${target.messageId}`;
    const r = await apiFetch(url, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) {
      setErr(chat.deleteFailed);
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
      setErr(typeof payload.error === "string" ? payload.error : chat.deleteFailed);
      return;
    }
    close();
  };

  return (
    <Popover open={popoverOpen} onOpenChange={handleOpenChange} modal>
      <div
        data-chat-message-actions
        className="inline-flex self-center"
        onPointerDown={(e) => {
          e.stopPropagation();
          selectMessage(message.id);
        }}
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
            aria-label={chat.messageActionsAria}
            aria-expanded={popoverOpen}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/70 opacity-0 transition hover:bg-muted hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 active:opacity-100 sm:group-hover:opacity-100",
              actionsVisible && "opacity-100",
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
            <MenuItem icon={CornerUpLeft} label={chat.actionReply} onClick={doReply} />
            <MenuItem icon={Copy} label={chat.actionCopy} onClick={copy} />
            {isOwn ? (
              <MenuItem
                icon={Trash2}
                label={busy ? common.deleting : chat.actionDelete}
                onClick={remove}
                destructive
              />
            ) : (
              <MenuItem
                icon={Flag}
                label={chat.actionReport}
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
  const { messages } = useLocaleContext();
  const chat = messages.chat;
  const common = messages.common;
  const reasons = useMemo(
    () =>
      REPORT_REASON_VALUES.map((value) => ({
        value,
        label:
          value === "HARASSMENT"
            ? chat.reportReasonHarassment
            : value === "REPEATED_UNWANTED_CONTACT"
              ? chat.reportReasonRepeated
              : value === "OFFENSIVE_LANGUAGE"
                ? chat.reportReasonOffensive
                : value === "SPAM"
                  ? chat.reportReasonSpam
                  : value === "FAKE_IDENTITY"
                    ? chat.reportReasonFakeIdentity
                    : chat.reportReasonOther,
      })),
    [chat],
  );
  const [reason, setReason] = useState<string>(REPORT_REASON_VALUES[0]);
  const [details, setDetails] = useState("");
  return (
    <div role="dialog" aria-label={chat.reportMessageTitle}>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {chat.reportMessageTitle}
      </p>
      <label className="block">
        <span className="sr-only">{chat.reportReasonLabel}</span>
        <select
          className="field-select mb-2 h-9 w-full text-[13px]"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          {reasons.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <textarea
        className="mb-2 h-16 w-full resize-none rounded-lg border border-input bg-background px-2 py-1.5 text-[12.5px]"
        placeholder={chat.reportNotePlaceholder}
        maxLength={500}
        value={details}
        onChange={(e) => setDetails(e.target.value)}
      />
      {err ? <p className="mb-1.5 text-[11px] text-destructive">{err}</p> : null}
      <div className="flex gap-1.5">
        <Button size="sm" type="button" variant="ghost" className="flex-1" onClick={onCancel}>
          {common.cancel}
        </Button>
        <Button
          size="sm"
          type="button"
          className="flex-1"
          disabled={busy}
          onClick={() => onSubmit(reason, details)}
        >
          {busy ? common.sending : chat.sendAria}
        </Button>
      </div>
    </div>
  );
}
