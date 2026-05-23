import { DiscoverActivityCategory } from "@prisma/client";
import { z } from "zod";

import {
  DISCOVER_ACTIVITY_CAPACITY_MAX,
  DISCOVER_ACTIVITY_CAPACITY_MIN,
  DISCOVER_ACTIVITY_DESCRIPTION_MAX,
  DISCOVER_ACTIVITY_LOCATION_MAX,
  DISCOVER_ACTIVITY_MIN_START_OFFSET_MS,
  DISCOVER_ACTIVITY_TITLE_MAX,
} from "@/lib/constants/discover-activity";

export const discoverActivityCategorySchema = z.nativeEnum(DiscoverActivityCategory);

export const createDiscoverActivitySchema = z
  .object({
    title: z.string().trim().min(1).max(DISCOVER_ACTIVITY_TITLE_MAX),
    description: z.string().trim().min(1).max(DISCOVER_ACTIVITY_DESCRIPTION_MAX),
    startAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
    location: z.string().trim().min(1).max(DISCOVER_ACTIVITY_LOCATION_MAX),
    unlimitedCapacity: z.boolean().optional().default(true),
    capacity: z.number().int().min(DISCOVER_ACTIVITY_CAPACITY_MIN).max(DISCOVER_ACTIVITY_CAPACITY_MAX).optional(),
  })
  .superRefine((data, ctx) => {
    const start = new Date(data.startAt);
    if (Number.isNaN(start.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choose a valid start time.", path: ["startAt"] });
      return;
    }
    const minStart = Date.now() + DISCOVER_ACTIVITY_MIN_START_OFFSET_MS;
    if (start.getTime() < minStart) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Start time must be at least one hour from now.",
        path: ["startAt"],
      });
    }
    if (!data.unlimitedCapacity) {
      if (data.capacity == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter a capacity between 2 and 50, or choose unlimited.",
          path: ["capacity"],
        });
      }
    }
  });

export const listDiscoverActivitiesQuerySchema = z.object({
  city: z.string().optional(),
  category: discoverActivityCategorySchema.optional(),
  q: z.string().optional(),
});

export type CreateDiscoverActivityInput = z.infer<typeof createDiscoverActivitySchema>;
