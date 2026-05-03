import { ClassmatePostCategory } from "@prisma/client";
import { z } from "zod";

export const createClassmatePostSchema = z.object({
  city: z.string().trim().min(1).max(60).default("Munich"),
  category: z.nativeEnum(ClassmatePostCategory),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().max(280).optional().or(z.literal("")),
  expiresAt: z.string().datetime(),
});

export type CreateClassmatePostInput = z.infer<typeof createClassmatePostSchema>;
