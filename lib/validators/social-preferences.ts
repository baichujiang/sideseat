import { SocialIntentTopic, SocialMeetingPreference } from "@prisma/client";
import { z } from "zod";

export const socialWindowSchema = z
  .object({
    weekday: z.number().int().min(1).max(7),
    startMinutes: z.number().int().min(0).max(1_435),
    endMinutes: z.number().int().min(5).max(1_440),
  })
  .strict()
  .refine((window) => window.endMinutes > window.startMinutes, {
    message: "A social window must end after it starts.",
    path: ["endMinutes"],
  });

export const socialPreferencesPatchSchema = z
  .object({
    topics: z.array(z.nativeEnum(SocialIntentTopic)).max(6),
    meetingPreference: z.nativeEnum(SocialMeetingPreference),
    weeklyWindows: z.array(socialWindowSchema).max(21),
    timeZone: z.string().trim().min(1).max(64),
    activeUntil: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value.timeZone }).format();
    } catch {
      ctx.addIssue({
        code: "custom",
        path: ["timeZone"],
        message: "Choose a valid IANA time zone.",
      });
    }
    const unique = new Set(
      value.weeklyWindows.map(
        (window) => `${window.weekday}:${window.startMinutes}:${window.endMinutes}`,
      ),
    );
    if (unique.size !== value.weeklyWindows.length) {
      ctx.addIssue({
        code: "custom",
        path: ["weeklyWindows"],
        message: "Duplicate social windows are not allowed.",
      });
    }
  });

export type SocialWindowInput = z.infer<typeof socialWindowSchema>;
export type SocialPreferencesPatchInput = z.infer<typeof socialPreferencesPatchSchema>;

