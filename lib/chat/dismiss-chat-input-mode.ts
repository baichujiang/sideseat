/** Blur the active chat composer field and let `ChatMessageInput` run its blur cleanup. */
export function dismissChatInputMode() {
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    active.blur();
  }
}
