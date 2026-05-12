import { ClassmatePostInsightKind } from "@prisma/client";
import { z } from "zod";

/** Single source of truth for `POST /api/classmate-posts` string limits (trimmed). */
export const CLASSMATE_POST_CITY_MAX_LEN = 60;
export const CLASSMATE_POST_TITLE_MAX_LEN = 120;
export const CLASSMATE_POST_BODY_MAX_LEN = 280;

export const CLASSMATE_POST_STUDY_VENUE_OTHER_NOTE_MAX = 40;

/** Keep in sync with `StudyPurpose` in prisma/schema.prisma. */
export const STUDY_PURPOSE_VALUES = ["DAILY_SELF_STUDY", "EXAM_PREP", "SPRINT"] as const;
/** Keep in sync with `StudyTimeSlot` in prisma/schema.prisma. */
export const STUDY_TIME_SLOT_VALUES = ["MORNING", "AFTERNOON", "EVENING"] as const;
/** Keep in sync with `StudyVenue` in prisma/schema.prisma. */
export const STUDY_VENUE_VALUES = [
  "MAIN_LIBRARY",
  "GARCHING_MI_LIBRARY",
  "OLYMPIA_PARK_LIBRARY",
  "OTHER",
] as const;

function dedupePreserveOrder<T extends string>(values: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const v of values) {
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export const studyPayloadSchema = z
  .object({
    purposes: z.array(z.enum(STUDY_PURPOSE_VALUES)).max(STUDY_PURPOSE_VALUES.length).optional(),
    timeSlots: z.array(z.enum(STUDY_TIME_SLOT_VALUES)).max(STUDY_TIME_SLOT_VALUES.length).optional(),
    venues: z.array(z.enum(STUDY_VENUE_VALUES)).max(STUDY_VENUE_VALUES.length).optional(),
    venueOtherNote: z.preprocess(
      (v) => (v == null ? undefined : v),
      z.string().trim().max(CLASSMATE_POST_STUDY_VENUE_OTHER_NOTE_MAX).optional(),
    ),
  })
  .transform((row) => ({
    purposes: dedupePreserveOrder(row.purposes ?? []),
    timeSlots: dedupePreserveOrder(row.timeSlots ?? []),
    venues: dedupePreserveOrder(row.venues ?? []),
    venueOtherNote:
      typeof row.venueOtherNote === "string" && row.venueOtherNote.trim().length > 0
        ? row.venueOtherNote.trim()
        : undefined,
  }));

export type StudyPayloadNormalized = z.infer<typeof studyPayloadSchema>;

export function classmatePostStudyPayloadHasData(study: StudyPayloadNormalized): boolean {
  return (
    study.purposes.length > 0 ||
    study.timeSlots.length > 0 ||
    study.venues.length > 0 ||
    Boolean(study.venueOtherNote)
  );
}

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
    /** Only for `STUDY` posts; omit for other categories. */
    study: studyPayloadSchema.optional(),
  })
  .refine(
    (data) =>
      data.category !== "SHARED_COURSES" ||
      (Array.isArray(data.courseIds) && data.courseIds.length > 0),
    { message: "Select at least one course to share.", path: ["courseIds"] },
  )
  .superRefine((data, ctx) => {
    if (data.study != null && data.category !== "STUDY") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Study preferences only apply to Study posts.",
        path: ["study"],
      });
    }
    if (data.category === "STUDY" && data.study != null && data.study.venues.includes("OTHER")) {
      if (!data.study.venueOtherNote?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Add a short note when you choose Other place.",
          path: ["study", "venueOtherNote"],
        });
      }
    }
    if (
      data.category === "STUDY" &&
      data.study != null &&
      data.study.venueOtherNote &&
      !data.study.venues.includes("OTHER")
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Add a note only when Other place is selected.",
        path: ["study", "venueOtherNote"],
      });
    }
  });

export type CreateClassmatePostInput = z.infer<typeof createClassmatePostSchema>;

export const classmatePostInsightBodySchema = z.object({
  kind: z.nativeEnum(ClassmatePostInsightKind),
});

export type ClassmatePostInsightBody = z.infer<typeof classmatePostInsightBodySchema>;
