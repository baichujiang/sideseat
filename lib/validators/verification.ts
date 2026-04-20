import { StudentVerificationStatus } from "@prisma/client";
import { z } from "zod";

export const verifyEmailRequestSchema = z.object({
  email: z.string().email().toLowerCase(),
});

export const adminVerificationDecisionSchema = z.object({
  status: z.enum([
    StudentVerificationStatus.VERIFIED,
    StudentVerificationStatus.REJECTED,
    StudentVerificationStatus.MANUAL_REVIEW_REQUIRED,
  ]),
  note: z.string().max(500).optional().or(z.literal("")),
});
