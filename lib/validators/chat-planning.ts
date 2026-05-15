import { PlanType } from "@prisma/client";
import { z } from "zod";

const isoDateString = z.string().min(1);
const isoDateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const availabilityShareSchema = z
  .object({
    visibilityMode: z.literal("FREE_BUSY").default("FREE_BUSY"),
    /// Full continuous range (e.g. next calendar week). Omit when sending `includedDates`.
    rangeStart: isoDateString.optional(),
    rangeEnd: isoDateString.optional(),
    /// Specific calendar days to share (non-contiguous ok). When set, range is derived server-side.
    includedDates: z.array(isoDateOnly).max(62).optional(),
    expiresAt: isoDateString.optional().or(z.literal("")),
  })
  .superRefine((value, ctx) => {
    const hasPick = Boolean(value.includedDates?.length);
    const hasRange = Boolean(value.rangeStart && value.rangeEnd);

    if (!hasPick && !hasRange) {
      ctx.addIssue({
        code: "custom",
        message: "Choose next week or pick at least one day on the calendar.",
      });
      return;
    }
    if (hasPick && hasRange) {
      ctx.addIssue({
        code: "custom",
        message: "Send either selected days or a continuous range, not both.",
      });
      return;
    }

    if (hasPick) {
      const parsed = value.includedDates!.map((ds) => new Date(`${ds}T12:00:00`));
      if (parsed.some((d) => Number.isNaN(d.getTime()))) {
        ctx.addIssue({ code: "custom", path: ["includedDates"], message: "Invalid date in selection." });
        return;
      }
    } else {
      const start = new Date(value.rangeStart!);
      const end = new Date(value.rangeEnd!);
      if (Number.isNaN(start.getTime())) {
        ctx.addIssue({ code: "custom", path: ["rangeStart"], message: "Choose a valid start date." });
        return;
      }
      if (Number.isNaN(end.getTime())) {
        ctx.addIssue({ code: "custom", path: ["rangeEnd"], message: "Choose a valid end date." });
        return;
      }
      if (end <= start) {
        ctx.addIssue({ code: "custom", path: ["rangeEnd"], message: "End must be after start." });
        return;
      }
    }

    const expiresAt = value.expiresAt?.trim() ? new Date(value.expiresAt) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "Choose a valid expiry time." });
    }
    // Expiry vs shared window is enforced in the route (clamp defaults like "+7 days" when the
    // picked range starts later).
  });

export const planRequestCreateSchema = z
  .object({
    planType: z.nativeEnum(PlanType),
    title: z.string().trim().min(1).max(120),
    location: z.string().trim().max(120).optional().or(z.literal("")),
    message: z.string().trim().max(500).optional().or(z.literal("")),
    startTime: isoDateString,
    endTime: isoDateString,
    receiverUserId: z.string().cuid().optional(),
  })
  .superRefine((value, ctx) => {
    const start = new Date(value.startTime);
    const end = new Date(value.endTime);
    if (Number.isNaN(start.getTime())) {
      ctx.addIssue({ code: "custom", path: ["startTime"], message: "Choose a valid start time." });
      return;
    }
    if (Number.isNaN(end.getTime())) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "Choose a valid end time." });
      return;
    }
    if (end <= start) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "End must be after start." });
    }
    if (end.getTime() - start.getTime() < 30 * 60 * 1000) {
      ctx.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "Plans must be at least 30 minutes long.",
      });
    }
  });

export const planRequestActionSchema = z.object({
  requestId: z.string().cuid(),
});

export const counterProposeSchema = z
  .object({
    planType: z.nativeEnum(PlanType),
    title: z.string().trim().min(1).max(120),
    location: z.string().trim().max(120).optional().or(z.literal("")),
    message: z.string().trim().max(500).optional().or(z.literal("")),
    startTime: isoDateString,
    endTime: isoDateString,
  })
  .superRefine((value, ctx) => {
    const start = new Date(value.startTime);
    const end = new Date(value.endTime);
    if (Number.isNaN(start.getTime())) {
      ctx.addIssue({ code: "custom", path: ["startTime"], message: "Choose a valid start time." });
      return;
    }
    if (Number.isNaN(end.getTime())) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "Choose a valid end time." });
      return;
    }
    if (end <= start) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "End must be after start." });
    }
    if (end.getTime() - start.getTime() < 30 * 60 * 1000) {
      ctx.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "Plans must be at least 30 minutes long.",
      });
    }
  });

export type AvailabilityShareInput = z.infer<typeof availabilityShareSchema>;
export type PlanRequestCreateInput = z.infer<typeof planRequestCreateSchema>;
export type CounterProposeInput = z.infer<typeof counterProposeSchema>;
