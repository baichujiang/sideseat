"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";

import { FormMessage } from "@/components/forms/form-message";
import { ReplyPreview } from "@/components/chat/chat-composer";
import { useChatReply } from "@/components/chat/chat-reply-context";
import { cn } from "@/lib/utils";

export function CourseChatComposer({ courseId }: { courseId: string }) {
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
    <div className="shrink-0 border-t border-border bg-background/95 backdrop-blur-sm">
      {replyTo ? (
        <ReplyPreview
          senderName={replyTo.senderName}
          body={replyTo.body}
          onCancel={() => setReplyTo(null)}
        />
      ) : null}
      <div className="flex items-center gap-2 px-3 py-2 pb-0 pt-2">
        <label className="sr-only" htmlFor={`course-chat-input-${courseId}`}>
          Message
        </label>
        <input
          id={`course-chat-input-${courseId}`}
          type="text"
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
          placeholder={replyTo ? "Reply…" : "Message the class…"}
          className={cn(
            "min-h-11 flex-1 rounded-full border border-input bg-muted/40 px-4 py-2.5 text-[16px] leading-snug",
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
