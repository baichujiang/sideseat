import {
  SocialIntentTopic,
  SportTag,
  TogetherMode,
} from "@prisma/client";
import { z } from "zod";
import { intentTimePreferenceSchema } from "@/lib/v2/intent-timing";

const MIN_WINDOW_MS = 30 * 60 * 1_000;
const MAX_WINDOW_MS = 12 * 60 * 60 * 1_000;

function validTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export const weeklyIntentTimeWindowSchema = z
  .object({
    startAt: z.string().datetime({ offset: true }),
    endAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((value, ctx) => {
    const duration =
      new Date(value.endAt).getTime() - new Date(value.startAt).getTime();
    if (duration < MIN_WINDOW_MS) {
      ctx.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "A time window must be at least 30 minutes.",
      });
    } else if (duration > MAX_WINDOW_MS) {
      ctx.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "A time window cannot exceed 12 hours.",
      });
    }
  });

const weeklyIntentWindowsSchema = z
  .array(weeklyIntentTimeWindowSchema)
  .max(7)
  .superRefine((windows, ctx) => {
    const sorted = windows
      .map((window, index) => ({
        index,
        startAt: new Date(window.startAt).getTime(),
        endAt: new Date(window.endAt).getTime(),
      }))
      .sort((a, b) => a.startAt - b.startAt || a.endAt - b.endAt);
    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index]!.startAt < sorted[index - 1]!.endAt) {
        ctx.addIssue({
          code: "custom",
          path: [sorted[index]!.index],
          message: "Time windows cannot overlap.",
        });
      }
    }
  });

const timeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(validTimeZone, "Choose a valid IANA time zone.");

const sportTagSchema = z.nativeEnum(SportTag).nullable().optional();
const sportOtherNoteSchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .nullable()
  .optional();
const studyGoalSchema = z
  .string()
  .trim()
  .max(80)
  .nullable()
  .optional()
  .transform((value) => value === "" ? null : value);
const activityTextSchema = z
  .string()
  .trim()
  .max(80)
  .nullable()
  .optional()
  .transform((value) => value === "" ? null : value);

type ActivityTextSelection = Readonly<{
  topic?: SocialIntentTopic;
  activityText?: string | null;
}>;

function validateActivityTextSelection(
  value: ActivityTextSelection,
  ctx: z.RefinementCtx,
) {
  if (
    value.topic !== undefined &&
    (value.topic === SocialIntentTopic.STUDY ||
      value.topic === SocialIntentTopic.SPORTS) &&
    typeof value.activityText === "string"
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["activityText"],
      message: "Use the topic-specific activity field for Study or Sports.",
    });
  }
}

type SportSelection = Readonly<{
  topic?: SocialIntentTopic;
  sportTag?: SportTag | null;
  sportOtherNote?: string | null;
}>;

function validateSportSelection(
  value: SportSelection,
  ctx: z.RefinementCtx,
) {
  const hasOtherNote = typeof value.sportOtherNote === "string";

  if (
    value.topic !== undefined &&
    value.topic !== SocialIntentTopic.SPORTS
  ) {
    if (value.sportTag != null) {
      ctx.addIssue({
        code: "custom",
        path: ["sportTag"],
        message: "A sport can only be set for a sports intention.",
      });
    }
    if (hasOtherNote) {
      ctx.addIssue({
        code: "custom",
        path: ["sportOtherNote"],
        message: "A custom sport can only be set for a sports intention.",
      });
    }
    return;
  }

  if (value.sportTag === SportTag.OTHER && !hasOtherNote) {
    ctx.addIssue({
      code: "custom",
      path: ["sportOtherNote"],
      message: "Describe the sport when choosing Other.",
    });
  }

  if (
    value.sportTag !== undefined &&
    value.sportTag !== SportTag.OTHER &&
    hasOtherNote
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["sportOtherNote"],
      message: "A custom sport is only used with Other.",
    });
  }

  if (
    value.topic === SocialIntentTopic.SPORTS &&
    value.sportTag == null &&
    hasOtherNote
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["sportTag"],
      message: "Choose Other before describing a custom sport.",
    });
  }
}

type StudySelection = Readonly<{
  topic?: SocialIntentTopic;
  studyGoal?: string | null;
}>;

function validateStudySelection(
  value: StudySelection,
  ctx: z.RefinementCtx,
) {
  if (
    value.topic !== undefined &&
    value.topic !== SocialIntentTopic.STUDY &&
    typeof value.studyGoal === "string"
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["studyGoal"],
      message: "A study goal can only be set for a study intention.",
    });
  }
}

