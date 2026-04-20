import { CourseIntent } from "@prisma/client";
import { z } from "zod";

/** Client-submitted course fields. School is derived server-side from the user. */
export const courseSchema = z.object({
  name: z.string().min(2).max(120),
  code: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .regex(/^[A-Za-z0-9.\-_/]+$/, "Use letters, digits, or . - _ /"),
  semesterLabel: z.string().min(2).max(40),
  location: z.string().max(120).optional().or(z.literal("")),
  schedule: z.string().max(120).optional().or(z.literal("")),
  intentions: z.array(z.nativeEnum(CourseIntent)).min(1),
});
