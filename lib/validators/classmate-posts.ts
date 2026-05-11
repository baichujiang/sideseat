import { ClassmatePostInsightKind } from "@prisma/client";
import { z } from "zod";

/** Single source of truth for `POST /api/classmate-posts` string limits (trimmed). */
export const CLASSMATE_POST_CITY_MAX_LEN = 60;
export const CLASSMATE_POST_TITLE_MAX_LEN = 120;
export const CLASSMATE_POST_BODY_MAX_LEN = 280;

/** Keep in sync with `ClassmatePostCategory` in prisma/schema.prisma. */
const classmatePostCategorySchema = z.enum([
  "STUDY",
  "MEALS",
  "LANGUAGE",
  "SPORTS",
  "SHARED_COURSES",
]);

export const createClassmatePostSchema = z
  .object({
    city: z.string().trim().min(1).max(CLASSMATE_POST_CITY_MAX_LEN).default("Munich"),
    category: classmatePostCategorySchema,
    title: z.string().trim().min(1, "Add a short title.").max(CLASSMATE_POST_TITLE_MAX_LEN),
    body: z.preprocess(
      (v) => (v == null ? undefined : v),
      z.string().trim().max(CLASSMATE_POST_BODY_MAX_LEN).optional(),
    ),
    /** ISO-8601 instant; accept any string `Date` can parse. */
    expiresAt: z
      .string()
      .min(1)
      .refine((s) => !Number.isNaN(Date.parse(s)), "Choose a valid expiry."),
    /** Required when category is SHARED_COURSES — at least one enrolled course to share. */
    courseIds: z.array(z.string().min(1)).max(20).optional(),
  })
  .refine(
    (data) =>
      data.category !== "SHARED_COURSES" ||
      (Array.isArray(data.courseIds) && data.courseIds.length > 0),
    { message: "Select at least one course to share.", path: ["courseIds"] },
  );

export type CreateClassmatePostInput = z.infer<typeof createClassmatePostSchema>;

export const classmatePostInsightBodySchema = z.object({
  kind: z.nativeEnum(ClassmatePostInsightKind),
});

export type ClassmatePostInsightBody = z.infer<typeof classmatePostInsightBodySchema>;
