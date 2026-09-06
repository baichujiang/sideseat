import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ProductFunnelEventName } from "@prisma/client";

import {
  productFunnelBatchSchema,
  serverProductFunnelEventNames,
  serverProductFunnelEventSchema,
} from "../../lib/validators/product-funnel";
import {
  businessFunnelEventKeys,
  deterministicBusinessEventClientId,
  experimentAttributionForEligibleAssignment,
} from "../../lib/v2/funnel-event-producer";
import {
  buildNotificationOutboxDedupeKey,
  notificationOutboxInputSchema,
  notificationOutboxSourceKeys,
} from "../../lib/v2/notification-outbox-producer";

const clientEvent = {
  clientEventId: "00000000-0000-4000-8000-000000000001",
  name: "OPPORTUNITY_IMPRESSION",
  surface: "DISCOVER_RECOMMENDED",
  sourceKind: "BUDDY_POST",
  sourceId: "post-1",
  occurredAt: "2026-08-30T18:00:00.000Z",
  metadata: {
    reasonCodes: ["MATCHES_INTEREST"],
    visibilityDurationMs: 500,
    appVersion: "2.0.0",
    buildNumber: "42",
  },
} as const;

const serverInterestEvent = {
  businessEventKey: businessFunnelEventKeys.actionInterested("activation-1"),
  actorId: "user-1",
  name: "ACTION_INTERESTED",
  surface: "ACTION_DETAIL",
  sourceKind: "BUDDY_POST",
  sourceId: "post-1",
  actionInterestId: "interest-1",
  interestActivationId: "activation-1",
  interestSurface: "ACTION_DETAIL",
  coordinationPolicy: "CREATOR_GATED_V2",
  policySchemaVersion: 1,
  experimentKey: "action_to_plan_creator_gated_v2",
  experimentVariant: "TREATMENT",
  occurredAt: new Date("2026-08-30T18:00:00.000Z"),
} as const;

test("client ingestion accepts only qualified impression and explicit open", () => {
  assert.equal(
    productFunnelBatchSchema.safeParse({ events: [clientEvent] }).success,
    true,
  );
  assert.equal(
    productFunnelBatchSchema.safeParse({
      events: [
        {
          ...clientEvent,
          name: "OPPORTUNITY_OPEN",
          metadata: { appVersion: "2.0.0", buildNumber: "42" },
        },
      ],
    }).success,
    true,
  );
  assert.equal(
    productFunnelBatchSchema.safeParse({
      events: [{ ...clientEvent, metadata: { reasonCodes: ["RECENT"] } }],
    }).success,
    false,
    "an impression without the 500ms visibility declaration is not qualified",
  );

  for (const name of Object.values(ProductFunnelEventName)) {
    const accepted = name === "OPPORTUNITY_IMPRESSION" || name === "OPPORTUNITY_OPEN";
    const candidate = {
      ...clientEvent,
      name,
      ...(name === "OPPORTUNITY_OPEN"
        ? { metadata: { appVersion: "2.0.0" } }
        : {}),
    };
    assert.equal(
      productFunnelBatchSchema.safeParse({ events: [candidate] }).success,
      accepted,
      name,
    );
  }
});

test("client and server privacy parsers reject copy, location, Calendar data, and arbitrary metadata", () => {
  for (const forbidden of [
    { body: "private body" },
    { title: "private event" },
    { location: "exact private address" },
    { privateCalendar: { title: "medical appointment" } },
    { freeText: "user supplied" },
  ]) {
    assert.equal(
      productFunnelBatchSchema.safeParse({
        events: [
          {
            ...clientEvent,
            metadata: { ...clientEvent.metadata, ...forbidden },
          },
        ],
      }).success,
      false,
    );
    assert.equal(
      serverProductFunnelEventSchema.safeParse({
        ...serverInterestEvent,
        ...forbidden,
      }).success,
      false,
    );
  }
  assert.equal(
    serverProductFunnelEventSchema.safeParse({
      ...serverInterestEvent,
      metadata: { reasonCodes: ["RECENT"] },
    }).success,
    false,
    "server events intentionally expose no generic metadata field",
  );
  assert.equal(
    productFunnelBatchSchema.safeParse({
      events: [{ ...clientEvent, sourceId: "an exact street address 12" }],
    }).success,
    false,
  );
});

