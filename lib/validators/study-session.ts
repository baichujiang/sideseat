import { z } from "zod";

import { ACTIVITY_TYPES } from "@/lib/constants/activities";

/** Upper bound on session length. Anything longer feels like a class, not
 *  a study meet, and is much more likely to be a client bug than intent. */
const MAX_DURATION_MINUTES = 8 * 60;

/** Proposal can't be booked for the past and we enforce ~5 min lead time
 *  so you can't propose a session that starts "in 10 seconds". */
const MIN_LEAD_MINUTES = 5;

/** Cap how far ahead you can schedule. Keeps proposal volume and stale rows
 *  bounded without requiring a cleanup job during MVP. */
const MAX_LEAD_DAYS = 28;

const timeWindow = z
  .object({
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
  })
  .refine((v) => v.endAt > v.startAt, { message: "End must be after start." })
  .refine(
    (v) => v.endAt.getTime() - v.startAt.getTime() <= MAX_DURATION_MINUTES * 60 * 1000,
    { message: "Session must be ≤ 8 hours." },
  )
  .refine(
    (v) => v.startAt.getTime() >= Date.now() + MIN_LEAD_MINUTES * 60 * 1000,
    { message: `Start at least ${MIN_LEAD_MINUTES} minutes from now.` },
  )
  .refine(
    (v) => v.startAt.getTime() <= Date.now() + MAX_LEAD_DAYS * 24 * 60 * 60 * 1000,
    { message: `Start within ${MAX_LEAD_DAYS} days.` },
  );

const detailsShape = z.object({
  activityType: z.enum(ACTIVITY_TYPES).default("STUDY_SESSION"),
  location: z.string().trim().max(120).optional().or(z.literal("")),
  note: z.string().trim().max(240).optional().or(z.literal("")),
});

export const createProposalSchema = z.intersection(timeWindow, detailsShape);

export const counterProposalSchema = z.intersection(timeWindow, detailsShape);

/** Actions on an existing proposal. `counter` carries a fresh time window
 *  and details; the rest are parameter-less and come through as form posts
 *  with just an `action` field. */
export const proposalActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept") }),
  z.object({ action: z.literal("decline") }),
  z.object({ action: z.literal("cancel") }),
]);
