"use client";

import { forwardRef, type FocusEvent, type InputHTMLAttributes, type KeyboardEvent } from "react";

import { chatComposerInputClassName } from "@/components/chat/chat-composer-chrome";
import { cn } from "@/lib/utils";

/** Shared 1:1 / group chat field — single-line input so mobile keyboards show Send, not 确认+换行. */
export const ChatMessageInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
    onSend?: () => void;
  }
>(function ChatMessageInput({ className, onFocus, onKeyDown, onSend, ...props }, ref) {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    onSend?.();
  };
  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    onFocus?.(event);
    const input = event.currentTarget;
    const keepVisible = () => {
      input.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
    };
    requestAnimationFrame(keepVisible);
    window.setTimeout(keepVisible, 120);
    window.setTimeout(keepVisible, 320);
  };

  return (
    <input
      ref={ref}
      type="text"
      enterKeyHint="send"
      inputMode="text"
      autoComplete="off"
      className={cn(chatComposerInputClassName, className)}
      onFocus={handleFocus}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
});
