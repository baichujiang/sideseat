"use client";

import { forwardRef, type InputHTMLAttributes, type KeyboardEvent } from "react";

import { chatComposerInputClassName } from "@/components/chat/chat-composer-chrome";
import { cn } from "@/lib/utils";

/** Shared 1:1 / group chat field — single-line input so mobile keyboards show Send, not 确认+换行. */
export const ChatMessageInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
    onSend?: () => void;
  }
>(function ChatMessageInput({ className, onKeyDown, onSend, ...props }, ref) {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    onSend?.();
  };

  return (
    <input
      ref={ref}
      type="text"
      enterKeyHint="send"
      inputMode="text"
      autoComplete="off"
      className={cn(chatComposerInputClassName, className)}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
});
