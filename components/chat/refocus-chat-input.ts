export function scheduleChatInputRefocus(
  inputRef: { current: HTMLTextAreaElement | null },
  inputId?: string,
) {
  const focus = () => {
    const refTarget = inputRef.current;
    const target =
      refTarget?.isConnected
        ? refTarget
        : inputId
          ? (document.getElementById(inputId) as HTMLTextAreaElement | null)
          : null;
    if (!target || !target.isConnected) return;
    target.focus({ preventScroll: true });
  };

  focus();
  requestAnimationFrame(() => {
    focus();
    requestAnimationFrame(focus);
  });
  window.setTimeout(focus, 120);
  window.setTimeout(focus, 320);
  window.setTimeout(focus, 650);
  window.setTimeout(focus, 1000);
}
