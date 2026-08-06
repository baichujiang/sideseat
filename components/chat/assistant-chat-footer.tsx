"use client";

import { useState } from "react";

import { AssistantQuickReplies } from "@/components/chat/assistant-quick-replies";
import { ChatComposer } from "@/components/chat/chat-composer";

/** Composer footer for SideSeat Assistant: sticky contextual chips + typing state. */
export function AssistantChatFooter({
  connectionId,
  peerName,
  isGuest,
  verifiedStudent,
  placeholder,
}: {
  connectionId: string;
  peerName: string;
  isGuest: boolean;
  verifiedStudent: boolean;
  placeholder?: string;
}) {
  const [chipPending, setChipPending] = useState(false);

  return (
    <div className="space-y-2">
      <AssistantQuickReplies
        connectionId={connectionId}
        surface="composer"
        isGuest={isGuest}
        verifiedStudent={verifiedStudent}
        compact
        onPendingChange={setChipPending}
      />
      <ChatComposer
        connectionId={connectionId}
        peerName={peerName}
        hideAttachments
        placeholder={placeholder}
        unrepliedSendBlocked={false}
        showUnrepliedHint={false}
        unrepliedStreak={0}
        isAssistantChat
        externalAssistantPending={chipPending}
      />
    </div>
  );
}
