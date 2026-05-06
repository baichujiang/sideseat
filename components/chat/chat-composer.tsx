"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CornerUpLeft, Plus, Send, X } from "lucide-react";

import { FormMessage } from "@/components/forms/form-message";
import { useChatReply } from "@/components/chat/chat-reply-context";
import { ChatAttachmentMenu } from "@/components/chat/chat-attachment-menu";
import { cn } from "@/lib/utils";

export function ChatComposer({
  connectionId,
  peerName,
  hideAttachments = false,
}: {
  connectionId: string;
  peerName: string;
  /** Hide share-availability / plan (+) — used for notes-to-self threads. */
  hideAttachments?: boolean;
}) {
  const router = useRouter();
  const { replyTo, setReplyTo } = useChatReply();
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
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
      setError(typeof payload.error === "string" ? payload.error : "Unable to send.");
      setSubmitting(false);
      return;
    }

    setBody("");
    setReplyTo(null);
    setSubmitting(false);
    router.refresh();
  };

  return (
    <div className="relative space-y-2 rounded-2xl border border-border bg-background/95 p-2 backdrop-blur-sm">
      {replyTo ? (
        <ReplyPreview
          senderName={replyTo.senderName}
          body={replyTo.body}
          onCancel={() => setReplyTo(null)}
        />
      ) : null}
      <div className="flex items-end gap-2 px-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-1">
        {hideAttachments ? (
          <button
            type="button"
            disabled
            aria-label="Attachments unavailable in self chat"
            title="Attachments unavailable in self chat"
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-dashed border-border/70 bg-muted/35 text-muted-foreground/60",
              "cursor-not-allowed",
            )}
          >
            <Plus className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} />
          </button>
        ) : (
          <ChatAttachmentMenu connectionId={connectionId} peerName={peerName} />
        )}
        <label className="sr-only" htmlFor={`chat-input-${connectionId}`}>
          Message
        </label>
        <textarea
          id={`chat-input-${connectionId}`}
          autoComplete="off"
          enterKeyHint="send"
          value={body}
          disabled={submitting}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={1}
          placeholder={replyTo ? "Write your reply…" : "Write a message…"}
          className={cn(
            "min-h-[44px] max-h-32 flex-1 resize-none rounded-2xl border border-input bg-muted/40 px-4 py-3 text-sm",
            "placeholder:text-muted-foreground/70",
            "outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
            "disabled:opacity-60",
          )}
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
          aria-label="Send"
        >
          <Send className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} />
        </button>
      </div>
      {error ? (
        <div className="px-3 pb-2">
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
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/30 px-3 py-1.5">
      <CornerUpLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2.25} />
      <div className="min-w-0 flex-1 border-l-2 border-primary/60 pl-2">
        <p className="truncate text-[11px] font-semibold text-primary">
          Replying to {senderName?.trim() || "Student"}
        </p>
        <p className="truncate text-[11.5px] text-muted-foreground">{body}</p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel reply"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground/80 hover:bg-muted hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.25} />
      </button>
    </div>
  );
}
