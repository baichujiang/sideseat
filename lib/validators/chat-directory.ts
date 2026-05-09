import { z } from "zod";

export const GROUP_CHAT_TITLE_MAX_LEN = 80;

export const contactAddSchema = z.object({
  peerId: z.string().cuid(),
});

export const groupChatCreateSchema = z.object({
  title: z
    .string()
    .trim()
    .max(GROUP_CHAT_TITLE_MAX_LEN)
    .optional()
    .or(z.literal("")),
  participantIds: z.array(z.string().cuid()).min(2).max(24),
});

/** Empty string clears the custom title (falls back to automatic member names). */
export const groupChatPatchSchema = z.object({
  title: z.string().trim().max(GROUP_CHAT_TITLE_MAX_LEN),
});

export const groupChatAddMembersSchema = z.object({
  participantIds: z.array(z.string().cuid()).min(1).max(24),
});