test("server vocabulary is complete and event-specific attribution is enforced", () => {
  const contractual = [
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
  ];
  assert.deepEqual(
    [...serverProductFunnelEventNames].filter(
      (name) => name !== "CONVERSATION_OPENED",
    ),
    contractual,
  );
  assert.equal(
    serverProductFunnelEventSchema.safeParse(serverInterestEvent).success,
    true,
  );
  assert.equal(
    serverProductFunnelEventSchema.safeParse({
      ...serverInterestEvent,
      name: "ACTION_CONNECTED",
      businessEventKey: businessFunnelEventKeys.actionConnected("activation-1"),
      actionContextId: "context-1",
      firstContentType: undefined,
    }).success,
    false,
  );
  assert.equal(
    serverProductFunnelEventSchema.safeParse({
      ...serverInterestEvent,
      name: "ACTION_INTEREST_TERMINATED",
      businessEventKey:
        businessFunnelEventKeys.actionInterestTerminated("activation-1"),
      terminalReason: undefined,
    }).success,
    false,
  );
  assert.equal(
    serverProductFunnelEventSchema.safeParse({
      ...serverInterestEvent,
      name: "PLAN_SAFETY_TERMINATED",
      businessEventKey:
        businessFunnelEventKeys.planSafetyTerminated("commitment-1"),
      actionInterestId: undefined,
      interestSurface: undefined,
      planCommitmentId: undefined,
    }).success,
    false,
  );
});

test("all business transition key builders are stable, bounded, and fact-specific", () => {
  const keys = [
    businessFunnelEventKeys.actionInterested("activation-1"),
    businessFunnelEventKeys.actionInterestWithdrawn("activation-1"),
    businessFunnelEventKeys.actionResponseViewed("view-1"),
    businessFunnelEventKeys.actionResponseHidden("interest-1", 1),
    businessFunnelEventKeys.actionResponseRestored("interest-1", 2),
    businessFunnelEventKeys.coordinationReserved("context-1", 1),
    businessFunnelEventKeys.coordinationReleased("context-1", 1),
    businessFunnelEventKeys.actionConnected("activation-1"),
    businessFunnelEventKeys.firstHumanResponse("context-1"),
    businessFunnelEventKeys.coordinationEnded("context-1"),
    businessFunnelEventKeys.actionInterestTerminated("activation-1"),
    businessFunnelEventKeys.conversationOpened("connection-1"),
    businessFunnelEventKeys.planProposed("revision-1"),
    businessFunnelEventKeys.planAccepted("revision-1"),
    businessFunnelEventKeys.planCountered("revision-2"),
    businessFunnelEventKeys.planDeclined("revision-2"),
    businessFunnelEventKeys.planWithdrawn("revision-3"),
    businessFunnelEventKeys.planExpired("revision-4"),
    businessFunnelEventKeys.planRescheduleProposed("revision-5"),
    businessFunnelEventKeys.planRescheduleAccepted("revision-5"),
    businessFunnelEventKeys.planCanceled("commitment-1"),
    businessFunnelEventKeys.planSafetyTerminated("commitment-2"),
    businessFunnelEventKeys.outcomeRecorded("commitment-1", "user-1"),
  ];
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.every((key) => key.length <= 191));
  assert.equal(
    businessFunnelEventKeys.planAccepted("revision-1"),
    businessFunnelEventKeys.planAccepted("revision-1"),
  );
  assert.notEqual(
    businessFunnelEventKeys.coordinationReserved("context-1", 1),
    businessFunnelEventKeys.coordinationReserved("context-1", 2),
  );
  assert.throws(
    () => businessFunnelEventKeys.actionResponseHidden("interest-1", 0),
    /positive safe integer/,
  );
  assert.throws(
    () => businessFunnelEventKeys.planAccepted("contains:free:text"),
    /stable business-key segment/,
  );
  assert.throws(
    () => businessFunnelEventKeys.planAccepted("x".repeat(129)),
    /stable business-key segment/,
  );

  const clientId = deterministicBusinessEventClientId(keys[0]);
  assert.match(
    clientId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.equal(clientId, deterministicBusinessEventClientId(keys[0]));
  assert.notEqual(clientId, deterministicBusinessEventClientId(keys[1]));
});

test("only eligible assignments may provide fallback experiment attribution", () => {
  assert.deepEqual(
    experimentAttributionForEligibleAssignment(
      "action_to_plan_creator_gated_v2",
      { eligible: false, variant: "CONTROL" },
    ),
    {},
  );
  assert.deepEqual(
    experimentAttributionForEligibleAssignment(
      "action_to_plan_creator_gated_v2",
      { eligible: true, variant: "TREATMENT" },
    ),
    {
      experimentKey: "action_to_plan_creator_gated_v2",
      experimentVariant: "TREATMENT",
    },
  );
});

