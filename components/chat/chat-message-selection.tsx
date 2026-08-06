"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { dismissChatInputMode } from "@/lib/chat/dismiss-chat-input-mode";

type ChatMessageSelectionContextValue = {
  selectedMessageId: string | null;
  selectMessage: (id: string | null) => void;
  dismissInputMode: () => void;
  isSelected: (messageId: string) => boolean;
};

const ChatMessageSelectionContext = createContext<ChatMessageSelectionContextValue | null>(
  null,
);

export function ChatMessageSelectionProvider({ children }: { children: React.ReactNode }) {
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);

  const selectMessage = useCallback((id: string | null) => {
    setSelectedMessageId(id);
  }, []);

  const dismissInputMode = useCallback(() => {
    setSelectedMessageId(null);
    dismissChatInputMode();
  }, []);

  const isSelected = useCallback(
    (messageId: string) => selectedMessageId === messageId,
    [selectedMessageId],
  );

  const value = useMemo(
    () => ({ selectedMessageId, selectMessage, dismissInputMode, isSelected }),
    [dismissInputMode, isSelected, selectMessage, selectedMessageId],
  );

  return (
    <ChatMessageSelectionContext.Provider value={value}>
      {children}
    </ChatMessageSelectionContext.Provider>
  );
}

export function useChatMessageSelection(): ChatMessageSelectionContextValue {
  const ctx = useContext(ChatMessageSelectionContext);
  if (!ctx) {
    return {
      selectedMessageId: null,
      selectMessage: () => {},
      dismissInputMode: dismissChatInputMode,
      isSelected: () => false,
    };
  }
  return ctx;
}
