import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const openApiUrl = new URL("../../openapi/v1.json", import.meta.url);
const serviceUrl = new URL(
  "../../lib/v2/action-coordination/response-service.ts",
  import.meta.url,
);
const discoverServiceUrl = new URL("../../lib/api/v1/discover-service.ts", import.meta.url);
const inboxRouteUrl = new URL("../../app/api/v1/inbox/route.ts", import.meta.url);

type Schema = {
  $ref?: string;
  oneOf?: Schema[];
  type?: string | string[];
  const?: unknown;
  enum?: unknown[];
  additionalProperties?: boolean;
  required?: string[];
  properties: Record<string, Schema>;
  items?: Schema;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
};

type Operation = {
  operationId: string;
  "x-sideseat-contract": string;
  "x-sideseat-stable-operation-id": string;
  parameters?: Array<{ name: string; in: string; required?: boolean; schema: Schema }>;
  requestBody?: { content: { "application/json": { schema: Schema } } };
  responses: Record<string, { $ref?: string; content?: unknown }>;
};

type Spec = {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, Schema> };
};

test("BL-API-02 freezes one canonical creator Responses contract", async () => {
  const spec = JSON.parse(await readFile(openApiUrl, "utf8")) as Spec;
  const cases = [
    {
      path: "/api/v1/action-coordination/v2/responses",
      method: "get",
      operationId: "listCreatorActionResponses",
      statuses: ["200", "401", "403", "404", "410", "422", "500"],
    },
    {
      path: "/api/v1/action-coordination/v2/actions/{actionId}/responses/seen",
      method: "post",
      operationId: "markCreatorActionResponsesSeen",
      statuses: ["200", "400", "401", "403", "404", "409", "410", "422", "500"],
    },
    {
      path: "/api/v1/action-coordination/v2/interests/{interestId}/presentation",
      method: "patch",
      operationId: "setCreatorActionInterestPresentation",
      statuses: ["200", "400", "401", "403", "404", "409", "422", "500"],
    },
  ] as const;
  for (const expected of cases) {
    const operation = spec.paths[expected.path]?.[expected.method];
    assert.ok(operation);
    assert.equal(operation.operationId, expected.operationId);
    assert.equal(operation["x-sideseat-contract"], "b-light-v2");
    assert.equal(operation["x-sideseat-stable-operation-id"], expected.operationId);
    assert.deepEqual(Object.keys(operation.responses).sort(), [...expected.statuses].sort());
  }

  const list = spec.paths["/api/v1/action-coordination/v2/responses"].get;
  const presentation = list.parameters?.find((value) => value.name === "presentation");
  const limit = list.parameters?.find((value) => value.name === "limit");
  assert.deepEqual(presentation?.schema.enum, ["VISIBLE", "HIDDEN"]);
  assert.equal(limit?.schema.type, "integer");

  const seen = spec.components.schemas.ActionResponsesSeenRequest;
  assert.deepEqual(seen.required, ["snapshotToken", "interestIds"]);
  assert.equal(seen.properties.interestIds.minItems, 1);
  assert.equal(seen.properties.interestIds.maxItems, 50);
  assert.equal(seen.properties.interestIds.uniqueItems, true);
});

test("BL-API-02 limited profile and authoritative Start coordination expose no candidate ranking", async () => {
  const spec = JSON.parse(await readFile(openApiUrl, "utf8")) as Spec;
  const responder = spec.components.schemas.LimitedActionResponder;
  assert.deepEqual(Object.keys(responder.properties), [
    "userId",
    "displayName",
    "avatarUrl",
    "verifiedStudent",
  ]);
  assert.equal(responder.additionalProperties, false);
  const item = spec.components.schemas.ActionResponseItem;
  assert.equal(item.properties.canStartCoordination.type, "boolean");
  assert.deepEqual(item.properties.startCoordinationUnavailableReason.enum, [
    "COORDINATION_START_UNAVAILABLE",
    "INTEREST_NOT_ACTIVE",
    "INTEREST_ALREADY_COORDINATING",
    "ACTION_EXPIRED",
    "ACTION_FULFILLED",
    "COORDINATION_LIMIT_REACHED",
    "ACTION_PLAN_PENDING",
    "COORDINATION_POLICY_UNSUPPORTED",
    null,
  ]);
  for (const forbidden of [
    "rank",
    "score",
    "bio",
    "major",
    "semester",
    "contactInfo",
    "connectionId",
    "messageId",
    "reservationId",
  ]) {
    assert.equal(forbidden in item.properties, false, forbidden);
    assert.equal(forbidden in responder.properties, false, forbidden);
  }
});

