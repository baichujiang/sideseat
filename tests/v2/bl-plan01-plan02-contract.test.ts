import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const serviceUrl = new URL(
  "../../lib/v2/action-coordination/plan-service.ts",
  import.meta.url,
);
const sharedRouteUrl = new URL(
  "../../app/api/v1/action-coordination/v2/_plan-route.ts",
  import.meta.url,
);
const openApiUrl = new URL("../../openapi/v1.json", import.meta.url);
const plansDtoUrl = new URL("../../lib/api/v1/plans-dto.ts", import.meta.url);
const openApiCheckerUrl = new URL(
  "../../scripts/check-openapi-v1.mjs",
  import.meta.url,
);
const routeUrls = [
  new URL(
    "../../app/api/v1/action-coordination/v2/contexts/[contextId]/plans/route.ts",
    import.meta.url,
  ),
  new URL(
    "../../app/api/v1/action-coordination/v2/plans/[revisionId]/counter/route.ts",
    import.meta.url,
  ),
  new URL(
    "../../app/api/v1/action-coordination/v2/plans/[revisionId]/accept/route.ts",
    import.meta.url,
  ),
  new URL(
    "../../app/api/v1/action-coordination/v2/plans/[revisionId]/decline/route.ts",
    import.meta.url,
  ),
  new URL(
    "../../app/api/v1/action-coordination/v2/plans/[revisionId]/route.ts",
    import.meta.url,
  ),
] as const;

test("BL-PLAN-01 uses trusted Action origin, stable Commitment revisions, and the shared atomic command", async () => {
  const source = await readFile(serviceUrl, "utf8");
  assert.match(source, /runAtomicActionCoordinationCommand/);
  assert.match(source, /finalizeStablePlanCommitment/);
  assert.match(source, /finalizeStablePlanLifecycleInTransaction/);
  assert.match(source, /finalizeActionExpiry/);
  assert.match(source, /parseActionOriginSnapshot/);
  assert.match(source, /originKind:\s*"ACTION_INTEREST"/);
  assert.match(source, /revisionKind:\s*"INITIAL"/);
  assert.match(source, /currentPendingRevisionId/);
  assert.match(source, /status:\s*"COUNTER_PROPOSED"/);
  assert.match(source, /resolutionReason:[\s\S]{0,160}"RECEIVER_DECLINED"/);
  assert.match(source, /resolutionReason:[\s\S]{0,160}"PROPOSER_WITHDREW"/);
  assert.match(source, /type:\s*"PLAN_REQUEST_CARD"/);
  assert.match(source, /PLAN_PROPOSED/);
  assert.match(source, /PLAN_COUNTERED/);
  assert.match(source, /PLAN_DECLINED/);
  assert.match(source, /PLAN_WITHDRAWN/);
  assert.match(source, /type:\s*"PLAN"/);
  assert.match(source, /createInitialActionPlanInTransaction/);
});

test("BL-PLAN-01 Plan cards share the direct anti-spam reply gate and exclude source-card shortcuts", async () => {
  const source = await readFile(serviceUrl, "utf8");
  assert.match(source, /assertDirectUnrepliedSendAllowed/);
  assert.match(source, /completeDirectReplyGateAfterSend/);
  assert.match(source, /PeerReplyRequiredError/);
  assert.match(source, /requirePlanSendAllowed/);
  assert.doesNotMatch(source, /ACTION_INTEREST_CARD/);
  assert.match(
    source,
    /if \(!isDecline\)[\s\S]*?message\.updateMany[\s\S]*?type: "PLAN_REQUEST_CARD"[\s\S]*?data: \{ body: "" \}/,
  );
});

test("BL-PLAN-02 acceptance atomically fulfills Action, resolves every Context, and verifies two active projections", async () => {
  const source = await readFile(serviceUrl, "utf8");
  assert.match(source, /snapshotActionExpiryPairs/);
  assert.match(source, /ChangedFulfillmentPairSnapshotError/);
  assert.match(source, /fulfilledByPlanId:\s*commitment\.id/);
  assert.match(source, /status:\s*"FULFILLED"/);
  assert.match(source, /status:\s*"CONFIRMED"/);
  assert.match(source, /currentAcceptedRevisionId:\s*revision\.id/);
  assert.match(source, /PLAN_CONFIRMED/);
  assert.match(source, /SOURCE_FULFILLED/);
  assert.match(source, /ACTION_FULFILLED_BEFORE_CONNECT/);
  assert.match(source, /materializePlanCalendarEntries/);
  assert.match(source, /projections\.length !== 2/);
  assert.match(source, /projectionStatus !== "ACTIVE"/);
  assert.match(source, /PLAN_ACCEPTED/);
});

test("BL-PLAN routes require auth plus Idempotency-Key and accept no client origin identifiers", async () => {
  const shared = await readFile(sharedRouteUrl, "utf8");
  assert.match(shared, /\.strict\(\)/);
  assert.doesNotMatch(shared, /originActionId|originContextId|originSnapshot/);
  for (const routeUrl of routeUrls) {
    const route = await readFile(routeUrl, "utf8");
    assert.match(route, /requireV1User/);
    assert.match(route, /isActionCoordinationIdempotencyKey/);
    assert.match(route, /actionPlanMutationResponse/);
    assert.match(route, /isActionCoordinationFailure/);
  }
  const methods = await Promise.all(
    routeUrls.map((routeUrl) => readFile(routeUrl, "utf8")),
  );
  assert.equal(methods.filter((source) => /export async function POST/.test(source)).length, 4);
  assert.equal(methods.filter((source) => /export async function DELETE/.test(source)).length, 1);
});

