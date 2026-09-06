import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const compatUrl = new URL(
  "../../lib/plans/legacy-plan-commitment-compat.ts",
  import.meta.url,
);
const serviceUrl = new URL("../../lib/api/v1/plans-service.ts", import.meta.url);
const httpUrl = new URL("../../lib/api/v1/http.ts", import.meta.url);
const openApiUrl = new URL("../../openapi/v1.json", import.meta.url);
const legacyWebRouteUrls = [
  new URL(
    "../../app/api/plan-requests/[requestId]/accept/route.ts",
    import.meta.url,
  ),
  new URL(
    "../../app/api/plan-requests/[requestId]/decline/route.ts",
    import.meta.url,
  ),
  new URL(
    "../../app/api/plan-requests/[requestId]/counter-propose/route.ts",
    import.meta.url,
  ),
] as const;

test("legacy Plan mutations use trusted source policy and reject v2 before any legacy write", async () => {
  const source = await readFile(compatUrl, "utf8");
  assert.match(source, /originAction:[\s\S]{0,100}coordinationPolicy: true/);
  assert.match(
    source,
    /actionInterest:[\s\S]{0,160}classmatePost:[\s\S]{0,80}coordinationPolicy: true/,
  );
  assert.match(
    source,
    /trustedPolicies\.includes\("CREATOR_GATED_V2"\)/,
  );
  assert.doesNotMatch(
    source,
    /commitmentId\s*&&\s*[^\n]*originContextId[\s\S]{0,100}CREATOR_GATED_V2/,
  );
  const policyGate = source.indexOf(
    'trustedPolicies.includes("CREATOR_GATED_V2")',
  );
  const legacyCallback = source.indexOf("await afterConnectionSafety?.()", policyGate);
  assert.ok(policyGate >= 0 && legacyCallback > policyGate);
  for (const functionName of [
    "acceptLegacyPlanRevision",
    "declineLegacyPlanRevision",
    "counterLegacyPlanRevision",
  ]) {
    const start = source.indexOf(`function ${functionName}`);
    assert.ok(start >= 0, functionName);
    assert.match(source.slice(start, start + 900), /lockActionableRevision/);
  }
});

test("legacy native and web endpoints surface a stable neutral policy boundary", async () => {
  const [service, http, ...webRoutes] = await Promise.all([
    readFile(serviceUrl, "utf8"),
    readFile(httpUrl, "utf8"),
    ...legacyWebRouteUrls.map((url) => readFile(url, "utf8")),
  ]);
  assert.equal(
    service.match(/cause instanceof LegacyPlanPolicyUnsupportedError/g)?.length,
    3,
  );
  assert.match(
    service,
    /COORDINATION_POLICY_UNSUPPORTED[\s\S]{0,180}status: 409[\s\S]{0,180}recovery/,
  );
  assert.match(http, /\| "COORDINATION_POLICY_UNSUPPORTED"/);
  assert.match(
    http,
    /\.\.\.\(options\.recovery \? \{ recovery: options\.recovery \} : \{\}\)/,
  );
  for (const route of webRoutes) {
    assert.match(route, /LegacyPlanPolicyUnsupportedError/);
    assert.match(
      route,
      /cause instanceof LegacyPlanPolicyUnsupportedError[\s\S]{0,100}error\(cause\.message, 409, cause\.code\)/,
    );
  }
});

test("legacy direct Plan creation rejects only trusted creator-gated Action origins", async () => {
  const service = await readFile(serviceUrl, "utf8");
  const start = service.indexOf("export async function createDirectPlanRequest");
  const end = service.indexOf("export async function acceptPlanRequest", start);
  const create = service.slice(start, end);
  assert.match(
    create,
    /classmatePost: \{ select: \{ coordinationPolicy: true \} \}/,
  );
  assert.match(
    create,
    /trustedActionOrigin\?\.classmatePost\.coordinationPolicy ===[\s\S]{0,40}"CREATOR_GATED_V2"/,
  );
  assert.match(create, /action: "OPEN_ACTION_CONTEXT"/);
  assert.match(create, /type: "ACTION_CONTEXT"/);
  assert.ok(
    create.indexOf('"CREATOR_GATED_V2"') <
      create.indexOf("assertDirectUnrepliedSendAllowed"),
  );
  assert.doesNotMatch(
    create,
    /commitmentId[\s\S]{0,100}CREATOR_GATED_V2/,
  );
});

test("OpenAPI exposes typed Plan and Action Context recovery on the legacy error envelope", async () => {
  const spec = JSON.parse(await readFile(openApiUrl, "utf8")) as {
    paths: Record<
      string,
      Record<string, { responses: Record<string, { $ref?: string }> }>
    >;
    components: {
      schemas: Record<
        string,
        {
          $ref?: string;
          oneOf?: Array<{ $ref: string }>;
          discriminator?: { propertyName: string; mapping: Record<string, string> };
          properties?: Record<string, { $ref?: string; const?: string }>;
        }
      >;
    };
  };
  assert.equal(
    spec.components.schemas.ErrorEnvelope.properties?.recovery?.$ref,
    "#/components/schemas/LegacyCoordinationPolicyRecovery",
  );
  const recovery = spec.components.schemas.LegacyCoordinationPolicyRecovery;
  assert.equal(recovery.discriminator?.propertyName, "action");
  assert.deepEqual(recovery.discriminator?.mapping, {
    OPEN_PLAN: "#/components/schemas/CreatorGatedActionPlanRecovery",
    OPEN_ACTION_CONTEXT:
      "#/components/schemas/CreatorGatedActionContextRecovery",
  });
  assert.equal(
    spec.components.schemas.CreatorGatedActionContextRecovery.properties?.action
      ?.const,
    "OPEN_ACTION_CONTEXT",
  );
  for (const path of [
    "/api/v1/plans/{planId}/accept",
    "/api/v1/plans/{planId}/decline",
    "/api/v1/plans/{planId}/counter",
    "/api/v1/connections/{connectionId}/plans",
  ]) {
    assert.equal(
      spec.paths[path]?.post?.responses["409"]?.$ref,
      "#/components/responses/Error",
    );
  }
});
