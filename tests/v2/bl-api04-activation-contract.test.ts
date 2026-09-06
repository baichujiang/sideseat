import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const openApiUrl = new URL("../../openapi/v1.json", import.meta.url);
const activationServiceUrl = new URL(
  "../../lib/v2/action-coordination/activation-service.ts",
  import.meta.url,
);
const directMessageServiceUrl = new URL(
  "../../lib/chat/direct-message-service.ts",
  import.meta.url,
);
const messagesRouteUrl = new URL(
  "../../app/api/v1/connections/[connectionId]/messages/route.ts",
  import.meta.url,
);
const inboxUnreadUrl = new URL(
  "../../lib/queries/inbox-unread-counts.ts",
  import.meta.url,
);

type Schema = {
  $ref?: string;
  type?: string | string[];
  const?: unknown;
  format?: string;
  minLength?: number;
  maxLength?: number;
  additionalProperties?: boolean;
  required?: string[];
  oneOf?: Schema[];
  discriminator?: {
    propertyName: string;
    mapping: Record<string, string>;
  };
  properties: Record<string, Schema>;
};

type Operation = {
  operationId: string;
  "x-sideseat-contract": string;
  "x-sideseat-stable-operation-id": string;
  parameters: Array<{ name: string; in: string; required?: boolean; schema: Schema }>;
  requestBody?: { content: { "application/json": { schema: Schema } } };
  responses: Record<string, { $ref?: string; content?: unknown }>;
};

type Spec = {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, Schema> };
};

test("BL-PLAN upgrades activation to a stable MESSAGE/PLAN union", async () => {
  const spec = JSON.parse(await readFile(openApiUrl, "utf8")) as Spec;
  const operation =
    spec.paths[
      "/api/v1/action-coordination/v2/reservations/{reservationId}/activate"
    ]?.post;
  assert.ok(operation);
  assert.equal(operation.operationId, "activateCreatorGatedActionCoordination");
  assert.equal(operation["x-sideseat-contract"], "b-light-v2");
  assert.equal(
    operation["x-sideseat-stable-operation-id"],
    operation.operationId,
  );
  assert.deepEqual(Object.keys(operation.responses).sort(), [
    "201",
    "400",
    "401",
    "403",
    "404",
    "409",
    "422",
    "426",
    "500",
  ]);
  for (const name of [
    "reservationId",
    "Idempotency-Key",
    "X-SideSeat-Platform",
    "X-SideSeat-App-Version",
    "X-SideSeat-Build",
    "X-SideSeat-Capabilities",
  ]) {
    assert.equal(operation.parameters.some((value) => value.name === name), true);
  }
  assert.equal(
    operation.requestBody?.content["application/json"].schema.$ref,
    "#/components/schemas/ActionCoordinationActivationRequest",
  );

  const schemas = spec.components.schemas;
  assert.equal(
    schemas.ActionCoordinationActivationRequest.properties.firstContent.$ref,
    "#/components/schemas/ActionCoordinationFirstContent",
  );
  assert.equal(schemas.ActionCoordinationFirstContent.oneOf?.length, 2);
  assert.equal(
    schemas.ActionCoordinationFirstContent.discriminator?.propertyName,
    "type",
  );
  const content = schemas.ActionCoordinationFirstMessageContent;
  assert.equal(content.additionalProperties, false);
  assert.equal(content.properties.type.const, "MESSAGE");
  assert.equal(content.properties.body.minLength, 1);
  assert.equal(content.properties.body.maxLength, 500);
  const planContent = schemas.ActionCoordinationFirstPlanContent;
  assert.equal(planContent.additionalProperties, false);
  assert.equal(planContent.properties.type.const, "PLAN");
  assert.deepEqual(planContent.required, [
    "type",
    "planType",
    "title",
    "startTime",
    "endTime",
  ]);
  assert.deepEqual(
    schemas.ActionCoordinationActivation.discriminator?.mapping,
    {
      MESSAGE:
        "#/components/schemas/ActionCoordinationMessageActivation",
      PLAN: "#/components/schemas/ActionCoordinationPlanActivation",
    },
  );
  assert.deepEqual(schemas.ActionCoordinationMessageActivation.required, [
    "connectionId",
    "contextId",
    "sourceCardMessageId",
    "firstMessageId",
    "firstContentType",
    "focus",
  ]);
  assert.equal(
    schemas.ActionCoordinationMessageActivation.properties.focus.$ref,
    "#/components/schemas/CreatorGatedActionContextFocus",
  );
  assert.deepEqual(schemas.ActionCoordinationPlanActivation.required, [
    "connectionId",
    "contextId",
    "sourceCardMessageId",
    "planCardMessageId",
    "commitmentId",
    "revisionId",
    "firstContentType",
    "focus",
  ]);
  assert.equal(
    schemas.ActionCoordinationPlanActivation.properties.focus.$ref,
    "#/components/schemas/CreatorGatedPlanFocus",
  );
});

test("BL-API-04 adds explicit optional Context input and nullable output", async () => {
  const spec = JSON.parse(await readFile(openApiUrl, "utf8")) as Spec;
  const directMessage = spec.components.schemas.DirectMessage;
  assert.deepEqual(directMessage.properties.actionContextId.type, ["string", "null"]);
  assert.equal(directMessage.required?.includes("actionContextId"), true);

  const variants = spec.components.schemas.DirectMessageRequest.oneOf ?? [];
  assert.equal(variants.length, 3);
  for (const variant of variants) {
    assert.equal(variant.properties.actionContextId.type, "string");
    assert.equal(variant.properties.actionContextId.minLength, 1);
    assert.equal(variant.properties.actionContextId.maxLength, 128);
    assert.equal(variant.required?.includes("actionContextId") ?? false, false);
  }
});

test("BL-PLAN keeps both activation branches atomic and generic messages unattributed", async () => {
  const [activation, messages, route, unread] = await Promise.all([
    readFile(activationServiceUrl, "utf8"),
    readFile(directMessageServiceUrl, "utf8"),
    readFile(messagesRouteUrl, "utf8"),
    readFile(inboxUnreadUrl, "utf8"),
  ]);
  assert.match(activation, /runAtomicActionCoordinationCommand/);
  assert.match(activation, /withCanonicalConnectionScope/);
  assert.match(activation, /ACTION_INTEREST_CARD/);
  assert.match(activation, /firstContentAt\s*=\s*new Date\(context\.now\.getTime\(\) \+ 1\)/);
  assert.match(activation, /state:\s*"OPEN"/);
  assert.match(activation, /firstContentType:\s*"MESSAGE"/);
  assert.match(activation, /firstContentType:\s*"PLAN"/);
  assert.match(activation, /createInitialActionPlanInTransaction/);
  assert.match(activation, /if \(firstContent\.type === "MESSAGE"\)/);
  assert.match(activation, /businessFunnelEventKeys\.actionConnected/);
  assert.match(activation, /enqueueNotificationOutboxItem/);
  assert.doesNotMatch(activation, /scheduleNewDirectChatMessageNotification/);

  assert.match(
    messages,
    /notIn:\s*\[MessageType\.SYSTEM, MessageType\.ACTION_INTEREST_CARD, MessageType\.MUTUAL_OPPORTUNITY_CARD\]/,
  );
  assert.match(route, /values\.actionContextId\s*\?/);
  assert.match(route, /pairSafetyLock/);
  assert.match(route, /lockFocusedDirectMessageActionContext/);
  assert.match(route, /recordFirstFocusedCounterpartResponse/);
  assert.match(unread, /m\."type" <> 'ACTION_INTEREST_CARD'/);
});
