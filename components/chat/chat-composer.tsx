"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerUpLeft, Hourglass, MessageCircleMore, Plus, X } from "lucide-react";

import { FormMessage } from "@/components/forms/form-message";
import { useChatReply } from "@/components/chat/chat-reply-context";
import { useAppMessages } from "@/hooks/use-app-locale";
import { UNREPLIED_DIRECT_MESSAGE_LIMIT } from "@/lib/constants/app";
import { formatMessage } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";
import { ChatAttachmentPlusButton, ChatAttachmentTray } from "@/components/chat/chat-attachment-menu";
import {
  ChatComposerBar,
  ChatComposerSendButton,
  ChatComposerSlotButton,
} from "@/components/chat/chat-composer-chrome";
import { ChatMessageInput } from "@/components/chat/chat-message-input";
import { scheduleChatInputRefocus } from "@/components/chat/refocus-chat-input";

export function ChatComposer({
  connectionId,
  peerName,
  hideAttachments = false,
  placeholder,
  unrepliedSendBlocked = false,
  showUnrepliedHint = false,
  unrepliedStreak = 0,
  unrepliedLimit = UNREPLIED_DIRECT_MESSAGE_LIMIT,
}: {
  connectionId: string;
  peerName: string;
  /** Hide share-availability / plan (+) — used for notes-to-self threads. */
  hideAttachments?: boolean;
  placeholder?: string;
  /** True when unreplied direct-message limit is reached. */
  unrepliedSendBlocked?: boolean;
  /** Show the soft "up to 2 before they reply" hint. */
  showUnrepliedHint?: boolean;
  /** Viewer messages since the peer's last reply. */
  unrepliedStreak?: number;
  unrepliedLimit?: number;
}) {
  const router = useRouter();
  const { chat: c } = useAppMessages();
  const { replyTo, setReplyTo } = useChatReply();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputId = `chat-input-${connectionId}`;
  const composerRootRef = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const sendBlocked = unrepliedSendBlocked;

  useEffect(() => {
    if (!attachOpen) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (composerRootRef.current && !composerRootRef.current.contains(t)) {
        setAttachOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [attachOpen]);

  const submit = async () => {
    if (submitting || sendBlocked) return;
    const text = body.trim();
    if (!text) return;

    setSubmitting(true);
    setError("");
    setBody("");

    const response = await apiFetch(`/api/connections/${connectionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: text,
        replyToId: replyTo?.id,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = typeof payload.code === "string" ? payload.code : "";
      setError(
        code === "PEER_REPLY_REQUIRED"
          ? c.awaitingPeerReplyError
          : typeof payload.error === "string"
            ? payload.error
            : c.unableToSend,
      );
      setBody((current) => (current.trim() ? current : text));
      setSubmitting(false);
      return;
    }

    setReplyTo(null);
    setSubmitting(false);
    router.refresh();
    scheduleChatInputRefocus(inputRef, inputId);
  };

  useEffect(() => {
    if (sendBlocked) setAttachOpen(false);
  }, [sendBlocked]);

  return (
    <div ref={composerRootRef} data-chat-composer-root className="relative space-y-2">
      {sendBlocked || showUnrepliedHint ? (
        <UnrepliedReplyBanner
          blocked={sendBlocked}
          sent={Math.min(unrepliedStreak, unrepliedLimit)}
          max={unrepliedLimit}
        />
      ) : null}
      {replyTo ? (
        <ReplyPreview
          senderName={replyTo.senderName}
          body={replyTo.body}
          onCancel={() => setReplyTo(null)}
        />
      ) : null}
      <div className="flex min-h-0 items-end gap-2">
        <ChatComposerBar>
          {hideAttachments || sendBlocked ? (
            <ChatComposerSlotButton
              disabled
              aria-label={
                sendBlocked ? c.awaitingPeerReplyLimit : c.attachmentsUnavailableAria
              }
              title={sendBlocked ? c.awaitingPeerReplyLimit : c.attachmentsUnavailableTitle}
            >
              <Plus className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} />
            </ChatComposerSlotButton>
          ) : (
            <ChatAttachmentPlusButton open={attachOpen} onToggle={() => setAttachOpen((o) => !o)} />
          )}
          <label className="sr-only" htmlFor={inputId}>
            {c.messageInputLabel}
          </label>
          <ChatMessageInput
            ref={inputRef}
            id={inputId}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onSend={() => void submit()}
            placeholder={placeholder ?? (replyTo ? c.placeholderReply : c.placeholderWrite)}
            disabled={sendBlocked}
          />
          <ChatComposerSendButton
            disabled={submitting || sendBlocked || !body.trim()}
            onClick={() => void submit()}
            ariaLabel={c.sendAria}
          />
        </ChatComposerBar>
      </div>
      {!hideAttachments && !sendBlocked ? (
        <ChatAttachmentTray
          open={attachOpen}
          onClose={() => setAttachOpen(false)}
          connectionId={connectionId}
          peerName={peerName}
        />
      ) : null}
      {error ? (
        <div className="pb-0.5">
          <FormMessage message={error} />
        </div>
      ) : null}
    </div>
  );
}

function UnrepliedReplyBanner({
  blocked,
  sent,
  max,
}: {
  blocked: boolean;
  sent: number;
  max: number;
}) {
  const { chat: c } = useAppMessages();
  const Icon = blocked ? Hourglass : MessageCircleMore;
  const title = blocked ? c.awaitingPeerReplyLimitTitle : c.awaitingPeerReplyTitle;
  const body = blocked ? c.awaitingPeerReplyLimit : c.awaitingPeerReplyHint;

  return (
    <div
      data-testid="chat-unreplied-hint"
      role="status"
      className={cn(
        "flex items-start gap-2.5 rounded-2xl border px-3 py-2.5 shadow-sm transition-colors",
        blocked
          ? "border-amber-500/25 bg-gradient-to-r from-amber-500/[0.08] to-orange-500/[0.04] dark:border-amber-400/20 dark:from-amber-400/10 dark:to-transparent"
          : "border-classmates-azure/20 bg-gradient-to-r from-classmates-azure/[0.08] to-sky-500/[0.03] dark:border-sky-400/20 dark:from-sky-400/10 dark:to-transparent",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          blocked
            ? "bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300"
            : "bg-classmates-azure/15 text-classmates-azure dark:bg-sky-400/15 dark:text-sky-300",
        )}
        aria-hidden
      >
        <Icon className="h-4 w-4" strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p
            className={cn(
              "truncate text-[12.5px] font-semibold tracking-tight",
              blocked
                ? "text-amber-900 dark:text-amber-100"
                : "text-classmates-azure dark:text-sky-100",
            )}
          >
            {title}
          </p>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums",
              blocked
                ? "bg-amber-500/15 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200"
                : "bg-classmates-azure/12 text-classmates-azure dark:bg-sky-400/15 dark:text-sky-200",
            )}
          >
            {formatMessage(c.awaitingPeerReplyProgress, { sent, max })}
          </span>
        </div>
        <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{body}</p>
        <div className="mt-2 flex items-center gap-1.5" aria-hidden>
          {Array.from({ length: max }, (_, index) => {
            const filled = index < sent;
            return (
              <span
                key={index}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  filled
                    ? blocked
                      ? "bg-amber-500/70 dark:bg-amber-400/70"
                      : "bg-classmates-azure/70 dark:bg-sky-400/70"
                    : "bg-border/80 dark:bg-border/60",
                )}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ReplyPreview({
  senderName,
  body,
  onCancel,
}: {
  senderName: string | null;
  body: string;
  onCancel: () => void;
}) {
  const { chat: c, common } = useAppMessages();
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/25 px-3 py-2 shadow-sm">
      <CornerUpLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2.25} />
      <div className="min-w-0 flex-1 border-l-2 border-primary/60 pl-2">
        <p className="truncate text-[11px] font-semibold text-primary">
          {formatMessage(c.replyingTo, { name: senderName?.trim() || common.studentFallback })}
        </p>
        <p className="truncate text-[11.5px] text-muted-foreground">{body}</p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        aria-label={c.cancelReplyAria}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground/80 hover:bg-muted hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.25} />
      </button>
    </div>
  );
}
