import { ClassmatePostInsightKind } from "@prisma/client";
import { z } from "zod";

/** Single source of truth for `POST /api/classmate-posts` string limits (trimmed). */
export const CLASSMATE_POST_CITY_MAX_LEN = 60;
export const CLASSMATE_POST_TITLE_MAX_LEN = 120;
export const CLASSMATE_POST_BODY_MAX_LEN = 280;

export const CLASSMATE_POST_META_OTHER_NOTE_MAX = 40;
export const CLASSMATE_POST_STUDY_VENUE_OTHER_NOTE_MAX = CLASSMATE_POST_META_OTHER_NOTE_MAX;
export const CLASSMATE_POST_MEALS_VENUE_OTHER_NOTE_MAX = CLASSMATE_POST_META_OTHER_NOTE_MAX;
export const CLASSMATE_POST_SPORT_OTHER_NOTE_MAX = CLASSMATE_POST_META_OTHER_NOTE_MAX;

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
/** Keep in sync with `LanguageTag` in prisma/schema.prisma. */
export const LANGUAGE_TAG_VALUES = [
  "CHINESE",
  "ENGLISH",
  "GERMAN",
  "FRENCH",
  "HINDI",
  "SPANISH",
  "OTHER",
] as const;
/** Keep in sync with `LanguageProficiency` in prisma/schema.prisma. */
export const LANGUAGE_PROFICIENCY_VALUES = [
  "NATIVE",
  "FLUENT",
  "CONVERSATIONAL",
  "BASIC",
  "LEARNING",
] as const;
/** Keep in sync with `SportTag` in prisma/schema.prisma. */
export const SPORT_TAG_VALUES = [
  "BASKETBALL",
  "BADMINTON",
  "TABLE_TENNIS",
  "FOOTBALL",
  "VOLLEYBALL",
  "TENNIS",
  "GYM",
  "RUNNING",
  "HIKING",
  "CYCLING",
  "SWIMMING",
  "SKIING",
  "CLIMBING",
  "YOGA",
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

function dedupeOffersPreserveOrder<
  T extends {
    tag: string;
  },
>(values: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const value of values) {
    if (seen.has(value.tag)) continue;
    seen.add(value.tag);
    out.push(value);
  }
  return out;
}

const otherNoteSchema = z.preprocess(
  (v) => (v == null ? undefined : v),
  z.string().trim().max(CLASSMATE_POST_META_OTHER_NOTE_MAX).optional(),
);

