import { CourseIntent, Weekday } from "@prisma/client";
import { z } from "zod";

/** HH:mm string → minutes from 00:00. Returns null if invalid. */
export function parseTimeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** minutes from 00:00 → HH:mm */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export const courseSessionInput = z
  .object({
    weekday: z.nativeEnum(Weekday),
    start: z.string(),
    end: z.string(),
    location: z.string().max(120).optional().or(z.literal("")),
  })
  .superRefine((value, ctx) => {
    const start = parseTimeToMinutes(value.start);
    const end = parseTimeToMinutes(value.end);
    if (start === null) {
      ctx.addIssue({ code: "custom", path: ["start"], message: "Use HH:mm" });
      return;
    }
    if (end === null) {
      ctx.addIssue({ code: "custom", path: ["end"], message: "Use HH:mm" });
      return;
    }
    if (end <= start) {
      ctx.addIssue({ code: "custom", path: ["end"], message: "End must be after start" });
    }
  });

export type CourseSessionInput = z.infer<typeof courseSessionInput>;

/** Client-submitted course fields.
 *  School is derived from the user, semester is derived from the server clock. */
export const courseSchema = z.object({
  name: z.string().min(2).max(120),
  code: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .regex(/^[A-Za-z0-9.\-_/]+$/, "Use letters, digits, or . - _ /"),
  location: z.string().max(120).optional().or(z.literal("")),
  intentions: z.array(z.nativeEnum(CourseIntent)).min(1),
  sessions: z.array(courseSessionInput).max(8).default([]),
  /** When sessions are empty, apply this official variant if available. */
  variantFingerprint: z.string().min(8).max(200).optional(),
});
