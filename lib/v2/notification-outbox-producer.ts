import { createHash } from "node:crypto";

import type { NotificationOutbox, Prisma } from "@prisma/client";
import { z } from "zod";

import {
  type BusinessEventKey,
  productFunnelIdentifierSchema,
} from "@/lib/validators/product-funnel";

export const notificationOutboxKinds = [
  "ACTION_INTERESTED",
  "ACTION_RESPONSE_REMINDER",
  "ACTION_CONNECTED",
  "COORDINATION_ENDED",
  "PLAN_PROPOSED",
  "PLAN_ACCEPTED",
  "PLAN_COUNTERED",
  "PLAN_DECLINED",
  "PLAN_WITHDRAWN",
  "PLAN_EXPIRED",
  "PLAN_RESCHEDULE_PROPOSED",
  "PLAN_RESCHEDULE_ACCEPTED",
  "PLAN_CANCELED",
  "PLAN_SAFETY_ENDED",
] as const;

export type NotificationOutboxKind = (typeof notificationOutboxKinds)[number];

const notificationOutboxSourceKeySchema = z
  .string()
  .min(3)
  .max(256)
  .regex(/^[a-z0-9][a-z0-9._:-]*$/i)
  .brand<"NotificationOutboxSourceKey">();

export type NotificationOutboxSourceKey = z.infer<
  typeof notificationOutboxSourceKeySchema
>;

const actionResponsesDestinationSchema = z
  .object({
    type: z.literal("ACTION_RESPONSES"),
    actionId: productFunnelIdentifierSchema,
    interestId: productFunnelIdentifierSchema.optional(),
  })
  .strict();

const actionContextDestinationSchema = z
  .object({
    type: z.literal("ACTION_CONTEXT"),
    connectionId: productFunnelIdentifierSchema,
    contextId: productFunnelIdentifierSchema,
  })
  .strict();

const planDestinationSchema = z
  .object({
    type: z.literal("PLAN"),
    connectionId: productFunnelIdentifierSchema,
    commitmentId: productFunnelIdentifierSchema,
    revisionId: productFunnelIdentifierSchema.optional(),
  })
  .strict();

const planSafetyEndedDestinationSchema = z
  .object({
    type: z.literal("PLAN_SAFETY_ENDED"),
    notificationBatchId: productFunnelIdentifierSchema,
  })
  .strict();

export const notificationOutboxDestinationSchema = z.discriminatedUnion(
  "type",
  [
    actionResponsesDestinationSchema,
    actionContextDestinationSchema,
    planDestinationSchema,
    planSafetyEndedDestinationSchema,
  ],
);

const actionResponseKinds = new Set<NotificationOutboxKind>([
  "ACTION_INTERESTED",
  "ACTION_RESPONSE_REMINDER",
]);
const actionContextKinds = new Set<NotificationOutboxKind>([
  "ACTION_CONNECTED",
  "COORDINATION_ENDED",
]);
const planKinds = new Set<NotificationOutboxKind>([
  "PLAN_PROPOSED",
  "PLAN_ACCEPTED",
  "PLAN_COUNTERED",
  "PLAN_DECLINED",
  "PLAN_WITHDRAWN",
  "PLAN_EXPIRED",
  "PLAN_RESCHEDULE_PROPOSED",
  "PLAN_RESCHEDULE_ACCEPTED",
  "PLAN_CANCELED",
]);

