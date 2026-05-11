/** Stable `id` for chat rows so in-thread search can `scrollIntoView`. */
export function chatMessageDomId(messageId: string): string {
  return `chat-msg-${messageId}`;
}