test("BL-API-02 service materializes snapshots and never creates coordination artifacts", async () => {
  const source = await readFile(serviceUrl, "utf8");
  assert.match(source, /RepeatableRead/);
  assert.match(source, /ACTION_RESPONSE_SNAPSHOT_TTL_MS\s*=\s*15\s*\*\s*60_000/);
  assert.match(source, /actionResponseSnapshot\.create/);
  assert.match(source, /actionResponseSnapshotItem\.createMany/);
  assert.match(source, /snapshotToken[\s\S]*interestIds/);
  assert.match(source, /ActionInterestViewReceipt/);
  assert.match(
    source,
    /const liveOriginSnapshotPredicate[\s\S]*originSnapshot[\s\S]*version[\s\S]*originSnapshot[\s\S]*kind/,
  );
  assert.equal(
    source.match(/\$\{liveOriginSnapshotPredicate\}/g)?.length,
    3,
  );
  assert.match(
    source,
    /revalidateSnapshotMembershipSafety\([\s\S]*allItems\.map\(\(item\) => item\.interestId\)/,
  );
  assert.match(
    source,
    /parseActionOriginSnapshot\(row\.originSnapshot\)[\s\S]*origin\?\.kind !== "LIVE"/,
  );
  assert.doesNotMatch(source, /\.connection\.create/);
  assert.doesNotMatch(source, /\.message\.create/);
  assert.doesNotMatch(source, /notificationOutbox\.create/);
  assert.doesNotMatch(
    source,
    /actionCoordinationContext\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)/,
  );
});

test("BL-API-02 adds one contextual Action entry and one Inbox shortcut without fake conversations", async () => {
  const spec = JSON.parse(await readFile(openApiUrl, "utf8")) as Spec;
  const detail = spec.components.schemas.DiscoverBuddyPostDetail;
  assert.equal(
    detail.properties.creatorResponseEntry.$ref,
    "#/components/schemas/CreatorResponseEntry",
  );
  assert.equal(detail.required?.includes("creatorResponseEntry"), false);
  assert.equal(spec.components.schemas.CreatorResponseEntry.type, "object");
  const inboxData = spec.components.schemas.InboxEnvelope.properties.data;
  assert.equal(
    inboxData.properties.actionResponseSummary.$ref,
    "#/components/schemas/ActionResponseSummary",
  );
  assert.equal(inboxData.required?.includes("actionResponseSummary"), false);
  assert.equal(spec.components.schemas.ActionResponseSummary.type, "object");

  const discoverSource = await readFile(discoverServiceUrl, "utf8");
  assert.match(discoverSource, /isAuthor\s*\?\s*await loadCreatorResponseEntry/);
  assert.match(discoverSource, /\.\.\.\(creatorResponseEntry\s*\?/);
  assert.doesNotMatch(discoverSource, /creatorResponseEntry\s*,\s*\n\s*};/);
  const inboxSource = await readFile(inboxRouteUrl, "utf8");
  assert.match(inboxSource, /prepareInboxListMerged\(merged\)\.map/);
  assert.match(inboxSource, /\.\.\.\(actionResponseSummary\s*\?/);
  assert.doesNotMatch(inboxSource, /conversations\.(?:push|unshift).*actionResponseSummary/s);
});
