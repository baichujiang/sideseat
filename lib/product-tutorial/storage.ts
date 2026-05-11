/** Bump if tutorial content changes enough to warrant a re-show for everyone. */
export const PRODUCT_TUTORIAL_STORAGE_VERSION = "v1";

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
