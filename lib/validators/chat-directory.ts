import { z } from "zod";

export const contactAddSchema = z.object({
  peerId: z.string().cuid(),
});

export const groupChatCreateSchema = z.object({
  title: z.string().trim().max(80).optional().or(z.literal("")),
  participantIds: z.array(z.string().cuid()).min(2).max(24),
});