test("outbox accepts only typed ID destinations and deterministic source identities", () => {
  const interestEventKey = businessFunnelEventKeys.actionInterested("activation-1");
  const actionInput = notificationOutboxInputSchema.parse({
    kind: "ACTION_INTERESTED",
    recipientId: "creator-1",
    sourceKey: notificationOutboxSourceKeys.forBusinessEvent(interestEventKey),
    destination: {
      type: "ACTION_RESPONSES",
      actionId: "post-1",
      interestId: "interest-1",
    },
    availableAt: new Date("2026-08-30T18:00:00.000Z"),
  });
  const reminderInput = notificationOutboxInputSchema.parse({
    kind: "ACTION_RESPONSE_REMINDER",
    recipientId: "creator-1",
    sourceKey: notificationOutboxSourceKeys.actionResponseReminder(
      "post-1",
      "creator-1",
      1,
    ),
    destination: { type: "ACTION_RESPONSES", actionId: "post-1" },
    availableAt: new Date("2026-08-31T18:00:00.000Z"),
  });
  const contextInput = notificationOutboxInputSchema.parse({
    kind: "ACTION_CONNECTED",
    recipientId: "interested-1",
    sourceKey: notificationOutboxSourceKeys.forBusinessEvent(
      businessFunnelEventKeys.actionConnected("activation-1"),
    ),
    destination: {
      type: "ACTION_CONTEXT",
      connectionId: "connection-1",
      contextId: "context-1",
    },
    availableAt: new Date("2026-08-30T18:00:00.000Z"),
  });
  const planInput = notificationOutboxInputSchema.parse({
    kind: "PLAN_PROPOSED",
    recipientId: "receiver-1",
    sourceKey: notificationOutboxSourceKeys.forBusinessEvent(
      businessFunnelEventKeys.planProposed("revision-1"),
    ),
    destination: {
      type: "PLAN",
      connectionId: "connection-1",
      commitmentId: "commitment-1",
      revisionId: "revision-1",
    },
    availableAt: new Date("2026-08-30T18:00:00.000Z"),
  });
  const safetyInput = notificationOutboxInputSchema.parse({
    kind: "PLAN_SAFETY_ENDED",
    recipientId: "counterpart-1",
    sourceKey: notificationOutboxSourceKeys.planSafetyBatch("batch-1"),
    destination: {
      type: "PLAN_SAFETY_ENDED",
      notificationBatchId: "batch-1",
    },
    availableAt: new Date("2026-08-30T18:00:00.000Z"),
  });
  assert.ok(actionInput && reminderInput && contextInput && planInput && safetyInput);

  const dedupeKey = buildNotificationOutboxDedupeKey(actionInput);
  assert.equal(dedupeKey, buildNotificationOutboxDedupeKey(actionInput));
  assert.ok(dedupeKey.length <= 191);
  assert.equal(dedupeKey.includes("creator-1"), false);
  assert.equal(dedupeKey.includes("interest-1"), false);

  assert.equal(
    notificationOutboxInputSchema.safeParse({
      ...actionInput,
      destination: {
        type: "ACTION_RESPONSES",
        actionId: "post-1",
        title: "private post title",
      },
    }).success,
    false,
  );
  assert.equal(
    notificationOutboxInputSchema.safeParse({
      ...actionInput,
      kind: "PLAN_PROPOSED",
    }).success,
    false,
  );
  assert.equal(
    notificationOutboxInputSchema.safeParse({
      ...safetyInput,
      destination: {
        ...safetyInput.destination,
        blockerId: "secret-actor",
      },
    }).success,
    false,
  );
  assert.equal(
    notificationOutboxInputSchema.safeParse({
      ...safetyInput,
      sourceKey: notificationOutboxSourceKeys.forBusinessEvent(
        businessFunnelEventKeys.planSafetyTerminated("commitment-1"),
      ),
    }).success,
    false,
  );
  for (const extra of [
    { title: "private title" },
    { body: "message body" },
    { location: "exact location" },
    { calendar: { title: "private event" } },
    { payload: { copy: "free text" } },
  ]) {
    assert.equal(
      notificationOutboxInputSchema.safeParse({ ...actionInput, ...extra })
        .success,
      false,
    );
  }
});

test("the additive migration and Prisma enum contain every frozen server event", async () => {
  const [schema, migration] = await Promise.all([
    readFile(new URL("../../prisma/schema.prisma", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../../prisma/migrations/20260830232000_blight_analytics_event_enums/migration.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  for (const name of serverProductFunnelEventNames) {
    assert.match(schema, new RegExp(`\\b${name}\\b`), name);
    if (name !== "CONVERSATION_OPENED" && ![
      "ACTION_INTERESTED",
      "ACTION_INTEREST_WITHDRAWN",
      "PLAN_PROPOSED",
      "PLAN_ACCEPTED",
      "PLAN_COUNTERED",
      "PLAN_DECLINED",
      "PLAN_SAFETY_TERMINATED",
      "OUTCOME_RECORDED",
    ].includes(name)) {
      assert.match(migration, new RegExp(`'${name}'`), name);
    }
  }
  assert.doesNotMatch(migration, /\b(?:UPDATE|DELETE|DROP|CREATE\s+TABLE)\b/i);
});
