import { z } from "zod";

import { loginRequestSchema } from "@/lib/validators/auth";

export const nativeDeviceSchema = z.object({
  id: z.string().trim().min(8).max(128),
  name: z.string().trim().min(1).max(128),
  appVersion: z.string().trim().min(1).max(32),
  platformVersion: z.string().trim().min(1).max(32),
});

export const nativeLoginRequestSchema = loginRequestSchema.extend({
  device: nativeDeviceSchema,
});

export const nativeRefreshRequestSchema = z.object({
  refreshToken: z.string().trim().min(32).max(512),
  device: nativeDeviceSchema,
});

export const nativeLogoutRequestSchema = z.object({
  refreshToken: z.string().trim().min(32).max(512),
});

export type NativeDevice = z.infer<typeof nativeDeviceSchema>;
