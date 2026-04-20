import { z } from "zod";

import { schoolDirectory } from "@/lib/constants/schools";

/** Profile fields saved via PUT /api/profile (avatar is POST /api/profile/avatar; languages stay default/legacy). */
export const profileSchema = z.object({
  nickname: z.string().min(2).max(32),
  school: z.enum(
    Object.keys(schoolDirectory) as [
      keyof typeof schoolDirectory,
      ...(keyof typeof schoolDirectory)[],
    ]
  ),
  major: z.string().min(2).max(120),
  semester: z.coerce.number().int().min(1).max(20),
  bio: z.string().max(120).optional().or(z.literal("")),
  discoverByCourse: z.boolean(),
  discoverByMajor: z.boolean(),
  discoverBySemester: z.boolean(),
  allowInvitationNotes: z.boolean(),
  contactInfoOptIn: z.boolean(),
  wechatHandle: z.string().max(80).optional().or(z.literal("")),
  whatsappHandle: z.string().max(80).optional().or(z.literal("")),
  telegramHandle: z.string().max(80).optional().or(z.literal("")),
  instagramHandle: z.string().max(80).optional().or(z.literal("")),
});
