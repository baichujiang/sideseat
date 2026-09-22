import { z } from "zod";

export const directMessagePageQuerySchema = z.object({
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const communityMessagePageQuerySchema = directMessagePageQuerySchema;

export const communityTextMessageSchema = z.object({
  body: z.string().trim().min(1).max(500),
  replyToId: z.string().cuid().optional(),
});

export const groupTextMessageSchema = communityTextMessageSchema;
