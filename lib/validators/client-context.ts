import { z } from "zod";

export const clientContextSchema = z.object({
  installId: z.string().min(1).max(120),
  timezone: z.string().min(1).max(120).optional(),
  language: z.string().min(2).max(120).optional(),
  platform: z.string().min(1).max(120).optional(),
  screenWidth: z.number().int().min(0).max(10000).optional(),
  screenHeight: z.number().int().min(0).max(10000).optional(),
});

export type ClientContextInput = z.infer<typeof clientContextSchema>;
