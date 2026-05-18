"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Send } from "lucide-react";

import { FormMessage } from "@/components/forms/form-message";
import { ReplyPreview } from "@/components/chat/chat-composer";
import { ChatMessageInput } from "@/components/chat/chat-message-input";
import { ChatThreadSearchButton } from "@/components/chat/chat-thread-search-button";
import { useChatReply } from "@/components/chat/chat-reply-context";
import { useAppMessages } from "@/hooks/use-app-locale";
import type { ThreadSearchEntry } from "@/lib/chat/thread-search-index";
import { cn } from "@/lib/utils";

export function CourseChatComposer({
  courseId,
  threadSearchEntries = [],
}: {
  courseId: string;
  threadSearchEntries?: ThreadSearchEntry[];
}) {
  const router = useRouter();
  const { courses: co, chat: ch } = useAppMessages();
  const { replyTo, setReplyTo } = useChatReply();
  const inputRef = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) return;
    const text = body.trim();
    if (!text) return;

    setSubmitting(true);
    setError("");

    const response = await apiFetch(`/api/courses/${courseId}/chat/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: text,
        replyToId: replyTo?.id,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(typeof payload.error === "string" ? payload.error : ch.unableToSend);
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
    <div className="relative space-y-2">
      {replyTo ? (
        <ReplyPreview
          senderName={replyTo.senderName}
          body={replyTo.body}
          onCancel={() => setReplyTo(null)}
        />
      ) : null}
      <div className="flex items-end gap-2">
        <ChatThreadSearchButton entries={threadSearchEntries} />
        <button
          type="button"
          disabled
          aria-label={co.courseChatAttachmentsUnavailableAria}
          title={co.courseChatAttachmentsUnavailableTitle}
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-dashed border-border/70 bg-muted/35 text-muted-foreground/60",
            "cursor-not-allowed",
          )}
        >
          <Plus className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} />
        </button>
        <label className="sr-only" htmlFor={`course-chat-input-${courseId}`}>
          {co.courseChatComposerInputLabel}
        </label>
        <ChatMessageInput
          ref={inputRef}
          id={`course-chat-input-${courseId}`}
          value={body}
          onChange={(e) => setBody(e.target.value.replace(/[\r\n]+/g, " "))}
          onSend={() => void submit()}
          placeholder={replyTo ? ch.placeholderReply : co.courseChatComposerPlaceholder}
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
          aria-label={ch.sendAria}
        >
          <Send className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} />
        </button>
      </div>
      {error ? (
        <div className="pb-0.5">
          <FormMessage message={error} />
        </div>
      ) : null}
    </div>
  );
}
