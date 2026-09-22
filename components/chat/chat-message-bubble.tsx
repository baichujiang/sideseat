"use client";

import type { PointerEvent, ReactNode } from "react";

import { useChatMessageSelection } from "@/components/chat/chat-message-selection";
import { cn } from "@/lib/utils";

const INTERACTIVE_SELECTOR =
  "a, button, input, textarea, select, [role='button'], [data-chat-message-actions]";

/**
 * Bubble-only hit target for message selection. Row padding and list background
 * are handled by the scroll container to dismiss selection / composer focus.
 */
export function ChatMessageBubble({
  messageId,
  className,
  children,
}: {
  messageId: string;
  className?: string;
  children: ReactNode;
}) {
  const { selectMessage, isSelected } = useChatMessageSelection();
  const selected = isSelected(messageId);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(INTERACTIVE_SELECTOR)) return;
    event.stopPropagation();
    selectMessage(messageId);
  };

  return (
    <div
      data-chat-message-bubble
      data-message-id={messageId}
      onPointerDown={onPointerDown}
      className={cn(
        className,
        selected &&
          "ring-2 ring-primary/40 ring-offset-2 ring-offset-[#F6F8FB] dark:ring-offset-[#090B10]",
      )}
    >
      {children}
    </div>
  );
}
