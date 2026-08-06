import type { AssistantViewerContext } from "@/lib/assistant/resolve-reply";
import { buildAssistantActionLinks } from "@/lib/assistant/action-links";
import type { AssistantReplyPayload } from "@/lib/assistant/message-payload";
import type { AppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";

/** First-run welcome: capabilities + deep-link CTAs (WeChat / in-app helper pattern). */
export function buildAssistantWelcomePayload(
  locale: AppLocale,
  viewer: Pick<AssistantViewerContext, "isGuest" | "verifiedStudent">,
): AssistantReplyPayload {
  const t = getMessages(locale).assistant;
  const linkIds = viewer.isGuest
    ? (["home", "discover", "signup"] as const)
    : viewer.verifiedStudent
      ? (["home", "discover", "inbox"] as const)
      : (["home", "verification", "discover"] as const);

  return {
    text: t.welcomeBody,
    links: buildAssistantActionLinks(locale, linkIds),
  };
}
