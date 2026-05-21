import { LanguageProficiency, LanguageTag, UserGender } from "@prisma/client";
import { z } from "zod";

const loginEmailFieldSchema = z
  .string()
  .trim()
  .min(3, "Enter your email.")
  .max(254)
  .transform((s) => s.toLowerCase())
  .refine((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s), {
    message: "Enter a valid email address.",
  });

export const loginEmailSendOtpSchema = z.object({
  email: loginEmailFieldSchema,
});

export const loginEmailChangeSchema = z.object({
  email: loginEmailFieldSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit verification code."),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string().min(1, "Confirm your new password."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  })
  .refine((data) => data.currentPassword !== data.password, {
    message: "New password must be different from your current password.",
    path: ["password"],
  });

import { schoolDirectory } from "@/lib/constants/schools";
import { DEGREE_LEVELS, MAX_SEMESTER } from "@/lib/constants/majors";

/** Name + tagline only (e.g. Home card). Avatar uses POST /api/profile/avatar. */
export const homeProfileQuickSchema = z.object({
  nickname: z.string().min(2).max(32),
  bio: z.string().max(120).optional().or(z.literal("")),
});

/** PATCH: update nickname and/or bio independently (at least one field required). */
export const homeProfileQuickPatchSchema = z
  .object({
    nickname: z.string().min(2).max(32).optional(),
    bio: z.string().max(120).optional().or(z.literal("")),
  })
  .strict()
  .refine((d) => d.nickname !== undefined || d.bio !== undefined, {
    message: "Nothing to update.",
  });

/** Profile fields saved via PUT /api/profile (avatar is POST /api/profile/avatar). */
export const profileSchema = z.object({
  nickname: z.string().min(2).max(32),
  gender: z.nativeEnum(UserGender),
  school: z.enum(
    Object.keys(schoolDirectory) as [
      keyof typeof schoolDirectory,
      ...(keyof typeof schoolDirectory)[],
    ]
  ),
  degreeLevel: z.enum(DEGREE_LEVELS, {
    errorMap: () => ({ message: "Pick a degree level." }),
  }),
  major: z
    .string()
    .max(160)
    .transform((s) => s.trim())
    .refine((s) => s === "" || s.length >= 2, {
      message: "Pick a major or leave it as not specified.",
    }),
  semester: z.coerce.number().int().min(1).max(MAX_SEMESTER),
  /** Languages + level (shown on profile / Discover). */
  languages: z
    .array(
      z.object({
        tag: z.nativeEnum(LanguageTag),
        proficiency: z.nativeEnum(LanguageProficiency),
      }),
    )
    .min(1, { message: "Select at least one language." })
    .refine((rows) => new Set(rows.map((r) => r.tag)).size === rows.length, {
      message: "Each language can only appear once.",
    }),
  bio: z.string().max(120).optional().or(z.literal("")),
  wechatHandle: z.string().max(80).optional().or(z.literal("")),
  whatsappHandle: z.string().max(80).optional().or(z.literal("")),
  telegramHandle: z.string().max(80).optional().or(z.literal("")),
  instagramHandle: z.string().max(80).optional().or(z.literal("")),
  discoverByCourse: z.boolean(),
  discoverByMajor: z.boolean(),
  discoverBySemester: z.boolean(),
  allowInvitationNotes: z.boolean(),
  contactInfoOptIn: z.boolean(),
  hideFromCourseMembers: z.boolean(),
  hideFromDiscovery: z.boolean(),
  hideFromRecommendations: z.boolean(),
});
