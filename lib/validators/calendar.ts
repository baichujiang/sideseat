import { Weekday } from "@prisma/client";
import { z } from "zod";

import { courseSessionInput } from "@/lib/validators/course";

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Use a #RRGGBB color.");

export const calendarEventSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    location: z.string().trim().max(120).optional().or(z.literal("")),
    note: z.string().trim().max(500).optional().or(z.literal("")),
    startAt: z.string().min(1),
    endAt: z.string().min(1),
    withUserIds: z.array(z.string().cuid()).max(8).optional().default([]),
    repeat: z.enum(["NONE", "DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "YEARLY"]).default("NONE"),
    repeatUntil: z.string().optional().or(z.literal("")),
    /** Optional calendar list / category */
    categoryId: z.string().cuid().nullish(),
  })
  .superRefine((value, ctx) => {
    const start = new Date(value.startAt);
    const end = new Date(value.endAt);
    if (Number.isNaN(start.getTime())) {
      ctx.addIssue({ code: "custom", path: ["startAt"], message: "Choose a valid start time." });
      return;
    }
    if (Number.isNaN(end.getTime())) {
      ctx.addIssue({ code: "custom", path: ["endAt"], message: "Choose a valid end time." });
      return;
    }
    if (end <= start) {
      ctx.addIssue({ code: "custom", path: ["endAt"], message: "End must be after start." });
    }
    if (value.repeat !== "NONE") {
      const repeatUntil = value.repeatUntil ? new Date(value.repeatUntil) : null;
      if (!repeatUntil || Number.isNaN(repeatUntil.getTime())) {
        ctx.addIssue({
          code: "custom",
          path: ["repeatUntil"],
          message: "Choose when the repeating event should end.",
        });
        return;
      }
      if (repeatUntil < start) {
        ctx.addIssue({
          code: "custom",
          path: ["repeatUntil"],
          message: "Repeat end must be after the first event.",
        });
      }
    }
  });

export const calendarCourseAddSchema = z.object({
  courseId: z.string().min(1),
  sessions: z.array(courseSessionInput).min(1).max(8),
});

export type CalendarEventInput = z.infer<typeof calendarEventSchema>;
export type CalendarCourseAddInput = z.infer<typeof calendarCourseAddSchema>;

export const calendarCategoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: hexColor,
  /** Raw pasted URL; server normalizes webcal:// and validates. */
  icsSubscriptionUrl: z.string().max(2048).optional(),
});

export const calendarCategoryPatchSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  color: hexColor.optional(),
  icsSubscriptionUrl: z.union([z.string().trim().max(2048), z.null()]).optional(),
});
export type CalendarCourseSessionInput = {
  weekday: Weekday;
  start: string;
  end: string;
  location?: string;
};
