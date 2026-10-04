import { z } from "zod";

export const sharedTimeSelectionSchema = z.object({
  intentVersion: z.number().int().positive(),
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
});
export type SharedTimeSelection = z.infer<typeof sharedTimeSelectionSchema>;

export function validSharedTimeSelection(
  selection: SharedTimeSelection,
  intent: { version: number; timeWindows: unknown },
  now = new Date(),
) {
  return selection.intentVersion === intent.version
    && new Date(selection.startAt) > now
    && new Date(selection.endAt) > new Date(selection.startAt)
    && Array.isArray(intent.timeWindows)
    && intent.timeWindows.some(window => window.startAt === selection.startAt && window.endAt === selection.endAt);
}
