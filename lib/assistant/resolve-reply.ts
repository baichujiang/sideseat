import type { StudentVerificationStatus } from "@prisma/client";

import type { AssistantFaqKey } from "@/lib/assistant/faq-keys";
import { ASSISTANT_FAQ_KEYS, parseFaqTrigger } from "@/lib/assistant/faq-keys";
import { tryAssistantAiReply } from "@/lib/assistant/ai-reply";
import type { AssistantLinkId } from "@/lib/assistant/action-links";
import { buildAssistantActionLinks } from "@/lib/assistant/action-links";
import type { AssistantReplyPayload } from "@/lib/assistant/message-payload";
import type { AppLocale } from "@/lib/i18n/app-locale";
import { getMessages, type AppMessages } from "@/lib/i18n/messages";

export type AssistantViewerContext = {
  isGuest: boolean;
  studentVerificationStatus: StudentVerificationStatus;
  verifiedStudent: boolean;
};

function linksFromIds(
  locale: AppLocale,
  ids: AssistantLinkId[],
): AssistantReplyPayload["links"] {
  return buildAssistantActionLinks(locale, ids);
}

function keywordScore(text: string, keywords: readonly string[]): number {
  const norm = text.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (kw.length < 2) continue;
    if (norm.includes(kw.toLowerCase())) score += kw.length >= 4 ? 2 : 1;
  }
  return score;
}

const KEYWORDS: Record<AssistantFaqKey, { en: string[]; zh: string[] }> = {
  getting_started: {
    en: ["start", "how does", "how do i", "what is", "sideseat", "use the app", "tabs", "tutorial"],
    zh: ["怎么用", "如何使用", "是什么", "入门", "教程", "开始", "功能"],
  },
  discover: {
    en: ["discover", "classmate", "find people", "post", "buddy", "match"],
    zh: ["发现", "同学", "找人", "帖子", "匹配", "搭子"],
  },
  verification: {
    en: ["verify", "verification", "school email", "student email", ".edu", "tum", "lmu"],
    zh: ["验证", "学校邮箱", "学生邮箱", "认证", "edu"],
  },
  guest_signup: {
    en: ["guest", "sign up", "signup", "register", "account", "log in", "login"],
    zh: ["访客", "注册", "登录", "账号", "游客"],
  },
  schedule: {
    en: ["schedule", "calendar", "plan", "timetable", "class", "natural language"],
    zh: ["课表", "日历", "计划", "排课", "日程", "自然语言"],
  },
  inbox: {
    en: ["inbox", "chat", "message", "dm", "direct"],
    zh: ["收件箱", "聊天", "私信", "消息"],
  },
};

function matchFaqKey(body: string, locale: AppLocale): AssistantFaqKey | "fallback" {
  const trigger = parseFaqTrigger(body);
  if (trigger) return trigger;

  const lang = locale === "zh-CN" ? "zh" : "en";
  let best: AssistantFaqKey = "getting_started";
  let bestScore = 0;

  for (const key of ASSISTANT_FAQ_KEYS) {
    const score = keywordScore(body, KEYWORDS[key][lang]);
    if (score > bestScore) {
      bestScore = score;
      best = key;
    }
  }

  return bestScore >= 1 ? best : "fallback";
}

function replyForKey(
  key: AssistantFaqKey | "fallback",
  t: AppMessages["assistant"],
  ctx: AssistantViewerContext,
  locale: AppLocale,
): AssistantReplyPayload {
  switch (key) {
    case "getting_started":
      return {
        text: t.faq.gettingStartedBody,
        links: linksFromIds(locale, ctx.isGuest ? ["home", "discover", "signup"] : ["home", "discover", "courses"]),
      };
    case "discover":
      return {
        text: t.faq.discoverBody,
        links: linksFromIds(locale, ctx.isGuest ? ["discover", "signup"] : ["discover", "profileInfo"]),
      };
    case "verification":
      return {
        text: ctx.verifiedStudent ? t.faq.verificationDoneBody : t.faq.verificationBody,
        links: linksFromIds(
          locale,
          ctx.verifiedStudent ? ["profileInfo", "discover"] : ["verification", "profileInfo"],
        ),
      };
    case "guest_signup":
      return {
        text: ctx.isGuest ? t.faq.guestSignupBody : t.faq.guestSignupRegisteredBody,
        links: linksFromIds(locale, ctx.isGuest ? ["signup", "login", "discover"] : ["profile", "discover"]),
      };
    case "schedule":
      return {
        text: t.faq.scheduleBody,
        links: linksFromIds(locale, ["home", "profile"]),
      };
    case "inbox":
      return {
        text: t.faq.inboxBody,
        links: linksFromIds(locale, ["inbox", "courses"]),
      };
    case "fallback":
    default:
      return {
        text: t.faq.fallbackBody,
        links: linksFromIds(
          locale,
          ctx.isGuest ? ["home", "signup", "discover"] : ["home", "discover", "profile"],
        ),
      };
  }
}

export function resolveAssistantReply(params: {
  body: string;
  locale: AppLocale;
  viewer: AssistantViewerContext;
}): AssistantReplyPayload {
  const t = getMessages(params.locale).assistant;
  const key = matchFaqKey(params.body, params.locale);
  return replyForKey(key, t, params.viewer, params.locale);
}

/** FAQ chips use exact templates; free-form messages prefer AI when configured. */
export async function resolveAssistantReplyAsync(params: {
  body: string;
  locale: AppLocale;
  viewer: AssistantViewerContext;
}): Promise<AssistantReplyPayload> {
  if (parseFaqTrigger(params.body)) {
    return resolveAssistantReply(params);
  }

  const ai = await tryAssistantAiReply(params);
  if (ai) return ai;

  return resolveAssistantReply(params);
}
