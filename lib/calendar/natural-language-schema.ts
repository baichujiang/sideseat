import { z } from "zod";

import {
  categoryMappingWarning,
  llmCategoryPresetSchema,
  resolveCategoryFromPreset,
  type UserCategoryForMapping,
} from "@/lib/calendar/category-preset";
import type { AppLocale } from "@/lib/i18n/app-locale";
import { calendarEventSchema } from "@/lib/validators/calendar";

const repeatEnum = z.enum(["NONE", "DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "YEARLY"]);

/** Raw shape returned by the LLM before per-event calendar validation. */
export const llmParsedEventSchema = z.object({
  title: z.string().trim().min(1).max(120),
  location: z.string().trim().max(120).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  repeat: repeatEnum.nullish().default("NONE"),
  repeatUntil: z.string().optional().nullable(),
  categoryPreset: z.preprocess((val) => {
    if (typeof val === "string") {
      const t = val.trim().toLowerCase();
      return t.length ? t : null;
    }
    return val ?? null;
  }, llmCategoryPresetSchema),
});

export const llmParseResponseSchema = z.object({
  events: z.array(llmParsedEventSchema).min(1).max(10),
  warnings: z.array(z.string().trim().min(1).max(300)).optional().default([]),
});

export type LlmParseResponse = z.infer<typeof llmParseResponseSchema>;

export type ParsedScheduleDraft = {
  title: string;
  location: string;
  note: string;
  startAt: string;
  endAt: string;
  repeat: z.infer<typeof repeatEnum>;
  repeatUntil: string;
  categoryId: string | null;
  categoryPreset: string | null;
};

export type ParseNaturalScheduleResult = {
  events: ParsedScheduleDraft[];
  warnings: string[];
};

/** Validates LLM output and maps categoryPreset → user categoryId. */
export function normalizeLlmEventsToDrafts(
  llm: LlmParseResponse,
  options: { categories: UserCategoryForMapping[]; locale: AppLocale },
): { ok: true; result: ParseNaturalScheduleResult } | { ok: false; error: string } {
  const warnings = [...(llm.warnings ?? [])];
  const events: ParsedScheduleDraft[] = [];

  for (let i = 0; i < llm.events.length; i++) {
    const raw = llm.events[i]!;
    const repeat = raw.repeat ?? "NONE";
    const repeatUntil =
      repeat !== "NONE" && raw.repeatUntil?.trim() ? raw.repeatUntil.trim() : "";

    const presetRaw =
      raw.categoryPreset === null || raw.categoryPreset === undefined
        ? null
        : String(raw.categoryPreset).trim().toLowerCase();

    const mapped = resolveCategoryFromPreset(presetRaw, options.categories);
    const categoryId = mapped.status === "matched" ? mapped.categoryId : null;

    if (mapped.status === "invalid_preset") {
      warnings.push(
        categoryMappingWarning(options.locale, i, "invalid_preset", mapped.presetKey),
      );
    } else if (mapped.status === "not_available") {
      warnings.push(
        categoryMappingWarning(options.locale, i, "preset_not_available", mapped.presetKey),
      );
    }

    const candidate = {
      title: raw.title,
      location: raw.location?.trim() || "",
      note: raw.note?.trim() || "",
      startAt: raw.startAt,
      endAt: raw.endAt,
      withUserIds: [] as string[],
      repeat,
      repeatUntil,
      categoryId,
    };

    const parsed = calendarEventSchema.safeParse(candidate);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Invalid event";
      return { ok: false, error: `Event ${i + 1}: ${msg}` };
    }

    events.push({
      title: parsed.data.title,
      location: parsed.data.location?.trim() || "",
      note: parsed.data.note?.trim() || "",
      startAt: parsed.data.startAt,
      endAt: parsed.data.endAt,
      repeat: parsed.data.repeat,
      repeatUntil: parsed.data.repeatUntil?.trim() || "",
      categoryId: parsed.data.categoryId ?? null,
      categoryPreset: mapped.status === "matched" ? mapped.presetKey : presetRaw,
    });
  }

  return { ok: true, result: { events, warnings: [...new Set(warnings)] } };
}
