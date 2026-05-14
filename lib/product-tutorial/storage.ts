/** Bump if tutorial content changes enough to warrant a re-show for everyone. */
export const PRODUCT_TUTORIAL_STORAGE_VERSION = "v2";

export function productTutorialLocalStorageKey(userId: string) {
  return `classlink:productTutorial:${PRODUCT_TUTORIAL_STORAGE_VERSION}:${userId}`;
}

export function readProductTutorialDismissedLocally(userId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(productTutorialLocalStorageKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function writeProductTutorialDismissedLocally(userId: string) {
  try {
    window.localStorage.setItem(productTutorialLocalStorageKey(userId), "1");
  } catch {
    /* private mode / quota */
  }
}

export function clearProductTutorialDismissedLocally(userId: string) {
  try {
    window.localStorage.removeItem(productTutorialLocalStorageKey(userId));
  } catch {
    /* ignore */
  }
}

/** Current tutorial step (0-based) for this browser tab; cleared when the tour completes or is dismissed. */
export function productTutorialStepSessionKey(userId: string) {
  return `classlink:productTutorialStep:${PRODUCT_TUTORIAL_STORAGE_VERSION}:${userId}`;
}

export function readProductTutorialStepSession(userId: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(productTutorialStepSessionKey(userId));
    if (raw == null) return null;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  } catch {
    return null;
  }
}

export function writeProductTutorialStepSession(userId: string, step: number) {
  try {
    window.sessionStorage.setItem(productTutorialStepSessionKey(userId), String(step));
  } catch {
    /* private mode / quota */
  }
}

export function clearProductTutorialStepSession(userId: string) {
  try {
    window.sessionStorage.removeItem(productTutorialStepSessionKey(userId));
  } catch {
    /* ignore */
  }
}
