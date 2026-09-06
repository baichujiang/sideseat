import { createHash } from "node:crypto";

import type {
  ExperimentVariant,
  Prisma,
  ProductFunnelEvent,
} from "@prisma/client";

import {
  type BusinessEventKey,
  type ServerProductFunnelEvent,
  type ServerProductFunnelEventInput,
  productFunnelBusinessEventKeySchema,
  productFunnelSafeCodeSchema,
  serverProductFunnelEventSchema,
} from "@/lib/validators/product-funnel";

const keyPartPattern = /^[a-z0-9][a-z0-9._-]*$/i;

function keyPart(value: string | number, label: string): string {
  const normalized = String(value);
  if (
    normalized.length === 0 ||
    normalized.length > 128 ||
    !keyPartPattern.test(normalized)
  ) {
    throw new TypeError(`${label} is not a stable business-key segment.`);
  }
  return normalized;
}

function positiveVersion(value: number, label: string): string {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive safe integer.`);
  }
  return String(value);
}

function businessKey(...parts: readonly (string | number)[]): BusinessEventKey {
  return productFunnelBusinessEventKeySchema.parse(
    parts.map((part, index) => keyPart(part, `key part ${index + 1}`)).join(":"),
  );
}

/**
 * The only supported constructors for server business-event identities. Keys
 * describe a stable business fact, never a request UUID or a random attempt.
 */
export const businessFunnelEventKeys = Object.freeze({
  actionInterested: (activationId: string) =>
    businessKey("interest-activation", activationId, "created"),
  actionInterestWithdrawn: (activationId: string) =>
    businessKey("interest-activation", activationId, "withdrawn"),
  actionResponseViewed: (viewReceiptId: string) =>
    businessKey("action-response-view", viewReceiptId, "created"),
  actionResponseHidden: (interestId: string, presentationVersion: number) =>
    businessKey(
      "interest",
      interestId,
      "presentation",
      positiveVersion(presentationVersion, "presentationVersion"),
      "hidden",
    ),
  actionResponseRestored: (interestId: string, presentationVersion: number) =>
    businessKey(
      "interest",
      interestId,
      "presentation",
      positiveVersion(presentationVersion, "presentationVersion"),
      "visible",
    ),
  coordinationReserved: (contextId: string, generation: number) =>
    businessKey(
      "coordination",
      contextId,
      "reserved",
      positiveVersion(generation, "reservation generation"),
    ),
  coordinationReleased: (contextId: string, generation: number) =>
    businessKey(
      "coordination",
      contextId,
      "released",
      positiveVersion(generation, "reservation generation"),
    ),
  actionConnected: (activationId: string) =>
    businessKey("interest-activation", activationId, "connected"),
  firstHumanResponse: (contextId: string) =>
    businessKey("coordination", contextId, "first-counterpart-response"),
  coordinationEnded: (contextId: string) =>
    businessKey("coordination", contextId, "ended"),
  actionInterestTerminated: (activationId: string) =>
    businessKey("interest-activation", activationId, "terminal"),
  conversationOpened: (connectionId: string) =>
    businessKey("connection", connectionId, "opened"),
  planProposed: (revisionId: string) =>
    businessKey("plan-revision", revisionId, "proposed"),
  planAccepted: (revisionId: string) =>
    businessKey("plan-revision", revisionId, "accepted"),
  planCountered: (revisionId: string) =>
    businessKey("plan-revision", revisionId, "countered"),
  planDeclined: (revisionId: string) =>
    businessKey("plan-revision", revisionId, "declined"),
  planWithdrawn: (revisionId: string) =>
    businessKey("plan-revision", revisionId, "withdrawn"),
  planExpired: (revisionId: string) =>
    businessKey("plan-revision", revisionId, "expired"),
  planRescheduleProposed: (revisionId: string) =>
    businessKey("plan-revision", revisionId, "reschedule-proposed"),
  planRescheduleAccepted: (revisionId: string) =>
    businessKey("plan-revision", revisionId, "reschedule-accepted"),
  planCanceled: (commitmentId: string) =>
    businessKey("plan-commitment", commitmentId, "canceled"),
  planSafetyTerminated: (commitmentId: string) =>
    businessKey("plan-commitment", commitmentId, "safety-terminated"),
  outcomeRecorded: (commitmentId: string, participantId: string) =>
    businessKey(
      "plan-commitment",
      commitmentId,
      "outcome",
      participantId,
    ),

  // DIRECT_CONVERSATION_V1 rows may have an OPEN compatibility Context whose
  // currentActivationId is null, but they never acquire an Activation or infer
  // first-content/Connect facts. These builders preserve their legacy event
  // semantics while making every emitted transition deterministic and retry-safe.
  directTransitionInterested: (interestId: string, generation: number) =>
    businessKey(
      "direct-transition-v2",
      interestId,
      "generation",
      positiveVersion(generation, "DIRECT interest generation"),
      "interested",
    ),
  directTransitionWithdrawn: (interestId: string, generation: number) =>
    businessKey(
      "direct-transition-v2",
      interestId,
      "generation",
      positiveVersion(generation, "DIRECT withdrawal generation"),
      "withdrawn",
    ),
  legacyPlanOutcomeRecorded: (planRequestId: string, participantId: string) =>
    businessKey("plan-request", planRequestId, "outcome", participantId),
});

export function deterministicBusinessEventClientId(
  key: BusinessEventKey,
): string {
  const bytes = Buffer.from(
    createHash("sha256")
      .update("sideseat:product-funnel-event:v1:", "utf8")
      .update(key, "utf8")
      .digest()
      .subarray(0, 16),
  );
  // RFC 4122 variant with a deterministic version-5-shaped UUID. The business
  // key remains the authoritative dedupe identity; this UUID only satisfies the
  // legacy non-null clientEventId column without introducing random attempts.
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class BusinessFunnelEventConflictError extends Error {
  readonly code = "BUSINESS_EVENT_KEY_CONFLICT" as const;

  constructor(readonly businessEventKey: BusinessEventKey) {
    super(`Business event key ${businessEventKey} already identifies another fact.`);
    this.name = "BusinessFunnelEventConflictError";
  }
}

export function experimentAttributionForEligibleAssignment(
  experimentKey: string,
  assignment:
    | Readonly<{ eligible: boolean; variant: ExperimentVariant }>
    | null
    | undefined,
): Readonly<{
  experimentKey?: string;
  experimentVariant?: ExperimentVariant;
}> {
  if (assignment?.eligible !== true) return {};
  return {
    experimentKey: productFunnelSafeCodeSchema.parse(experimentKey),
    experimentVariant: assignment.variant,
  };
}

function expectedDatabaseValue<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

function hasSameBusinessIdentity(
  row: ProductFunnelEvent,
  event: ServerProductFunnelEvent,
): boolean {
  return (
    row.businessEventKey === event.businessEventKey &&
    row.clientEventId === deterministicBusinessEventClientId(event.businessEventKey) &&
    row.actorId === event.actorId &&
    row.name === event.name &&
    row.surface === event.surface &&
    row.sourceKind === expectedDatabaseValue(event.sourceKind) &&
    row.sourceId === expectedDatabaseValue(event.sourceId) &&
    row.connectionId === expectedDatabaseValue(event.connectionId) &&
    row.planRequestId === expectedDatabaseValue(event.planRequestId) &&
    row.actionInterestId === expectedDatabaseValue(event.actionInterestId) &&
    row.interestActivationId ===
      expectedDatabaseValue(event.interestActivationId) &&
    row.actionContextId === expectedDatabaseValue(event.actionContextId) &&
    row.planCommitmentId === expectedDatabaseValue(event.planCommitmentId) &&
    row.planRevisionId === expectedDatabaseValue(event.planRevisionId) &&
    row.interestSurface === expectedDatabaseValue(event.interestSurface) &&
    row.firstContentType === expectedDatabaseValue(event.firstContentType) &&
    row.terminalReason === expectedDatabaseValue(event.terminalReason) &&
    row.coordinationPolicy ===
      expectedDatabaseValue(event.coordinationPolicy) &&
    row.policySchemaVersion ===
      expectedDatabaseValue(event.policySchemaVersion) &&
    row.experimentKey === expectedDatabaseValue(event.experimentKey) &&
    row.experimentVariant ===
      expectedDatabaseValue(event.experimentVariant) &&
    row.metadata === null
  );
}

export type RecordedBusinessFunnelEvent = Readonly<{
  created: boolean;
  event: ProductFunnelEvent;
}>;

/**
 * Persist one server-owned event in the caller's domain transaction. The first
 * writer owns occurredAt; a retry with the same business fact is a no-op even if
 * its local clock is sampled again. Reusing the key for another fact aborts the
 * surrounding transaction.
 */
export async function recordServerFunnelEvent(
  tx: Prisma.TransactionClient & { readonly $transaction?: never },
  input: ServerProductFunnelEventInput,
): Promise<RecordedBusinessFunnelEvent> {
  const event = serverProductFunnelEventSchema.parse(input);
  const clientEventId = deterministicBusinessEventClientId(
    event.businessEventKey,
  );
  const inserted = await tx.productFunnelEvent.createMany({
    data: [
      {
        clientEventId,
        businessEventKey: event.businessEventKey,
        actorId: event.actorId,
        name: event.name,
        surface: event.surface,
        sourceKind: event.sourceKind,
        sourceId: event.sourceId,
        connectionId: event.connectionId,
        planRequestId: event.planRequestId,
        actionInterestId: event.actionInterestId,
        interestActivationId: event.interestActivationId,
        actionContextId: event.actionContextId,
        planCommitmentId: event.planCommitmentId,
        planRevisionId: event.planRevisionId,
        interestSurface: event.interestSurface,
        firstContentType: event.firstContentType,
        terminalReason: event.terminalReason,
        coordinationPolicy: event.coordinationPolicy,
        policySchemaVersion: event.policySchemaVersion,
        experimentKey: event.experimentKey,
        experimentVariant: event.experimentVariant,
        occurredAt: event.occurredAt,
      },
    ],
    skipDuplicates: true,
  });
  const persisted = await tx.productFunnelEvent.findUnique({
    where: { businessEventKey: event.businessEventKey },
  });
  if (!persisted) {
    throw new Error("Business funnel event disappeared after its insert attempt.");
  }
  if (!hasSameBusinessIdentity(persisted, event)) {
    throw new BusinessFunnelEventConflictError(event.businessEventKey);
  }
  return { created: inserted.count === 1, event: persisted };
}
