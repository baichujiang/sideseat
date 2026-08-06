"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { FormMessage } from "@/components/forms/form-message";
import {
  ChatComposerBar,
  ChatComposerSendButton,
} from "@/components/chat/chat-composer-chrome";
import { ChatMessageInput } from "@/components/chat/chat-message-input";
import { scheduleChatInputRefocus } from "@/components/chat/refocus-chat-input";
import { useAppMessages } from "@/hooks/use-app-locale";

export function GroupChatComposer({
  groupChatId,
}: {
  groupChatId: string;
}) {
  const router = useRouter();
  const messages = useAppMessages();
  const chat = messages.chat;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputId = `group-chat-input-${groupChatId}`;
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) return;
    const text = body.trim();
    if (!text) return;

    setSubmitting(true);
    setError("");
    setBody("");

    const response = await apiFetch(`/api/group-chats/${groupChatId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(typeof payload.error === "string" ? payload.error : chat.unableToSend);
      setBody((current) => (current.trim() ? current : text));
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    router.refresh();
    scheduleChatInputRefocus(inputRef, inputId);
  };

  return (
    <div data-chat-composer-root className="relative space-y-2">
      <div className="flex items-end gap-2">
        <ChatComposerBar>
          <label className="sr-only" htmlFor={inputId}>
            {chat.messageInputLabel}
          </label>
          <ChatMessageInput
            ref={inputRef}
            id={inputId}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onSend={() => void submit()}
            placeholder={chat.groupPlaceholder}
          />
          <ChatComposerSendButton
            disabled={submitting || !body.trim()}
            onClick={() => void submit()}
            ariaLabel={chat.sendAria}
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
