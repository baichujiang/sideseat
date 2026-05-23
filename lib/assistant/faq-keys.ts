export const ASSISTANT_FAQ_KEYS = [
  "getting_started",
  "discover",
  "verification",
  "guest_signup",
  "schedule",
  "inbox",
] as const;

export type AssistantFaqKey = (typeof ASSISTANT_FAQ_KEYS)[number];

export const ASSISTANT_FAQ_TRIGGER_PREFIX = "[[faq:" as const;
export const ASSISTANT_FAQ_TRIGGER_SUFFIX = "]]" as const;

export function buildFaqTrigger(key: AssistantFaqKey): string {
  return `${ASSISTANT_FAQ_TRIGGER_PREFIX}${key}${ASSISTANT_FAQ_TRIGGER_SUFFIX}`;
}

export function parseFaqTrigger(body: string): AssistantFaqKey | null {
  const trimmed = body.trim();
  if (!trimmed.startsWith(ASSISTANT_FAQ_TRIGGER_PREFIX) || !trimmed.endsWith(ASSISTANT_FAQ_TRIGGER_SUFFIX)) {
    return null;
  }
  const inner = trimmed.slice(
    ASSISTANT_FAQ_TRIGGER_PREFIX.length,
    trimmed.length - ASSISTANT_FAQ_TRIGGER_SUFFIX.length,
  );
  return (ASSISTANT_FAQ_KEYS as readonly string[]).includes(inner) ? (inner as AssistantFaqKey) : null;
}
