"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerUpLeft, Plus, Send, X } from "lucide-react";

import { FormMessage } from "@/components/forms/form-message";
import { useChatReply } from "@/components/chat/chat-reply-context";
import { useAppMessages } from "@/hooks/use-app-locale";
import { formatMessage } from "@/lib/i18n/messages";
import { ChatAttachmentPlusButton, ChatAttachmentTray } from "@/components/chat/chat-attachment-menu";
import { ChatMessageInput } from "@/components/chat/chat-message-input";
import { ChatThreadSearchButton } from "@/components/chat/chat-thread-search-button";
import type { ThreadSearchEntry } from "@/lib/chat/thread-search-index";
import { cn } from "@/lib/utils";

export function ChatComposer({
  connectionId,
  peerName,
  hideAttachments = false,
  threadSearchEntries = [],
}: {
  connectionId: string;
  peerName: string;
  /** Hide share-availability / plan (+) — used for notes-to-self threads. */
  hideAttachments?: boolean;
  /** Server-built index for in-thread search (scroll-to message). */
  threadSearchEntries?: ThreadSearchEntry[];
}) {
  const router = useRouter();
  const { chat: c, common } = useAppMessages();
  const { replyTo, setReplyTo } = useChatReply();
  const inputRef = useRef<HTMLInputElement>(null);
  const composerRootRef = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);

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
    if (submitting) return;
    const text = body.trim();
    if (!text) return;

    setSubmitting(true);
    setError("");

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
      setError(typeof payload.error === "string" ? payload.error : c.unableToSend);
      setSubmitting(false);
      return;
    }

    setBody("");
    setReplyTo(null);
    setSubmitting(false);
    router.refresh();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        inputRef.current?.focus({ preventScroll: true });
      });
    });
  };

  return (
    <div ref={composerRootRef} className="relative space-y-2">
      {replyTo ? (
        <ReplyPreview
          senderName={replyTo.senderName}
          body={replyTo.body}
          onCancel={() => setReplyTo(null)}
        />
      ) : null}
      <div className="flex min-h-0 items-end gap-2">
          <ChatThreadSearchButton entries={threadSearchEntries} />
          {hideAttachments ? (
            <button
              type="button"
              disabled
              aria-label={c.attachmentsUnavailableAria}
              title={c.attachmentsUnavailableTitle}
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-dashed border-border/70 bg-muted/35 text-muted-foreground/60",
                "cursor-not-allowed",
              )}
            >
              <Plus className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} />
            </button>
          ) : (
            <ChatAttachmentPlusButton open={attachOpen} onToggle={() => setAttachOpen((o) => !o)} />
          )}
          <label className="sr-only" htmlFor={`chat-input-${connectionId}`}>
            {c.messageInputLabel}
          </label>
          <ChatMessageInput
            ref={inputRef}
            id={`chat-input-${connectionId}`}
            value={body}
            onChange={(e) => setBody(e.target.value.replace(/[\r\n]+/g, " "))}
            onSend={() => void submit()}
            placeholder={replyTo ? c.placeholderReply : c.placeholderWrite}
          />
          <button
            type="button"
            disabled={submitting || !body.trim()}
            onClick={() => void submit()}
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition",
              "hover:bg-primary/90",
              "disabled:pointer-events-none disabled:opacity-35",
            )}
            aria-label={c.sendAria}
          >
            <Send className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} />
          </button>
        </div>
        {!hideAttachments ? (
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
    <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/30 px-3 py-1.5">
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
