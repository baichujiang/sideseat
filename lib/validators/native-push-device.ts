import { z } from "zod";

export const nativePushRegisterSchema = z.object({
  token: z.string().min(1).max(512),
  platform: z.enum(["ios", "android"]),
  userAgent: z.string().max(512).optional(),
});

export type NativePushRegisterInput = z.infer<typeof nativePushRegisterSchema>;

export const nativePushUnregisterSchema = z.object({
  token: z.string().min(1).max(512),
});
