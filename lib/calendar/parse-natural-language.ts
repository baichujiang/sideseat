import "server-only";

import { formatInTimeZone } from "date-fns-tz";

import {
  CALENDAR_CATEGORY_PRESET_KEYS,
  type UserCategoryForMapping,
} from "@/lib/calendar/category-preset";
import {
  llmParseResponseSchema,
  normalizeLlmEventsToDrafts,
  type ParseNaturalScheduleResult,
} from "@/lib/calendar/natural-language-schema";
import { SCHEDULE_DISPLAY_TZ } from "@/lib/calendar/schedule-berlin";
import {
  dashScopeChatCompletion,
  extractJsonFromModelText,
  isDashScopeConfigured,
} from "@/lib/llm/dashscope";
import type { AppLocale } from "@/lib/i18n/app-locale";

function buildSystemPrompt(locale: AppLocale, referenceTime: Date): string {
  const refIso = formatInTimeZone(referenceTime, SCHEDULE_DISPLAY_TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
  const refLabel = formatInTimeZone(
    referenceTime,
    SCHEDULE_DISPLAY_TZ,
    "yyyy-MM-dd EEEE HH:mm",
  );

  const localeHint =
    locale === "zh-CN"
      ? "用户可能用中文描述时间（明天、后天、下周三、各一小时、主图书馆等）。"
      : "The user may write in English (tomorrow, next Wed, 90 minutes, etc.).";

  return `You are SideSeat's calendar parser. ${localeHint}

Rules:
- Timezone for all datetimes: Europe/Berlin (${SCHEDULE_DISPLAY_TZ}). Use ISO 8601 with offset (e.g. 2026-05-20T15:00:00+02:00).
- Reference "now" for relative phrases: ${refLabel} (${refIso}).
- Output ONLY valid JSON (no markdown): { "events": [...], "warnings": [...] }.
- "events": 1 to 10 items. Each item: title (required), startAt, endAt, optional location, note, repeat (NONE|DAILY|WEEKLY|BIWEEKLY|MONTHLY|YEARLY), repeatUntil (ISO date or datetime when repeat is not NONE).
- If duration is missing, default to 60 minutes after startAt.
- If the user gives multiple events in one sentence, split into separate events.
- Put ambiguity notes in "warnings" (same language as user input when possible).
- Do not invent courses or classmates. Only schedule-like items (study, meetings, sports, meals as calendar blocks).
- Titles should be short (max 120 chars).
- Optional per event: categoryPreset — one of ${CALENDAR_CATEGORY_PRESET_KEYS.join("|")}. Map intent (work meeting → work, class/lecture → course, gym → sports, lunch → meal, language class → language, homework → study, personal errands → personal, must-do/deadline/urgent priority → important). Omit or null if unclear; add a short warning when category is ambiguous.
- Do not output categoryId; only categoryPreset.`;
}

export async function parseNaturalLanguageSchedule(params: {
  text: string;
  locale: AppLocale;
  referenceTime?: Date;
  categories: UserCategoryForMapping[];
}): Promise<
  | { ok: true; data: ParseNaturalScheduleResult }
  | { ok: false; code: "NOT_CONFIGURED" | "PARSE_FAILED" | "VALIDATION_FAILED"; error: string }
> {
  if (!isDashScopeConfigured()) {
    return { ok: false, code: "NOT_CONFIGURED", error: "Natural language scheduling is not available." };
  }

  const referenceTime = params.referenceTime ?? new Date();
  const system = buildSystemPrompt(params.locale, referenceTime);

  let content: string;
  try {
    content = await dashScopeChatCompletion({
      messages: [
        { role: "system", content: system },
        { role: "user", content: params.text.trim() },
      ],
    });
  } catch (e) {
    console.error("parseNaturalLanguageSchedule", e);
    return {
      ok: false,
      code: "PARSE_FAILED",
      error: "Could not parse your text. Try again or add the event manually.",
    };
  }

  let json: unknown;
  try {
    json = extractJsonFromModelText(content);
  } catch {
    console.error("LLM non-JSON", content.slice(0, 400));
    return {
      ok: false,
      code: "PARSE_FAILED",
      error: "Could not parse your text. Try rephrasing your request.",
    };
  }

  const llmParsed = llmParseResponseSchema.safeParse(json);
  if (!llmParsed.success) {
    console.error("LLM schema mismatch", llmParsed.error.flatten());
    return {
      ok: false,
      code: "VALIDATION_FAILED",
      error: "Could not understand the schedule. Try being more specific about dates and times.",
    };
  }

  const normalized = normalizeLlmEventsToDrafts(llmParsed.data, {
    categories: params.categories,
    locale: params.locale,
  });
  if (!normalized.ok) {
    return { ok: false, code: "VALIDATION_FAILED", error: normalized.error };
  }

  return { ok: true, data: normalized.result };
}
