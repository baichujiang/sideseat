"use client";

import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
  type TextareaHTMLAttributes,
} from "react";

import { chatComposerInputClassName } from "@/components/chat/chat-composer-chrome";
import { cn } from "@/lib/utils";

/** Shared chat field: single-line by default, grows up to four mobile-friendly rows. */
export const ChatMessageInput = forwardRef<
  HTMLTextAreaElement,
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "rows"> & {
    onSend?: () => void;
  }
>(function ChatMessageInput({ className, onChange, onFocus, onKeyDown, onSend, value, ...props }, ref) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const [isComposing, setIsComposing] = useState(false);

  const setRefs = (node: HTMLTextAreaElement | null) => {
    localRef.current = node;
    if (typeof ref === "function") {
      ref(node);
    } else if (ref) {
      ref.current = node;
    }
  };

  const autosize = (textarea: HTMLTextAreaElement) => {
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 96)}px`;
  };

  useEffect(() => {
    const textarea = localRef.current;
    if (!textarea) return;
    if (!value) {
      requestAnimationFrame(() => {
        textarea.style.height = "auto";
      });
      return;
    }
    autosize(textarea);
  }, [value]);

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    autosize(event.currentTarget);
    onChange?.(event);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key !== "Enter" || event.shiftKey || isComposing || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    onSend?.();
  };

  const handleFocus = (event: FocusEvent<HTMLTextAreaElement>) => {
    onFocus?.(event);
    const textarea = event.currentTarget;
    const keepVisible = () => {
      textarea.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
    };
    requestAnimationFrame(keepVisible);
    window.setTimeout(keepVisible, 120);
    window.setTimeout(keepVisible, 320);
  };

  return (
    <textarea
      ref={setRefs}
      rows={1}
      enterKeyHint="send"
      inputMode="text"
      autoComplete="off"
      className={cn(chatComposerInputClassName, className)}
      value={value}
      onChange={handleChange}
      onCompositionStart={() => setIsComposing(true)}
      onCompositionEnd={() => setIsComposing(false)}
      onFocus={handleFocus}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
});
