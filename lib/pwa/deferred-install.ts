export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const cb of listeners) cb();
}

export function getDeferredInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferred;
}

/** Subscribe to deferred prompt availability; calls listener immediately and after each change. */
export function subscribeDeferredInstall(listener: () => void): () => void {
  listeners.add(listener);
  listener();
  return () => listeners.delete(listener);
}

/** Install once from root layout / PwaRegister so every surface shares one capture. */
export function registerBeforeInstallPromptCapture(): () => void {
  if (typeof window === "undefined") return () => {};

  const onBip = (e: Event) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  };

  window.addEventListener("beforeinstallprompt", onBip);
  return () => window.removeEventListener("beforeinstallprompt", onBip);
}

export async function runDeferredInstallPrompt(): Promise<void> {
  if (!deferred) return;
  const ev = deferred;
  deferred = null;
  emit();
  await ev.prompt();
  await ev.userChoice;
  emit();
}
