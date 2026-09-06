import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const openApiUrl = new URL("../../openapi/v1.json", import.meta.url);
const interestServiceUrl = new URL(
  "../../lib/v2/action-coordination/interest-service.ts",
  import.meta.url,
);

type ContractSchema = {
  $ref?: string;
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  oneOf?: ContractSchema[];
  discriminator?: { propertyName: string; mapping?: Record<string, string> };
  additionalProperties?: boolean;
  required?: string[];
  properties: Record<string, ContractSchema>;
  minLength?: number;
  maxLength?: number;
};

type ContractResponse = {
  $ref?: string;
  description?: string;
  headers?: Record<string, { schema: ContractSchema }>;
  content?: Record<string, { schema: ContractSchema }>;
};

type ContractOperation = {
  operationId: string;
  "x-sideseat-contract": string;
  "x-sideseat-stable-operation-id": string;
  responses: Record<string, ContractResponse>;
  parameters: Array<{ in: string; name: string; schema: ContractSchema }>;
};

type ContractSpec = {
  paths: Record<string, Record<string, ContractOperation>>;
  components: { schemas: Record<string, ContractSchema> };
};

test("BL-BE-07 creator-gated Interest operations have frozen explicit contracts", async () => {
  const spec = JSON.parse(await readFile(openApiUrl, "utf8")) as ContractSpec;
  const cases = [
    {
      path: "/api/v1/action-coordination/v2/actions/{actionId}/interest",
      method: "post",
      operationId: "createCreatorGatedActionInterest",
      statuses: ["200", "201", "400", "401", "403", "404", "409", "422", "426", "429", "500"],
    },
    {
      path: "/api/v1/action-coordination/v2/interests/{interestId}",
      method: "get",
      operationId: "getCreatorGatedActionInterest",
      statuses: ["200", "401", "403", "404", "422", "500"],
    },
    {
      path: "/api/v1/action-coordination/v2/interests/{interestId}",
      method: "delete",
      operationId: "withdrawCreatorGatedActionInterest",
      statuses: ["200", "401", "403", "404", "409", "422", "500"],
    },
    {
      path: "/api/v1/action-coordination/v2/interests/{interestId}/reactivate",
      method: "post",
      operationId: "reactivateCreatorGatedActionInterest",
      statuses: ["200", "201", "400", "401", "403", "404", "409", "422", "426", "429", "500"],
    },
    {
      path: "/api/v1/action-coordination/v2/me/interests",
      method: "get",
      operationId: "listMyCreatorGatedActionInterests",
      statuses: ["200", "401", "403", "422", "500"],
    },
  ] as const;

  for (const expected of cases) {
    const operation = spec.paths[expected.path]?.[expected.method];
    assert.ok(operation, `${expected.method.toUpperCase()} ${expected.path}`);
    assert.equal(operation.operationId, expected.operationId);
    assert.equal(operation["x-sideseat-contract"], "b-light-v2");
    assert.equal(operation["x-sideseat-stable-operation-id"], expected.operationId);
    assert.deepEqual(Object.keys(operation.responses).sort(), [...expected.statuses].sort());
    for (const response of Object.values(operation.responses)) {
      assert.ok(
        response.$ref || response.content?.["application/json"]?.schema,
        `${expected.operationId} must schema every response`,
      );
    }
  }
});

test("BL-BE-07 wire DTO is connection-free and My responses owns a real opaque cursor", async () => {
  const spec = JSON.parse(await readFile(openApiUrl, "utf8")) as ContractSpec;
  const interest = spec.components.schemas.CreatorGatedActionInterest;
  const envelope = spec.components.schemas.CreatorGatedInterestEnvelope;
  const listEnvelope = spec.components.schemas.CreatorGatedMyInterestsEnvelope;

  assert.equal(envelope.additionalProperties, false);
  assert.deepEqual(envelope.required, ["interest"]);
  assert.equal(
    envelope.properties.interest.$ref,
    "#/components/schemas/CreatorGatedActionInterest",
  );
  assert.equal(interest.additionalProperties, false);
  assert.equal("connectionId" in interest.properties, false);
  assert.equal("messageId" in interest.properties, false);
  assert.deepEqual(interest.properties.interestState.enum, ["ACTIVE", "WITHDRAWN"]);
  assert.deepEqual(interest.properties.coordinationState.enum, [
    "WAITING",
    "INITIATING",
    "OPEN",
    "ENDED",
    "UNAVAILABLE",
  ]);
  assert.equal(interest.properties.coordinationPolicy.const, "CREATOR_GATED_V2");
  assert.equal(interest.properties.policySchemaVersion.const, 1);

  assert.deepEqual(listEnvelope.properties.nextCursor.type, ["string", "null"]);
  const list = spec.paths["/api/v1/action-coordination/v2/me/interests"].get;
  const cursor = list.parameters.find(
    (parameter) => parameter.in === "query" && parameter.name === "cursor",
  );
  assert.ok(cursor);
  assert.equal(cursor.schema.minLength, 1);
  assert.equal(cursor.schema.maxLength, 1024);
  assert.ok(list.responses["200"].description);
  assert.match(list.responses["200"].description, /latest activation/i);
});

