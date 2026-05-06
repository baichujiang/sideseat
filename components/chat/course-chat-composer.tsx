"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Send } from "lucide-react";

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
      <div className="relative space-y-2 bg-background/95 p-2 backdrop-blur-sm">
      {replyTo ? (
        <ReplyPreview
          senderName={replyTo.senderName}
          body={replyTo.body}
          onCancel={() => setReplyTo(null)}
        />
      ) : null}
      <div className="flex items-end gap-2 px-1 pb-0 pt-1">
        <button
          type="button"
          disabled
          aria-label="Attachments unavailable in course chat"
          title="Attachments unavailable in course chat"
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-dashed border-border/70 bg-muted/35 text-muted-foreground/60",
            "cursor-not-allowed",
          )}
        >
          <Plus className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} />
        </button>
        <label className="sr-only" htmlFor={`course-chat-input-${courseId}`}>
          Message
        </label>
        <textarea
          id={`course-chat-input-${courseId}`}
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
          placeholder={replyTo ? "Reply…" : "Message the class…"}
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
    </div>
  );
}