export const notificationOutboxInputSchema = z
  .object({
    kind: z.enum(notificationOutboxKinds),
    recipientId: productFunnelIdentifierSchema,
    sourceKey: notificationOutboxSourceKeySchema,
    destination: notificationOutboxDestinationSchema,
    availableAt: z.date(),
  })
  .strict()
  .superRefine((input, context) => {
    const destinationType = input.destination.type;
    const expectedType = actionResponseKinds.has(input.kind)
      ? "ACTION_RESPONSES"
      : actionContextKinds.has(input.kind)
        ? "ACTION_CONTEXT"
        : planKinds.has(input.kind)
          ? "PLAN"
          : "PLAN_SAFETY_ENDED";
    if (destinationType !== expectedType) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${input.kind} requires a ${expectedType} destination.`,
        path: ["destination", "type"],
      });
    }

    if (input.kind === "ACTION_RESPONSE_REMINDER") {
      if (destinationType === "ACTION_RESPONSES") {
        const prefix = `action:${input.destination.actionId}:creator:${input.recipientId}:response-reminder:`;
        if (!input.sourceKey.startsWith(prefix)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Reminder sourceKey must be stable per Action, creator, and version.",
            path: ["sourceKey"],
          });
        }
      }
    } else if (input.kind === "PLAN_SAFETY_ENDED") {
      if (destinationType === "PLAN_SAFETY_ENDED") {
        const expected = `notification-batch:${input.destination.notificationBatchId}:plan-safety-ended`;
        if (input.sourceKey !== expected) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Safety notification sourceKey must use only its aggregate batch identity.",
            path: ["sourceKey"],
          });
        }
      }
    } else if (!input.sourceKey.startsWith("business-event:")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Domain notifications require a deterministic business event key.",
        path: ["sourceKey"],
      });
    }
  });

export type NotificationOutboxInput = z.input<
  typeof notificationOutboxInputSchema
>;
type ParsedNotificationOutboxInput = z.output<
  typeof notificationOutboxInputSchema
>;

function positiveVersion(value: number): string {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError("Reminder version must be a positive safe integer.");
  }
  return String(value);
}

export const notificationOutboxSourceKeys = Object.freeze({
  forBusinessEvent: (eventKey: BusinessEventKey) =>
    notificationOutboxSourceKeySchema.parse(`business-event:${eventKey}`),
  actionResponseReminder: (
    actionId: string,
    creatorId: string,
    reminderVersion: number,
  ) => {
    const action = productFunnelIdentifierSchema.parse(actionId);
    const creator = productFunnelIdentifierSchema.parse(creatorId);
    return notificationOutboxSourceKeySchema.parse(
      `action:${action}:creator:${creator}:response-reminder:${positiveVersion(reminderVersion)}`,
    );
  },
  planSafetyBatch: (notificationBatchId: string) => {
    const batch = productFunnelIdentifierSchema.parse(notificationBatchId);
    return notificationOutboxSourceKeySchema.parse(
      `notification-batch:${batch}:plan-safety-ended`,
    );
  },
});

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

export function buildNotificationOutboxDedupeKey(
  input: Pick<
    ParsedNotificationOutboxInput,
    "kind" | "recipientId" | "sourceKey"
  >,
): string {
  const digest = createHash("sha256")
    .update(
      canonicalJson({
        version: 1,
        kind: input.kind,
        recipientId: input.recipientId,
        sourceKey: input.sourceKey,
      }),
      "utf8",
    )
    .digest("hex");
  return `b-light-notification:v1:${input.kind.toLowerCase()}:${digest}`;
}

export class NotificationOutboxConflictError extends Error {
  readonly code = "NOTIFICATION_OUTBOX_DEDUPE_CONFLICT" as const;

  constructor(readonly dedupeKey: string) {
    super(`Notification outbox key ${dedupeKey} already identifies another item.`);
    this.name = "NotificationOutboxConflictError";
  }
}

function hasSameOutboxIdentity(
  row: NotificationOutbox,
  input: ParsedNotificationOutboxInput,
): boolean {
  return (
    row.dedupeKey === buildNotificationOutboxDedupeKey(input) &&
    row.kind === input.kind &&
    row.recipientId === input.recipientId &&
    row.payloadVersion === 1 &&
    canonicalJson(row.destination) === canonicalJson(input.destination) &&
    canonicalJson(row.payload) === "{}"
  );
}

export type EnqueuedNotificationOutboxItem = Readonly<{
  created: boolean;
  item: NotificationOutbox;
}>;

/**
 * Enqueue inside the owning domain transaction. The producer accepts no copy,
 * title, body, location, route string, Calendar payload, or arbitrary JSON.
 * Delivery remains at-least-once and is implemented by the observed BL-OPS-01
 * worker; this function guarantees exactly-once queue creation only.
 */
export async function enqueueNotificationOutboxItem(
  tx: Prisma.TransactionClient & { readonly $transaction?: never },
  rawInput: NotificationOutboxInput,
): Promise<EnqueuedNotificationOutboxItem> {
  const input = notificationOutboxInputSchema.parse(rawInput);
  const dedupeKey = buildNotificationOutboxDedupeKey(input);
  const inserted = await tx.notificationOutbox.createMany({
    data: [
      {
        dedupeKey,
        kind: input.kind,
        recipientId: input.recipientId,
        destination: input.destination,
        payloadVersion: 1,
        payload: {},
        availableAt: input.availableAt,
      },
    ],
    skipDuplicates: true,
  });
  const persisted = await tx.notificationOutbox.findUnique({
    where: { dedupeKey },
  });
  if (!persisted) {
    throw new Error("Notification outbox item disappeared after its insert attempt.");
  }
  if (!hasSameOutboxIdentity(persisted, input)) {
    throw new NotificationOutboxConflictError(dedupeKey);
  }
  return { created: inserted.count === 1, item: persisted };
}