test("BL-BE-07 redacts safety tombstones, freezes exact focus, and declares bounded retries", async () => {
  const spec = JSON.parse(await readFile(openApiUrl, "utf8")) as ContractSpec;
  const schemas = spec.components.schemas;
  const interest = schemas.CreatorGatedActionInterest;

  assert.deepEqual(schemas.CreatorGatedInterestContext.oneOf?.map((schema) => schema.$ref), [
    "#/components/schemas/CreatorGatedLiveInterestContext",
    "#/components/schemas/CreatorGatedTombstoneInterestContext",
  ]);
  assert.equal(schemas.CreatorGatedInterestContext.discriminator?.propertyName, "kind");
  assert.deepEqual(schemas.CreatorGatedInterestContext.discriminator?.mapping, {
    LIVE: "#/components/schemas/CreatorGatedLiveInterestContext",
    TOMBSTONE: "#/components/schemas/CreatorGatedTombstoneInterestContext",
  });
  assert.deepEqual(
    Object.keys(schemas.CreatorGatedTombstoneInterestContext.properties),
    ["kind"],
  );
  assert.equal(schemas.CreatorGatedTombstoneInterestContext.additionalProperties, false);
  assert.deepEqual(schemas.CreatorGatedPlanDraft.oneOf?.map((schema) => schema.$ref), [
    "#/components/schemas/CreatorGatedLivePlanDraft",
    "#/components/schemas/CreatorGatedTombstonePlanDraft",
  ]);
  assert.equal(schemas.CreatorGatedPlanDraft.discriminator?.propertyName, "kind");
  assert.deepEqual(schemas.CreatorGatedPlanDraft.discriminator?.mapping, {
    LIVE: "#/components/schemas/CreatorGatedLivePlanDraft",
    TOMBSTONE: "#/components/schemas/CreatorGatedTombstonePlanDraft",
  });
  assert.deepEqual(Object.keys(schemas.CreatorGatedTombstonePlanDraft.properties), ["kind"]);
  assert.equal(schemas.CreatorGatedTombstonePlanDraft.additionalProperties, false);

  assert.equal(
    interest.properties.terminalReason.enum?.includes(
      "SAFETY_UNAVAILABLE_BEFORE_CONNECT",
    ),
    false,
  );
  assert.deepEqual(schemas.CreatorGatedInterestFocus.oneOf?.map((schema) => schema.$ref), [
    "#/components/schemas/CreatorGatedUnconnectedInterestFocus",
    "#/components/schemas/CreatorGatedActionContextFocus",
    "#/components/schemas/CreatorGatedPlanFocus",
  ]);
  assert.equal(schemas.CreatorGatedInterestFocus.discriminator?.propertyName, "type");
  assert.deepEqual(schemas.CreatorGatedInterestFocus.discriminator?.mapping, {
    INTEREST: "#/components/schemas/CreatorGatedUnconnectedInterestFocus",
    ACTION_CONTEXT: "#/components/schemas/CreatorGatedActionContextFocus",
    PLAN: "#/components/schemas/CreatorGatedPlanFocus",
  });
  assert.deepEqual(schemas.CreatorGatedPlanFocus.required, [
    "type",
    "connectionId",
    "commitmentId",
    "revisionId",
  ]);

  for (const [path, method] of [
    ["/api/v1/action-coordination/v2/actions/{actionId}/interest", "post"],
    ["/api/v1/action-coordination/v2/interests/{interestId}/reactivate", "post"],
  ] as const) {
    const response = spec.paths[path][method].responses["429"];
    assert.equal(response.$ref, "#/components/responses/BLightInterestError");
  }
  const boundedError = spec.components.schemas.BLightInterestErrorEnvelope;
  assert.equal(boundedError.properties.error.properties.retryAfterSeconds.type, "integer");
});

test("BL-BE-07 reactivation preserves the global Action-before-Interest lock order", async () => {
  const source = await readFile(interestServiceUrl, "utf8");
  const start = source.indexOf("export async function reactivateCreatorGatedInterest");
  const end = source.indexOf("export async function withdrawCreatorGatedInterest");
  assert.ok(start >= 0 && end > start);
  const reactivation = source.slice(start, end);
  const lockAction = reactivation.indexOf("await loadActionForMutation(");
  const lockInterest = reactivation.indexOf("await lockInterestGraph(");
  assert.ok(lockAction >= 0);
  assert.ok(lockInterest > lockAction);
  assert.doesNotMatch(
    reactivation,
    /reservationGeneration\s*:\s*\{\s*increment\s*:/,
  );
});
