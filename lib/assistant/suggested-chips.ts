import type { AssistantFaqKey } from "@/lib/assistant/faq-keys";
import type { AssistantViewerContext } from "@/lib/assistant/resolve-reply";

export type AssistantChipGroupId = "start" | "schedule" | "social" | "account";

export const ASSISTANT_CHIP_GROUP: Record<AssistantFaqKey, AssistantChipGroupId> = {
  getting_started: "start",
  schedule: "schedule",
  discover: "social",
  inbox: "social",
  verification: "account",
  guest_signup: "account",
};

/**
 * Contextual quick prompts (campus-buddy pattern): prioritize what this viewer
 * most likely needs next, while keeping the full FAQ set reachable.
 */
export function suggestedFaqChips(
  viewer: Pick<AssistantViewerContext, "isGuest" | "verifiedStudent">,
): AssistantFaqKey[] {
  if (viewer.isGuest) {
    return ["getting_started", "guest_signup", "discover", "schedule", "inbox", "verification"];
  }
  if (!viewer.verifiedStudent) {
    return ["verification", "schedule", "discover", "getting_started", "inbox", "guest_signup"];
  }
  return ["schedule", "discover", "inbox", "getting_started", "verification", "guest_signup"];
}

/** Compact row above the composer (ChatGPT / Claude style). */
export function primarySuggestedFaqChips(
  viewer: Pick<AssistantViewerContext, "isGuest" | "verifiedStudent">,
): AssistantFaqKey[] {
  return suggestedFaqChips(viewer).slice(0, 4);
}