test("BL-PLAN freezes five strict v2 paths and nullable stable Plan identities", async () => {
  const [specSource, dto, checker] = await Promise.all([
    readFile(openApiUrl, "utf8"),
    readFile(plansDtoUrl, "utf8"),
    readFile(openApiCheckerUrl, "utf8"),
  ]);
  const spec = JSON.parse(specSource) as {
    paths: Record<
      string,
      Record<
        string,
        {
          operationId: string;
          "x-sideseat-empty-request-body"?: boolean;
          requestBody?: {
            content: { "application/json": { schema: { $ref: string } } };
          };
          responses: Record<string, unknown>;
        }
      >
    >;
    components: {
      schemas: Record<
        string,
        {
          properties: Record<string, { type?: string | string[] }>;
          required?: string[];
        }
      >;
    };
  };
  const cases = [
    [
      "post",
      "/api/v1/action-coordination/v2/contexts/{contextId}/plans",
      "createCreatorGatedActionPlan",
      "201",
      true,
    ],
    [
      "post",
      "/api/v1/action-coordination/v2/plans/{revisionId}/counter",
      "counterCreatorGatedActionPlan",
      "201",
      true,
    ],
    [
      "post",
      "/api/v1/action-coordination/v2/plans/{revisionId}/accept",
      "acceptCreatorGatedActionPlan",
      "200",
      false,
    ],
    [
      "post",
      "/api/v1/action-coordination/v2/plans/{revisionId}/decline",
      "declineCreatorGatedActionPlan",
      "200",
      false,
    ],
    [
      "delete",
      "/api/v1/action-coordination/v2/plans/{revisionId}",
      "withdrawCreatorGatedActionPlan",
      "200",
      false,
    ],
  ] as const;
  for (const [method, path, operationId, success, hasBody] of cases) {
    const operation = spec.paths[path]?.[method];
    assert.ok(operation);
    assert.equal(operation.operationId, operationId);
    assert.ok(operation.responses[success]);
    assert.equal(Boolean(operation.requestBody), hasBody);
    assert.equal(operation["x-sideseat-empty-request-body"], !hasBody || undefined);
    assert.match(checker, new RegExp(operationId));
  }
  assert.equal(
    spec.paths[cases[0][1]]!.post!.requestBody?.content["application/json"]
      .schema.$ref,
    "#/components/schemas/ActionPlanInput",
  );
  const planRequest = spec.components.schemas.PlanRequest;
  for (const field of ["commitmentId", "originContextId"] as const) {
    assert.deepEqual(planRequest.properties[field]?.type, ["string", "null"]);
    assert.equal(planRequest.required?.includes(field), true);
    assert.match(dto, new RegExp(`${field}: plan\\.${field}`));
  }
  assert.deepEqual(planRequest.properties.coordinationPolicy?.type, [
    "string",
    "null",
  ]);
  assert.equal(
    planRequest.required?.includes("coordinationPolicy"),
    true,
  );
  assert.match(
    dto,
    /coordinationPolicy:[\s\S]{0,160}plan\.originAction\?\.coordinationPolicy[\s\S]{0,160}plan\.actionInterest\?\.classmatePost\.coordinationPolicy[\s\S]{0,80}null/,
  );
  assert.match(dto, /originAction:[\s\S]{0,100}coordinationPolicy: true/);
});

test("PlanRequest DTO exposes trusted source policy and never infers it from DB-05 stable IDs", async () => {
  const { planRequestV1 } = await import("../../lib/api/v1/plans-dto");
  const base = {
    id: "legacy-plan-revision",
    connectionId: "legacy-connection",
    commitmentId: "legacy-plan:legacy-plan-revision",
    originContextId: "legacy-context",
    status: "ACCEPTED",
    planType: "STUDY",
    title: "Legacy study Plan",
    location: null,
    message: null,
    startTime: new Date("2026-09-02T10:00:00.000Z"),
    endTime: new Date("2026-09-02T11:00:00.000Z"),
    proposer: {
      id: "user-a",
      username: "user_a",
      nickname: "User A",
      avatarUrl: null,
    },
    receiver: {
      id: "user-b",
      username: "user_b",
      nickname: "User B",
      avatarUrl: null,
    },
    counterOfId: null,
    availabilityShareId: null,
    scheduleShareLinkId: null,
    originKind: "ACTION_INTEREST",
    originId: "legacy-interest",
    originSnapshot: { version: 1 },
    outcomeResponses: [],
    createdAt: new Date("2026-09-01T10:00:00.000Z"),
    updatedAt: new Date("2026-09-01T11:00:00.000Z"),
  };

  const direct = planRequestV1({
    ...base,
    originAction: { coordinationPolicy: "DIRECT_CONVERSATION_V1" },
  } as never);
  assert.equal(direct.coordinationPolicy, "DIRECT_CONVERSATION_V1");

  const directBeforeCompatibilityBackfill = planRequestV1({
    ...base,
    originAction: null,
    actionInterest: {
      classmatePost: { coordinationPolicy: "DIRECT_CONVERSATION_V1" },
    },
  } as never);
  assert.equal(
    directBeforeCompatibilityBackfill.coordinationPolicy,
    "DIRECT_CONVERSATION_V1",
  );

  const creatorGated = planRequestV1({
    ...base,
    originAction: { coordinationPolicy: "CREATOR_GATED_V2" },
  } as never);
  assert.equal(creatorGated.coordinationPolicy, "CREATOR_GATED_V2");

  const missingTrustedSource = planRequestV1({
    ...base,
    // Stable DB-05 IDs remain present, but are deliberately insufficient to
    // classify the Plan when the trusted Action relation no longer exists.
    originAction: null,
    actionInterest: null,
  } as never);
  assert.equal(missingTrustedSource.coordinationPolicy, null);
});
