import { z } from "zod";

import {
  SCHEDULE_SHARE_CONTACT_MAX_LENGTH,
  SCHEDULE_SHARE_LOCATION_MAX_LENGTH,
  SCHEDULE_SHARE_MAX_PROPOSAL_MINUTES,
  SCHEDULE_SHARE_MAX_RANGE_DAYS,
  SCHEDULE_SHARE_MAX_TTL_DAYS,
  SCHEDULE_SHARE_MIN_PROPOSAL_MINUTES,
  SCHEDULE_SHARE_NAME_MAX_LENGTH,
  SCHEDULE_SHARE_NOTE_MAX_LENGTH,
  SCHEDULE_SHARE_TITLE_MAX_LENGTH,
} from "@/lib/schedule-share/constants";
import { revealConfigSchema } from "@/lib/schedule-share/reveal-config";

const isoDate = z.string().min(1);

export const createScheduleShareSchema = z
  .object({
    rangeStart: isoDate,
    rangeEnd: isoDate,
    revealConfig: revealConfigSchema,
    allowGuestProposals: z.boolean().optional(),
    expiresAt: isoDate.optional(),
  })
  .superRefine((value, ctx) => {
    const start = new Date(value.rangeStart);
    const end = new Date(value.rangeEnd);
    if (Number.isNaN(start.getTime())) {
      ctx.addIssue({ code: "custom", path: ["rangeStart"], message: "Invalid range start." });
      return;
    }
    if (Number.isNaN(end.getTime())) {
      ctx.addIssue({ code: "custom", path: ["rangeEnd"], message: "Invalid range end." });
      return;
    }
    if (end <= start) {
      ctx.addIssue({ code: "custom", path: ["rangeEnd"], message: "End must be after start." });
      return;
    }
    const spanDays = (end.getTime() - start.getTime()) / (86_400_000);
    if (spanDays > SCHEDULE_SHARE_MAX_RANGE_DAYS) {
      ctx.addIssue({
        code: "custom",
        path: ["rangeEnd"],
        message: `Share range cannot exceed ${SCHEDULE_SHARE_MAX_RANGE_DAYS} days.`,
      });
    }
    if (value.expiresAt) {
      const exp = new Date(value.expiresAt);
      if (Number.isNaN(exp.getTime())) {
        ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "Invalid expiry." });
        return;
      }
      const ttlDays = (exp.getTime() - Date.now()) / (86_400_000);
      if (ttlDays > SCHEDULE_SHARE_MAX_TTL_DAYS + 1) {
        ctx.addIssue({
          code: "custom",
          path: ["expiresAt"],
          message: `Expiry cannot exceed ${SCHEDULE_SHARE_MAX_TTL_DAYS} days from now.`,
        });
      }
    }
  });

export const createScheduleShareProposalSchema = z
  .object({
    title: z.string().trim().min(1).max(SCHEDULE_SHARE_TITLE_MAX_LENGTH),
    note: z.string().trim().max(SCHEDULE_SHARE_NOTE_MAX_LENGTH).optional().or(z.literal("")),
    location: z.string().trim().max(SCHEDULE_SHARE_LOCATION_MAX_LENGTH).optional().or(z.literal("")),
    startTime: isoDate,
    endTime: isoDate,
  })
  .superRefine((value, ctx) => {
    const start = new Date(value.startTime);
    const end = new Date(value.endTime);
    if (Number.isNaN(start.getTime())) {
      ctx.addIssue({ code: "custom", path: ["startTime"], message: "Invalid start time." });
      return;
    }
    if (Number.isNaN(end.getTime())) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "Invalid end time." });
      return;
    }
    if (end <= start) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "End must be after start." });
      return;
    }
    const minutes = (end.getTime() - start.getTime()) / 60_000;
    if (minutes < SCHEDULE_SHARE_MIN_PROPOSAL_MINUTES || minutes > SCHEDULE_SHARE_MAX_PROPOSAL_MINUTES) {
      ctx.addIssue({
        code: "custom",
        path: ["endTime"],
        message: `Meeting duration must be between ${SCHEDULE_SHARE_MIN_PROPOSAL_MINUTES} and ${SCHEDULE_SHARE_MAX_PROPOSAL_MINUTES} minutes.`,
      });
    }
  });