type TogetherSelection = Readonly<{
  topic?: SocialIntentTopic;
  togetherMode?: TogetherMode;
}>;

function validateTogetherSelection(
  value: TogetherSelection,
  ctx: z.RefinementCtx,
) {
  if (
    value.topic !== undefined &&
    value.topic !== SocialIntentTopic.STUDY &&
    value.togetherMode !== undefined &&
    value.togetherMode !== TogetherMode.SAME_ACTIVITY
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["togetherMode"],
      message: "Parallel mode is currently available only for study intentions.",
    });
  }
}

const intentFields = {
  topic: z.nativeEnum(SocialIntentTopic),
  togetherMode: z.nativeEnum(TogetherMode).optional(),
  studyGoal: studyGoalSchema,
  // Optional/nullable keeps old TestFlight clients readable. Current clients
  // always provide a concrete action for the four general categories.
  activityText: activityTextSchema,
  // Optional/nullable keeps already-shipped clients compatible. New clients
  // provide one concrete value for SPORTS so matching never treats every
  // sport as interchangeable.
  sportTag: sportTagSchema,
  sportOtherNote: sportOtherNoteSchema,
  courseId: z.string().trim().min(1).max(191).nullable().optional(),
  timeWindows: weeklyIntentWindowsSchema,
  timePreference: intentTimePreferenceSchema.optional(),
  automaticMatching: z.literal(true).optional(),
  timeZone: timeZoneSchema,
  note: z.string().trim().max(160).nullable().optional(),
} as const;

export const weeklyIntentCreateSchema = z
  .object(intentFields)
  .strict()
  .superRefine((value, ctx) => {
    const exact = !value.timePreference || value.timePreference.kind === "EXACT";
    if (exact ? value.timeWindows.length === 0 : value.timeWindows.length !== 0) {
      ctx.addIssue({ code: "custom", path: ["timeWindows"],
        message: exact ? "Choose at least one exact time window." : "Flexible timing must not declare exact availability." });
    }
  })
  .superRefine(validateActivityTextSelection)
  .superRefine(validateSportSelection)
  .superRefine(validateStudySelection)
  .superRefine(validateTogetherSelection);

const weeklyIntentEditSchema = z
  .object({
    action: z.literal("EDIT"),
    expectedVersion: z.number().int().positive(),
    topic: intentFields.topic.optional(),
    togetherMode: intentFields.togetherMode,
    studyGoal: intentFields.studyGoal,
    activityText: intentFields.activityText,
    sportTag: intentFields.sportTag,
    sportOtherNote: intentFields.sportOtherNote,
    courseId: intentFields.courseId,
    timeWindows: intentFields.timeWindows.optional(),
    timePreference: intentFields.timePreference,
    automaticMatching: intentFields.automaticMatching,
    timeZone: intentFields.timeZone.optional(),
    note: intentFields.note,
  })
  .strict()
  .refine(
    (value) =>
      value.topic !== undefined ||
      value.togetherMode !== undefined ||
      value.studyGoal !== undefined ||
      value.activityText !== undefined ||
      value.sportTag !== undefined ||
      value.sportOtherNote !== undefined ||
      value.courseId !== undefined ||
      value.timeWindows !== undefined ||
      value.timePreference !== undefined ||
      value.automaticMatching !== undefined ||
      value.timeZone !== undefined ||
      value.note !== undefined,
    { message: "Choose at least one field to edit." },
  )
  .superRefine(validateActivityTextSelection)
  .superRefine(validateSportSelection)
  .superRefine(validateStudySelection)
  .superRefine(validateTogetherSelection);

const weeklyIntentPauseSchema = z
  .object({
    action: z.literal("PAUSE"),
    expectedVersion: z.number().int().positive(),
  })
  .strict();

const weeklyIntentResumeSchema = z
  .object({
    action: z.literal("RESUME"),
    expectedVersion: z.number().int().positive(),
    automaticMatching: intentFields.automaticMatching,
  })
  .strict();

export const weeklyIntentPatchSchema = z.union([
  weeklyIntentEditSchema,
  weeklyIntentPauseSchema,
  weeklyIntentResumeSchema,
  z.object({ action: z.literal("EXTEND"), expectedVersion: z.number().int().positive() }).strict(),
]);

export const weeklyIntentEndSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();

export type WeeklyIntentCreateInput = z.infer<
  typeof weeklyIntentCreateSchema
>;
export type WeeklyIntentPatchInput = z.infer<typeof weeklyIntentPatchSchema>;
export type WeeklyIntentEndInput = z.infer<typeof weeklyIntentEndSchema>;
