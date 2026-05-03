import { LanguageTag } from "@prisma/client";
import { z } from "zod";

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
  school: z.enum(
    Object.keys(schoolDirectory) as [
      keyof typeof schoolDirectory,
      ...(keyof typeof schoolDirectory)[],
    ]
  ),
  degreeLevel: z.enum(DEGREE_LEVELS, {
    errorMap: () => ({ message: "Pick a degree level." }),
  }),
  major: z.string().min(2).max(160),
  semester: z.coerce.number().int().min(1).max(MAX_SEMESTER),
  /** Languages you use with classmates (shown on your profile in Discover / peer view). */
  languages: z
    .array(z.nativeEnum(LanguageTag))
    .min(1, { message: "Select at least one language." }),
  bio: z.string().max(120).optional().or(z.literal("")),
  wechatHandle: z.string().max(80).optional().or(z.literal("")),
  whatsappHandle: z.string().max(80).optional().or(z.literal("")),
  telegramHandle: z.string().max(80).optional().or(z.literal("")),
  instagramHandle: z.string().max(80).optional().or(z.literal("")),
});
