"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { FormMessage } from "@/components/forms/form-message";
import { ReplyPreview } from "@/components/chat/chat-composer";
import {
  ChatComposerBar,
  ChatComposerSendButton,
  ChatComposerSlotButton,
} from "@/components/chat/chat-composer-chrome";
import { ChatMessageInput } from "@/components/chat/chat-message-input";
import { ChatThreadSearchButton } from "@/components/chat/chat-thread-search-button";
import { useChatReply } from "@/components/chat/chat-reply-context";
import { useAppMessages } from "@/hooks/use-app-locale";
import type { ThreadSearchEntry } from "@/lib/chat/thread-search-index";

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
        <ChatComposerBar>
          <ChatComposerSlotButton
            disabled
            aria-label={co.courseChatAttachmentsUnavailableAria}
            title={co.courseChatAttachmentsUnavailableTitle}
          >
            <Plus className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} />
          </ChatComposerSlotButton>
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
          <ChatComposerSendButton
            disabled={submitting || !body.trim()}
            onClick={() => void submit()}
            ariaLabel={ch.sendAria}
          />
        </ChatComposerBar>
      </div>
      {error ? (
        <div className="pb-0.5">
          <FormMessage message={error} />
        </div>
      ) : null}
    </div>
  );
}
