import { z } from "zod";

import { schoolDirectory } from "@/lib/constants/schools";
import { DEGREE_LEVELS, MAX_SEMESTER } from "@/lib/constants/majors";

/** Profile fields saved via PUT /api/profile (avatar is POST /api/profile/avatar; languages stay default/legacy). */
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
  bio: z.string().max(120).optional().or(z.literal("")),
  wechatHandle: z.string().max(80).optional().or(z.literal("")),
  whatsappHandle: z.string().max(80).optional().or(z.literal("")),
  telegramHandle: z.string().max(80).optional().or(z.literal("")),
  instagramHandle: z.string().max(80).optional().or(z.literal("")),
});
