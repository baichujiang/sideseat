export function scheduleChatInputRefocus(inputRef: { current: HTMLInputElement | null }) {
  const focus = () => {
    inputRef.current?.focus({ preventScroll: true });
  };

  focus();
  requestAnimationFrame(() => {
    focus();
    requestAnimationFrame(focus);
  });
  window.setTimeout(focus, 120);
  window.setTimeout(focus, 320);
  window.setTimeout(focus, 650);
}
