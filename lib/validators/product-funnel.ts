import {
  ActionCoordinationPolicy,
  ActionFirstContentType,
  ActionInterestSurface,
  ActionInterestTerminalReason,
  ExperimentVariant,
  ProductFunnelEventName,
  ProductFunnelSourceKind,
  ProductFunnelSurface,
} from "@prisma/client";
import { z } from "zod";

export const productFunnelSafeCodeSchema = z
  .string()
  .regex(/^[a-z0-9_.:-]{1,64}$/i);

export const productFunnelIdentifierSchema = z
  .string()
  .min(1)
  .max(191)
  .regex(/^[a-z0-9][a-z0-9._-]*$/i);

export const productFunnelBusinessEventKeySchema = z
  .string()
  .min(3)
  .max(191)
  .regex(/^[a-z0-9][a-z0-9._:-]*$/i)
  .brand<"BusinessEventKey">();

export const serverProductFunnelEventNames = [
  "ACTION_INTERESTED",
  "ACTION_INTEREST_WITHDRAWN",
  "ACTION_RESPONSE_VIEWED",
  "ACTION_RESPONSE_HIDDEN",
  "ACTION_RESPONSE_RESTORED",
  "COORDINATION_RESERVED",
  "COORDINATION_RELEASED",
  "ACTION_CONNECTED",
  "FIRST_HUMAN_RESPONSE",
  "COORDINATION_ENDED",
  "ACTION_INTEREST_TERMINATED",
  "CONVERSATION_OPENED",
  "PLAN_PROPOSED",
  "PLAN_ACCEPTED",
  "PLAN_COUNTERED",
  "PLAN_DECLINED",
  "PLAN_WITHDRAWN",
  "PLAN_EXPIRED",
  "PLAN_RESCHEDULE_PROPOSED",
  "PLAN_RESCHEDULE_ACCEPTED",
  "PLAN_CANCELED",
  "PLAN_SAFETY_TERMINATED",
  "OUTCOME_RECORDED",
] as const satisfies readonly ProductFunnelEventName[];

// Only visibility telemetry is client-authoritative. Every state transition,
// including Plan safety termination, is written by the owning server command.
export const clientProductFunnelEventNameSchema = z.enum([
  "OPPORTUNITY_IMPRESSION",
  "OPPORTUNITY_OPEN",
]);

export const productFunnelMetadataSchema = z
  .object({
    reasonCodes: z.array(productFunnelSafeCodeSchema).max(8).optional(),
    position: z.number().int().min(0).max(1_000).optional(),
    visibilityDurationMs: z.number().int().min(500).max(60_000).optional(),
    appVersion: productFunnelSafeCodeSchema.optional(),
    buildNumber: productFunnelSafeCodeSchema.optional(),
  })
  .strict();

export const productFunnelEventSchema = z
  .object({
    clientEventId: z.string().uuid(),
    name: clientProductFunnelEventNameSchema,
    surface: z.nativeEnum(ProductFunnelSurface),
    sourceKind: z.nativeEnum(ProductFunnelSourceKind).optional(),
    sourceId: productFunnelIdentifierSchema.max(128).optional(),
    occurredAt: z.string().datetime({ offset: true }),
    metadata: productFunnelMetadataSchema.optional(),
  })
  .strict()
  .superRefine((event, context) => {
    if (
      event.name === "OPPORTUNITY_IMPRESSION" &&
      event.metadata?.visibilityDurationMs === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Qualified impressions require a visibility duration.",
        path: ["metadata", "visibilityDurationMs"],
      });
    }
  });

export const productFunnelBatchSchema = z
  .object({ events: z.array(productFunnelEventSchema).min(1).max(50) })
  .strict();

