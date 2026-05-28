"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type DirectMessageListItemMeta = {
  id: string;
  senderId: string;
};

const BOTTOM_THRESHOLD_PX = 80;

export function DirectMessageList({
  messages,
  currentUserId,
  newMessageLabel,
  children,
}: {
  messages: DirectMessageListItemMeta[];
  currentUserId: string;
  newMessageLabel: string;
  children: React.ReactNode;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevMessagesRef = useRef<DirectMessageListItemMeta[] | null>(null);
  const isAtBottomRef = useRef(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const checkIsAtBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD_PX;
  }, []);

  const updateAtBottom = useCallback(() => {
    const next = checkIsAtBottom();
    isAtBottomRef.current = next;
    setIsAtBottom(next);
    if (next) setUnreadCount(0);
    return next;
  }, [checkIsAtBottom]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior });
    isAtBottomRef.current = true;
    setIsAtBottom(true);
    setUnreadCount(0);
  }, []);

  useLayoutEffect(() => {
    const previous = prevMessagesRef.current;
    if (!previous) {
      prevMessagesRef.current = messages;
      scrollToBottom("auto");
      return;
    }

    if (messages.length <= previous.length) {
      prevMessagesRef.current = messages;
      return;
    }

    const previousIds = new Set(previous.map((message) => message.id));
    const added = messages.filter((message) => !previousIds.has(message.id));
    const hasOwnMessage = added.some((message) => message.senderId === currentUserId);
    const remoteAddedCount = added.filter((message) => message.senderId !== currentUserId).length;
    const wasAtBottom = isAtBottomRef.current;

    prevMessagesRef.current = messages;

    if (hasOwnMessage) {
      scrollToBottom("smooth");
      return;
    }

    if (wasAtBottom) {
      scrollToBottom("auto");
      return;
    }

    if (remoteAddedCount > 0) {
      setUnreadCount((count) => count + remoteAddedCount);
    }
  }, [currentUserId, messages, scrollToBottom]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    updateAtBottom();
    el.addEventListener("scroll", updateAtBottom, { passive: true });
    return () => el.removeEventListener("scroll", updateAtBottom);
  }, [updateAtBottom]);

  return (
    <main className="relative min-h-0 flex-1 overflow-hidden bg-[#F6F8FB] dark:bg-[#090B10]">
      <div
        ref={listRef}
        className="h-full overflow-y-auto overscroll-y-contain px-3 py-2"
      >
        {children}
        <div ref={bottomRef} aria-hidden />
      </div>
      <NewMessageBadge
        visible={!isAtBottom && unreadCount > 0}
        label={newMessageLabel.replace("{count}", String(unreadCount))}
        onClick={() => scrollToBottom("smooth")}
      />
    </main>
  );
}

function NewMessageBadge({
  visible,
  label,
  onClick,
}: {
  visible: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center transition-all duration-200",
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="pointer-events-auto rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-lg shadow-primary/20 active:scale-[0.98]"
      >
        {label}
      </button>
    </div>
  );
}
