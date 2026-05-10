import { CornerUpLeft, MapPin } from "lucide-react";

import { cn } from "@/lib/utils";

/** `bareMedia` — image without outer chat tint; quote/caption read on page background. */
export type MessageBubbleSurface = "inBubble" | "bareMedia";

export type MessageBubblePayload =
  | { kind: "text"; body: string }
  | { kind: "image"; imageUrl: string; caption: string }
  | {
      kind: "location";
      lat: number;
      lng: number;
      name: string | null;
      caption: string;
    };

/**
 * Renders the inside of a chat bubble, including:
 *  - A small "replying to X" strip if the message quotes another.
 *  - A tombstone placeholder if the message has been soft-deleted.
 *  - Text, image, or location content otherwise.
 */
export function MessageBubbleContent({
  payload,
  deleted,
  reply,
  isOwn,
  surface = "inBubble",
}: {
  payload: MessageBubblePayload;
  deleted: boolean;
  reply: { senderName: string | null; body: string; deleted: boolean } | null;
  isOwn: boolean;
  /** When `bareMedia`, image is shown without outer bubble chrome (direct chats). */
  surface?: MessageBubbleSurface;
}) {
  if (deleted) {
    return (
      <p className="italic text-[13px] text-muted-foreground">Message deleted</p>
    );
  }
  const bare = surface === "bareMedia" && payload.kind === "image";
  return (
    <div>
      {reply ? <QuoteStrip reply={reply} isOwn={isOwn} surface={surface} /> : null}
      {payload.kind === "text" ? (
        <p className="whitespace-pre-wrap break-words">{payload.body}</p>
      ) : payload.kind === "image" ? (
        <div className={cn("space-y-1.5", bare && "text-left")}>
          {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded / blob URL */}
          <img
            src={payload.imageUrl}
            alt=""
            className={cn(
              "block max-h-64 w-full max-w-[min(100vw-4rem,20rem)] object-cover",
              bare ? "rounded-2xl" : "rounded-xl",
            )}
          />
          {payload.caption ? (
            <p
              className={cn(
                "whitespace-pre-wrap break-words text-[15px] leading-snug",
                bare &&
                  (isOwn
                    ? "text-right text-foreground/85"
                    : "text-left text-foreground/85"),
              )}
            >
              {payload.caption}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-1.5 text-left">
          <a
            href={`https://www.google.com/maps?q=${payload.lat},${payload.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-start gap-2 text-left font-medium underline-offset-2 hover:underline"
          >
            <MapPin
              className="mt-0.5 h-[18px] w-[18px] shrink-0 opacity-90"
              strokeWidth={2.25}
              aria-hidden
            />
            <span className="min-w-0">
              {payload.name?.trim() || "Shared location"}
              <span className="mt-0.5 block text-[11px] font-normal opacity-80">
                Open in Maps
              </span>
            </span>
          </a>
          {payload.caption ? (
            <p className="whitespace-pre-wrap break-words text-[15px] leading-snug">
              {payload.caption}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function QuoteStrip({
  reply,
  isOwn,
  surface,
}: {
  reply: { senderName: string | null; body: string; deleted: boolean };
  isOwn: boolean;
  surface: MessageBubbleSurface;
}) {
  const preview = reply.deleted ? "Message deleted" : reply.body;
  const bare = surface === "bareMedia";
  return (
    <div
      className={cn(
        "mb-1.5 flex items-start gap-1.5 rounded-md border-l-2 px-2 py-1 text-[11.5px] leading-snug",
        isOwn
          ? bare
            ? "border-primary/40 bg-primary/10 text-foreground/90"
            : "border-primary-foreground/60 bg-primary-foreground/10 text-primary-foreground/90"
          : "border-primary/60 bg-primary/5 text-foreground/80",
      )}
    >
      <CornerUpLeft className="mt-0.5 h-3 w-3 shrink-0 opacity-70" strokeWidth={2.25} />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-[10.5px] font-semibold",
            isOwn && !bare ? "text-primary-foreground" : "text-primary",
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
