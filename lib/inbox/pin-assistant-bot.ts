import { isAssistantBotUser } from "@/lib/auth/assistant-bot";
import type { InboxMerged } from "@/lib/queries/inbox-merge";

/** Keeps the assistant bot DM at the top of the merged inbox list. */
export function pinAssistantBotInbox(merged: InboxMerged[]): InboxMerged[] {
  const botIndex = merged.findIndex(
    (item) =>
      item.kind === "direct" &&
      (isAssistantBotUser(item.connection.userA) || isAssistantBotUser(item.connection.userB)),
  );
  if (botIndex <= 0) return merged;
  const copy = [...merged];
  const [bot] = copy.splice(botIndex, 1);
  return [bot, ...copy];
}
