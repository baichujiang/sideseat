"use client";

import { createContext, useContext, useMemo, useState } from "react";

export type ReplyTarget = {
  id: string;
  body: string;
  senderName: string | null;
};

type ChatReplyContextValue = {
  replyTo: ReplyTarget | null;
  setReplyTo: (target: ReplyTarget | null) => void;
};

const ChatReplyContext = createContext<ChatReplyContextValue | null>(null);

/**
 * Thin client boundary around a chat page so message-level actions (the "…"
 * menu on a bubble) and the composer can share reply-to state without the
 * server page needing to wire callbacks through every row. Server children
 * render normally inside — React allows server-rendered trees to be nested
 * inside client providers.
 */
export function ChatReplyProvider({ children }: { children: React.ReactNode }) {
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const value = useMemo(() => ({ replyTo, setReplyTo }), [replyTo]);
  return (
    <ChatReplyContext.Provider value={value}>
      {children}
    </ChatReplyContext.Provider>
  );
}

export function useChatReply(): ChatReplyContextValue {
  const ctx = useContext(ChatReplyContext);
  if (!ctx) {
    // The hook is safe to call outside of the provider too; we just return a
    // no-op. Messages rendered standalone (e.g., admin debug views) then
    // don't pretend to support reply.
    return { replyTo: null, setReplyTo: () => {} };
  }
  return ctx;
}
