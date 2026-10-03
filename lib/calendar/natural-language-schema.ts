import { z } from "zod";

export const repeatEnum = z.enum(["NONE", "DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "YEARLY"]);
export const dayPartEnum = z.enum(["morning", "noon", "afternoon", "evening"]);

// Only values with verbatim source evidence are used. Repair individual fields
// rather than rejecting a whole batch for one incomplete event (SI-01/SI-02).
const fact = <T extends z.ZodTypeAny>(value: T) => z.object({
  text: z.string().trim().min(1), value,
}).nullish().catch(null);

export const llmParsedEventSchema = z.object({
  source: z.string().trim().catch(""),
  title: z.string().trim().catch(""),
  date: fact(z.string()),
  startTime: fact(z.string()),
  endDate: fact(z.string()),
  endTime: fact(z.string()),
  duration: fact(z.number().positive().finite()),
  dayPart: fact(dayPartEnum),
  location: fact(z.string()),
  note: fact(z.string()),
  repeat: fact(repeatEnum),
  repeatUntil: fact(z.string()),
  eventType: z.enum(["short_errand", "meal", "meeting", "study", "sport", "other"]).catch("other"),
  categoryPreset: z.enum(["study", "work", "personal"]).nullish().catch(null),
});

export type ExtractedScheduleEvent = z.infer<typeof llmParsedEventSchema>;
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
  /** Kept empty for existing API clients; SI-03 removes inference prompts. */
  warnings: string[];
};
