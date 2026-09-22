import {
  PlanOutcomeValue,
  SocialGroupCandidateStatus,
  SocialIntentTopic,
} from "@prisma/client";
import { z } from "zod";

const isoDate = z.string().datetime({ offset: true });

export const socialGroupDraftSchema = z
  .object({
    topic: z.nativeEnum(SocialIntentTopic),
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional().or(z.literal("")),
    school: z.string().trim().min(1).max(80),
    city: z.string().trim().min(1).max(80),
    startAt: isoDate,
    endAt: isoDate,
    location: z.string().trim().max(120).optional().or(z.literal("")),
    responseDeadline: isoDate,
    minimumMembers: z.number().int().min(3).max(5).default(3),
    maximumMembers: z.number().int().min(3).max(5).default(5),
  })
  .strict()
  .superRefine((value, ctx) => {
    const start = new Date(value.startAt);
    const end = new Date(value.endAt);
    const deadline = new Date(value.responseDeadline);
    if (end <= start) {
      ctx.addIssue({ code: "custom", path: ["endAt"], message: "End must be after start." });
    }
    if (deadline >= start) {
      ctx.addIssue({
        code: "custom",
        path: ["responseDeadline"],
        message: "Responses must close before the group starts.",
      });
    }
    if (value.maximumMembers < value.minimumMembers) {
      ctx.addIssue({
        code: "custom",
        path: ["maximumMembers"],
        message: "Maximum members cannot be below the minimum.",
      });
    }
  });

export const socialGroupApproveSchema = z
  .object({ candidateUserIds: z.array(z.string().cuid()).min(3).max(5) })
  .strict();

export const socialGroupResponseSchema = z
  .object({
    status: z.enum([
      SocialGroupCandidateStatus.INTERESTED,
      SocialGroupCandidateStatus.DECLINED,
      SocialGroupCandidateStatus.WITHDRAWN,
    ]),
  })
  .strict();

export const socialGroupOutcomeSchema = z
  .object({ value: z.nativeEnum(PlanOutcomeValue) })
  .strict();

export type SocialGroupDraftInput = z.output<typeof socialGroupDraftSchema>;
