import type { AssistantActionLink } from "@/lib/assistant/message-payload";
import type { AppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";

const FAQ_LINK_HREFS = {
  home: "/home",
  discover: "/discover",
  inbox: "/inbox",
  courses: "/courses",
  profile: "/profile",
  profileInfo: "/profile/info",
  verification: "/profile/verification",
  signup: "/signup",
  login: "/login",
  account: "/profile/account",
} as const;

export type AssistantLinkId = keyof typeof FAQ_LINK_HREFS;

export function buildAssistantActionLinks(
  locale: AppLocale,
  ids: readonly AssistantLinkId[],
): AssistantActionLink[] {
  const labels = getMessages(locale).assistant.faqLinks;
  const labelMap: Record<AssistantLinkId, string> = {
    home: labels.home,
    discover: labels.discover,
    inbox: labels.inbox,
    courses: labels.courses,
    profile: labels.profile,
    profileInfo: labels.profileInfo,
    verification: labels.verification,
    signup: labels.signup,
    login: labels.login,
    account: labels.account,
  };
  return ids.map((id) => ({ label: labelMap[id], href: FAQ_LINK_HREFS[id] }));
}
