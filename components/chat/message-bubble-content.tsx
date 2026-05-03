import { CornerUpLeft } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Renders the inside of a chat bubble, including:
 *  - A small "replying to X" strip if the message quotes another.
 *  - A tombstone placeholder if the message has been soft-deleted.
 *  - The body otherwise.
 *
 * Kept presentational so both 1:1 and course-room chats can share it — the
 * bubble shell (bg color, rounded-corner direction, alignment) stays with
 * the calling page.
 */
export function MessageBubbleContent({
  body,
  deleted,
  reply,
  isOwn,
}: {
  body: string;
  deleted: boolean;
  reply: { senderName: string | null; body: string; deleted: boolean } | null;
  isOwn: boolean;
}) {
  if (deleted) {
    return (
      <p className="italic text-[13px] text-muted-foreground">
        Message deleted
      </p>
    );
  }
  return (
    <div>
      {reply ? <QuoteStrip reply={reply} isOwn={isOwn} /> : null}
      <p className="whitespace-pre-wrap break-words">{body}</p>
    </div>
  );
}

function QuoteStrip({
  reply,
  isOwn,
}: {
  reply: { senderName: string | null; body: string; deleted: boolean };
  isOwn: boolean;
}) {
  const preview = reply.deleted ? "Message deleted" : reply.body;
  return (
    <div
      className={cn(
        "mb-1.5 flex items-start gap-1.5 rounded-md border-l-2 px-2 py-1 text-[11.5px] leading-snug",
        isOwn
          ? "border-primary-foreground/60 bg-primary-foreground/10 text-primary-foreground/90"
          : "border-primary/60 bg-primary/5 text-foreground/80",
      )}
    >
      <CornerUpLeft className="mt-0.5 h-3 w-3 shrink-0 opacity-70" strokeWidth={2.25} />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-[10.5px] font-semibold",
            isOwn ? "text-primary-foreground" : "text-primary",
          )}
        >
          {reply.senderName?.trim() || "Student"}
        </p>
        <p
          className={cn(
            "line-clamp-2",
            reply.deleted ? "italic opacity-70" : undefined,
          )}
        >
          {preview}
        </p>
      </div>
    </div>
  );
}
