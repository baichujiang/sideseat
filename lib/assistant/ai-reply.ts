import "server-only";

import {
  dashScopeChatCompletion,
  extractJsonFromModelText,
  isDashScopeConfigured,
} from "@/lib/llm/dashscope";
import type { AssistantReplyPayload } from "@/lib/assistant/message-payload";
import { buildAssistantActionLinks } from "@/lib/assistant/action-links";
import type { AssistantViewerContext } from "@/lib/assistant/resolve-reply";
import type { AppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";

const ALLOWED_LINK_IDS = [
  "home",
  "discover",
  "inbox",
  "courses",
  "profile",
  "profileInfo",
  "verification",
  "signup",
  "login",
  "account",
] as const;

type AllowedLinkId = (typeof ALLOWED_LINK_IDS)[number];

function buildSystemPrompt(locale: AppLocale, viewer: AssistantViewerContext): string {
  const t = getMessages(locale).assistant;
  const faq = t.faq;
  const lang =
    locale === "zh-CN"
      ? "Reply in Simplified Chinese unless the user clearly writes in English."
      : "Reply in English unless the user clearly writes in Chinese.";

  const viewerBits: string[] = [];
  if (viewer.isGuest) viewerBits.push("guest (not signed in)");
  else viewerBits.push("signed-in user");
  if (viewer.verifiedStudent) viewerBits.push("school-verified student");
  else viewerBits.push("not school-verified yet");

  return `You are SideSeat Assistant — the official in-app campus buddy for SideSeat (schedule, Discover classmates, chats/plans, account help). You are NOT a real classmate and must never pretend to be one.

Tone: warm, clear, practical — like a helpful senior on campus. Prefer short answers (2–5 short paragraphs or bullets). Lead with the action the user should take. ${lang}

Viewer: ${viewerBits.join("; ")}.

Product facts (do not invent features outside this):
- Getting started: ${faq.gettingStartedBody.replace(/\n/g, " ")}
- Discover: ${faq.discoverBody.replace(/\n/g, " ")}
- Verification: ${viewer.verifiedStudent ? faq.verificationDoneBody.replace(/\n/g, " ") : faq.verificationBody.replace(/\n/g, " ")}
- Guest vs account: ${viewer.isGuest ? faq.guestSignupBody.replace(/\n/g, " ") : faq.guestSignupRegisteredBody.replace(/\n/g, " ")}
- Schedule: ${faq.scheduleBody.replace(/\n/g, " ")}
- Inbox/chats: ${faq.inboxBody.replace(/\n/g, " ")}

Tab map: Home = calendar; Discover = classmates/posts; center + = create Find Buddies post; Chats = DMs/groups/plans; Me = profile, Courses, verification, settings, Feedback.

Rules:
- Help with SideSeat product usage only. Off-topic → politely redirect to SideSeat topics.
- Bugs / feature ideas → point to Me → Feedback.
- Never ask for passwords, OTP codes, or API keys. Never claim you changed their account/data.
- If unsure, say so briefly and suggest a quick question topic (schedule / Discover / verification / guest vs account / chats) plus 1–2 linkIds.
- Prefer actionable next steps over long essays. Use bullets when listing steps.
- Output ONLY valid JSON: { "text": string, "linkIds": string[] }
- "linkIds": 0–3 ids from [${ALLOWED_LINK_IDS.join(", ")}] matching the screens the user should open. Guests: prefer signup/login when relevant. Unverified: prefer verification when relevant. Omit or [] if none fit.
- "text": plain text only (no markdown fences, no raw link markup).`;
}

function parseAiPayload(raw: string, locale: AppLocale): AssistantReplyPayload | null {
  let parsed: { text?: unknown; linkIds?: unknown };
  try {
    parsed = extractJsonFromModelText(raw) as typeof parsed;
  } catch {
    return null;
  }

  const text = typeof parsed.text === "string" ? parsed.text.trim() : "";
  if (!text || text.length > 4000) return null;

  const ids: AllowedLinkId[] = [];
  if (Array.isArray(parsed.linkIds)) {
    for (const id of parsed.linkIds) {
      if (
        typeof id === "string" &&
        (ALLOWED_LINK_IDS as readonly string[]).includes(id) &&
        !ids.includes(id as AllowedLinkId)
      ) {
        ids.push(id as AllowedLinkId);
        if (ids.length >= 3) break;
      }
    }
  }

  return {
    text,
    links: buildAssistantActionLinks(locale, ids),
  };
}

/** Returns null when AI is unavailable or fails — caller should use FAQ fallback. */
export async function tryAssistantAiReply(params: {
  body: string;
  locale: AppLocale;
  viewer: AssistantViewerContext;
}): Promise<AssistantReplyPayload | null> {
  if (!isDashScopeConfigured()) return null;

  const userText = params.body.trim();
  if (!userText) return null;

  let content: string;
  try {
    content = await dashScopeChatCompletion({
      messages: [
        { role: "system", content: buildSystemPrompt(params.locale, params.viewer) },
        { role: "user", content: userText },
      ],
      temperature: 0.35,
    });
  } catch (e) {
    console.error("[assistant] AI reply failed", e);
    return null;
  }

  return parseAiPayload(content, params.locale);
}
