import { InvitationType, ReportReason, ReportStatus } from "@prisma/client";
import { z } from "zod";

import { clientContextSchema } from "@/lib/validators/client-context";

export const invitationSchema = z.object({
  receiverId: z.string().cuid(),
  courseId: z.string().cuid(),
  type: z.nativeEnum(InvitationType),
  note: z.string().max(240).optional().or(z.literal("")),
  clientContext: clientContextSchema.optional(),
});

export const invitationDecisionSchema = z.object({
  action: z.enum(["accept", "decline", "cancel"]),
});

export const messageSchema = z.object({
  body: z.string().min(1).max(500),
});

export const contactExchangeSchema = z.object({
  action: z.enum(["request", "accept", "decline"]),
});

export const endConnectionSchema = z.object({
  reason: z.string().max(240).optional().or(z.literal("")),
});

export const blockSchema = z.object({
  blockedId: z.string().cuid(),
  connectionId: z.string().cuid().optional(),
  reason: z.string().max(240).optional().or(z.literal("")),
});

export const reportSchema = z.object({
  reportedUserId: z.string().cuid(),
  connectionId: z.string().cuid().optional(),
  invitationId: z.string().cuid().optional(),
  reason: z.nativeEnum(ReportReason),
  details: z.string().max(500).optional().or(z.literal("")),
});

export const adminReportSchema = z.object({
  status: z.nativeEnum(ReportStatus),
  adminNotes: z.string().max(1000).optional().or(z.literal("")),
});
