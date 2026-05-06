import { StudentVerificationStatus, UserGender } from "@prisma/client";
import { z } from "zod";

import { schoolDirectory } from "@/lib/constants/schools";
import { DEGREE_LEVELS, MAX_SEMESTER } from "@/lib/constants/majors";

/**
 * Admin-side user edit. Any field omitted from the payload is left untouched.
 * All strings are trimmed; empty strings for optional fields clear them out.
 */
export const adminUserUpdateSchema = z.object({
  nickname: z.string().trim().min(1).max(32).optional(),
  gender: z.nativeEnum(UserGender).optional(),
  email: z
    .union([z.string().trim().email().toLowerCase(), z.literal("")])
    .optional(),
  school: z
    .enum(
      Object.keys(schoolDirectory) as [
        keyof typeof schoolDirectory,
        ...(keyof typeof schoolDirectory)[],
      ],
    )
    .optional(),
  degreeLevel: z.enum(DEGREE_LEVELS).optional(),
  major: z.string().trim().max(160).optional().or(z.literal("")),
  semester: z.coerce.number().int().min(1).max(MAX_SEMESTER).optional(),
  bio: z.string().max(240).optional().or(z.literal("")),
  wechatHandle: z.string().trim().max(80).optional().or(z.literal("")),
  whatsappHandle: z.string().trim().max(80).optional().or(z.literal("")),
  telegramHandle: z.string().trim().max(80).optional().or(z.literal("")),
  instagramHandle: z.string().trim().max(80).optional().or(z.literal("")),
  verifiedStudent: z.boolean().optional(),
  studentVerificationStatus: z.nativeEnum(StudentVerificationStatus).optional(),
  studentVerificationNotes: z.string().max(500).optional().or(z.literal("")),
  onboardingComplete: z.boolean().optional(),
});

export type AdminUserUpdateInput = z.infer<typeof adminUserUpdateSchema>;