export const studyPayloadSchema = z
  .object({
    purposes: z.array(z.enum(STUDY_PURPOSE_VALUES)).max(STUDY_PURPOSE_VALUES.length).optional(),
    timeSlots: z.array(z.enum(STUDY_TIME_SLOT_VALUES)).max(STUDY_TIME_SLOT_VALUES.length).optional(),
    venues: z.array(z.enum(STUDY_VENUE_VALUES)).max(STUDY_VENUE_VALUES.length).optional(),
    venueOtherNote: otherNoteSchema,
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

export const mealsPayloadSchema = z
  .object({
    /** Free-text “where to eat”; persisted as `ClassmatePostMeals.venueOtherNote` with empty `venueTags`. */
    venueOtherNote: otherNoteSchema,
  })
  .transform((row) => ({
    venueOtherNote:
      typeof row.venueOtherNote === "string" && row.venueOtherNote.trim().length > 0
        ? row.venueOtherNote.trim()
        : undefined,
  }));

export type MealsPayloadNormalized = z.infer<typeof mealsPayloadSchema>;

export function classmatePostMealsPayloadHasData(meals: MealsPayloadNormalized): boolean {
  return Boolean(meals.venueOtherNote);
}

export const classmatePostLanguageOfferSchema = z.object({
  tag: z.enum(LANGUAGE_TAG_VALUES),
  proficiency: z.enum(LANGUAGE_PROFICIENCY_VALUES),
});

export const classmatePostLanguageOffersSchema = z
  .array(classmatePostLanguageOfferSchema)
  .max(LANGUAGE_TAG_VALUES.length)
  .transform((offers) => dedupeOffersPreserveOrder(offers));

export const languagePayloadSchema = z
  .object({
    offers: classmatePostLanguageOffersSchema.optional(),
    targets: z.array(z.enum(LANGUAGE_TAG_VALUES)).max(LANGUAGE_TAG_VALUES.length).optional(),
  })
  .transform((row) => ({
    offers: row.offers ?? [],
    targets: dedupePreserveOrder(row.targets ?? []),
  }));

export type LanguagePayloadNormalized = z.infer<typeof languagePayloadSchema>;

export function classmatePostLanguagePayloadHasData(language: LanguagePayloadNormalized): boolean {
  return language.offers.length > 0 || language.targets.length > 0;
}

export const sportPayloadSchema = z
  .object({
    sportTags: z.array(z.enum(SPORT_TAG_VALUES)).max(SPORT_TAG_VALUES.length).optional(),
    sportOtherNote: otherNoteSchema,
  })
  .transform((row) => ({
    sportTags: dedupePreserveOrder(row.sportTags ?? []),
    sportOtherNote:
      typeof row.sportOtherNote === "string" && row.sportOtherNote.trim().length > 0
        ? row.sportOtherNote.trim()
        : undefined,
  }));

export type SportPayloadNormalized = z.infer<typeof sportPayloadSchema>;

export function classmatePostSportPayloadHasData(sport: SportPayloadNormalized): boolean {
  return sport.sportTags.length > 0 || Boolean(sport.sportOtherNote);
}

/** Keep in sync with `ClassmatePostCategory` in prisma/schema.prisma. */
const classmatePostCategorySchema = z.enum([
  "STUDY",
  "MEALS",
  "LANGUAGE",
  "SPORTS",
  "SHARED_COURSES",
]);

/** Max images per Discover post (`ClassmatePostImage.sortOrder` is 0..2). */
export const CLASSMATE_POST_MAX_IMAGES = 3;

function dedupeImageUrlsPreserveOrder(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
    if (out.length >= CLASSMATE_POST_MAX_IMAGES) break;
  }
  return out;
}

/** Optional image URLs for `POST /api/classmate-posts` (validated again server-side for origin). */
export const classmatePostImageUrlsSchema = z
  .array(z.string().min(1).max(4_000_000))
  .max(CLASSMATE_POST_MAX_IMAGES)
  .optional()
  .transform((arr) => {
    if (!arr?.length) return undefined;
    const trimmed = arr.map((u) => u.trim()).filter((u) => u.length > 0);
    const next = dedupeImageUrlsPreserveOrder(trimmed);
    return next.length ? next : undefined;
  });

export const createClassmatePostSchema = z
  .object({
    city: z.string().trim().min(1).max(CLASSMATE_POST_CITY_MAX_LEN).default("Munich"),
    category: classmatePostCategorySchema.optional(),
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
    meals: mealsPayloadSchema.optional(),
    language: languagePayloadSchema.optional(),
    sport: sportPayloadSchema.optional(),
    imageUrls: classmatePostImageUrlsSchema,
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
    if (data.meals != null && data.category !== "MEALS") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Meal preferences only apply to Meals posts.",
        path: ["meals"],
      });
    }
    if (data.language != null && data.category !== "LANGUAGE") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Language preferences only apply to Language posts.",
        path: ["language"],
      });
    }
    if (data.category === "LANGUAGE" && !classmatePostLanguagePayloadHasData(data.language ?? { offers: [], targets: [] })) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Add at least one language you offer or want to practice.",
        path: ["language"],
      });
    }
    if (data.sport != null && data.category !== "SPORTS") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Sport preferences only apply to Sports posts.",
        path: ["sport"],
      });
    }
    if (data.category === "SPORTS" && data.sport != null && data.sport.sportTags.includes("OTHER")) {
      if (!data.sport.sportOtherNote?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Add a short note when you choose Other sport.",
          path: ["sport", "sportOtherNote"],
        });
      }
    }
  });

export type CreateClassmatePostInput = z.infer<typeof createClassmatePostSchema>;

export const classmatePostInsightBodySchema = z.object({
  kind: z.nativeEnum(ClassmatePostInsightKind),
});

export type ClassmatePostInsightBody = z.infer<typeof classmatePostInsightBodySchema>;
