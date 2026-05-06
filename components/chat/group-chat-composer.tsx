"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";

import { FormMessage } from "@/components/forms/form-message";
import { cn } from "@/lib/utils";

export function GroupChatComposer({ groupChatId }: { groupChatId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
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
  };

  return (
    <div className="relative space-y-2 bg-background/95 p-2 backdrop-blur-sm">
      <div className="flex items-end gap-2 px-1 pb-0 pt-1">
        <label className="sr-only" htmlFor={`group-chat-input-${groupChatId}`}>
          Message
        </label>
        <textarea
          id={`group-chat-input-${groupChatId}`}
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
          placeholder="Message the group…"
          className={cn(
            "min-h-[44px] max-h-32 flex-1 resize-none rounded-2xl border border-input bg-muted/40 px-4 py-3 text-[16px] leading-snug",
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
