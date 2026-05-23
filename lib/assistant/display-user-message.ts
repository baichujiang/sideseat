import type { AssistantFaqKey } from "@/lib/assistant/faq-keys";
import { parseFaqTrigger } from "@/lib/assistant/faq-keys";
import type { AppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";

const CHIP_FIELD: Record<AssistantFaqKey, keyof ReturnType<typeof getMessages>["assistant"]["chips"]> = {
  getting_started: "gettingStarted",
  discover: "discover",
  verification: "verification",
  guest_signup: "guestSignup",
  schedule: "schedule",
  inbox: "inbox",
};

/** Show chip label instead of internal `[[faq:…]]` trigger in the user's bubble. */
export function displayUserMessageBody(body: string, locale: AppLocale): string {
  const key = parseFaqTrigger(body);
  if (!key) return body;
  const chips = getMessages(locale).assistant.chips;
  return chips[CHIP_FIELD[key]];
}
