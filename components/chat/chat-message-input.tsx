"use client";

import { forwardRef, type InputHTMLAttributes, type KeyboardEvent } from "react";

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
      className={cn(
        "h-11 min-w-0 flex-1 rounded-[1.25rem] border border-input bg-muted/40 px-3.5 text-[16px] leading-snug",
        "placeholder:text-muted-foreground/70",
        "outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
        className,
      )}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
});
