import { z } from "zod";

import { calendarEventSchema } from "@/lib/validators/calendar";

export const parseNaturalScheduleRequestSchema = z.object({
  text: z.string().trim().min(1, "Describe at least one event.").max(2000),
  locale: z.enum(["zh-CN", "en"]).optional(),
});

export const batchCalendarEventsSchema = z.object({
  events: z.array(calendarEventSchema).min(1).max(10),
});
