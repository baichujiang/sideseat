"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";

import { FormMessage } from "@/components/forms/form-message";
import { ChatMessageInput } from "@/components/chat/chat-message-input";
import { ChatThreadSearchButton } from "@/components/chat/chat-thread-search-button";
import type { ThreadSearchEntry } from "@/lib/chat/thread-search-index";
import { cn } from "@/lib/utils";

export function GroupChatComposer({
  groupChatId,
  threadSearchEntries = [],
}: {
  groupChatId: string;
  threadSearchEntries?: ThreadSearchEntry[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) return;
    const text = body.trim();
    if (!text) return;

    setSubmitting(true);
    setError("");

    const response = await apiFetch(`/api/group-chats/${groupChatId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(typeof payload.error === "string" ? payload.error : "Unable to send.");
      setSubmitting(false);
      return;
    }

    setBody("");
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
      <div className="flex items-end gap-2">
        <ChatThreadSearchButton entries={threadSearchEntries} />
        <label className="sr-only" htmlFor={`group-chat-input-${groupChatId}`}>
          Message
        </label>
        <ChatMessageInput
          ref={inputRef}
          id={`group-chat-input-${groupChatId}`}
          value={body}
          onChange={(e) => setBody(e.target.value.replace(/[\r\n]+/g, " "))}
          onSend={() => void submit()}
          placeholder="Message the group…"
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
        <div className="pb-0.5">
          <FormMessage message={error} />
        </div>
      ) : null}
    </div>
  );
}
