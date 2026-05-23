import { isAssistantBotUser } from "@/lib/auth/assistant-bot";
import type { InboxMerged } from "@/lib/queries/inbox-merge";

/**
 * Inbox list guard: only one direct row per assistant bot peer (DB may still have
 * duplicates until {@link ensureAssistantBotConnection} runs).
 */
export function dedupeAssistantInboxRows(merged: InboxMerged[]): InboxMerged[] {
  let seenAssistantDirect = false;
  return merged.filter((item) => {
    if (item.kind !== "direct") return true;
    const isAssistant =
      isAssistantBotUser(item.connection.userA) || isAssistantBotUser(item.connection.userB);
    if (!isAssistant) return true;
    if (seenAssistantDirect) return false;
    seenAssistantDirect = true;
    return true;
  });
}