const serverProductFunnelEventBaseSchema = z
  .object({
    businessEventKey: productFunnelBusinessEventKeySchema,
    actorId: productFunnelIdentifierSchema,
    name: z.enum(serverProductFunnelEventNames),
    surface: z.nativeEnum(ProductFunnelSurface),
    sourceKind: z.nativeEnum(ProductFunnelSourceKind).optional(),
    sourceId: productFunnelIdentifierSchema.optional(),
    connectionId: productFunnelIdentifierSchema.optional(),
    planRequestId: productFunnelIdentifierSchema.optional(),
    actionInterestId: productFunnelIdentifierSchema.optional(),
    interestActivationId: productFunnelIdentifierSchema.optional(),
    actionContextId: productFunnelIdentifierSchema.optional(),
    planCommitmentId: productFunnelIdentifierSchema.optional(),
    planRevisionId: productFunnelIdentifierSchema.optional(),
    interestSurface: z.nativeEnum(ActionInterestSurface).optional(),
    firstContentType: z.nativeEnum(ActionFirstContentType).optional(),
    terminalReason: z.nativeEnum(ActionInterestTerminalReason).optional(),
    coordinationPolicy: z.nativeEnum(ActionCoordinationPolicy).optional(),
    policySchemaVersion: z.number().int().min(1).max(1_000).optional(),
    experimentKey: productFunnelSafeCodeSchema.optional(),
    experimentVariant: z.nativeEnum(ExperimentVariant).optional(),
    occurredAt: z.date(),
  })
  .strict();

const interestEvents = new Set<ProductFunnelEventName>([
  "ACTION_INTERESTED",
  "ACTION_INTEREST_WITHDRAWN",
  "ACTION_RESPONSE_VIEWED",
  "ACTION_RESPONSE_HIDDEN",
  "ACTION_RESPONSE_RESTORED",
]);

const contextEvents = new Set<ProductFunnelEventName>([
  "COORDINATION_RESERVED",
  "COORDINATION_RELEASED",
  "ACTION_CONNECTED",
  "FIRST_HUMAN_RESPONSE",
  "COORDINATION_ENDED",
]);

const revisionEvents = new Set<ProductFunnelEventName>([
  "PLAN_PROPOSED",
  "PLAN_ACCEPTED",
  "PLAN_COUNTERED",
  "PLAN_DECLINED",
  "PLAN_WITHDRAWN",
  "PLAN_EXPIRED",
  "PLAN_RESCHEDULE_PROPOSED",
  "PLAN_RESCHEDULE_ACCEPTED",
]);

function requireAttribution(
  value: string | undefined,
  path: string,
  context: z.RefinementCtx,
): void {
  if (value !== undefined) return;
  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: `${path} is required for this server-owned event.`,
    path: [path],
  });
}

/**
 * Runtime privacy boundary for server-owned funnel events. It intentionally has
 * no generic metadata field: business dimensions must be explicit, typed
 * columns rather than user-controlled JSON or copy.
 */
export const serverProductFunnelEventSchema =
  serverProductFunnelEventBaseSchema.superRefine((event, context) => {
    if (interestEvents.has(event.name)) {
      requireAttribution(event.actionInterestId, "actionInterestId", context);
    }
    if (event.name === "ACTION_INTERESTED" && !event.interestSurface) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "interestSurface is required for an Interest event.",
        path: ["interestSurface"],
      });
    }
    if (contextEvents.has(event.name)) {
      requireAttribution(event.actionContextId, "actionContextId", context);
    }
    if (event.name === "ACTION_CONNECTED") {
      requireAttribution(
        event.interestActivationId,
        "interestActivationId",
        context,
      );
      if (!event.firstContentType) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "firstContentType is required for Connect.",
          path: ["firstContentType"],
        });
      }
    }
    if (event.name === "ACTION_INTEREST_TERMINATED") {
      requireAttribution(
        event.interestActivationId,
        "interestActivationId",
        context,
      );
      if (!event.terminalReason) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "terminalReason is required for a terminal activation.",
          path: ["terminalReason"],
        });
      }
    }
    if (event.name === "CONVERSATION_OPENED") {
      requireAttribution(event.connectionId, "connectionId", context);
    }
    if (
      revisionEvents.has(event.name) &&
      !event.planRevisionId &&
      !event.planRequestId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A stable Plan revision identifier is required.",
        path: ["planRevisionId"],
      });
    }
    if (
      (event.name === "PLAN_CANCELED" ||
        event.name === "PLAN_SAFETY_TERMINATED") &&
      !event.planCommitmentId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "planCommitmentId is required for commitment termination.",
        path: ["planCommitmentId"],
      });
    }
    if (
      event.name === "OUTCOME_RECORDED" &&
      !event.planCommitmentId &&
      !event.planRequestId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A stable Plan identifier is required for an outcome.",
        path: ["planCommitmentId"],
      });
    }
  });

export type BusinessEventKey = z.infer<
  typeof productFunnelBusinessEventKeySchema
>;
export type ServerProductFunnelEventInput = z.input<
  typeof serverProductFunnelEventSchema
>;
export type ServerProductFunnelEvent = z.output<
  typeof serverProductFunnelEventSchema
>;
