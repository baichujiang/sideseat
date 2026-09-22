import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  checkOpenApiProject,
  extractRouteOperations,
  validateOpenApiContract,
} from "../../scripts/check-openapi-v1.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

type MutableSchema = Record<string, unknown>;

type MutableFixtureResponse = Record<string, unknown> & {
  content?: Record<string, { schema: unknown }>;
};

type MutableFixtureOperation = Record<string, unknown> & {
  operationId: string;
  security: Array<Record<string, unknown>>;
  requestBody?: {
    required: boolean;
    content: Record<string, { schema: unknown }>;
  };
  responses: Record<string, MutableFixtureResponse>;
};

type MutableStrictFixture = Record<string, unknown> & {
  paths: Record<
    string,
    {
      parameters: Array<{
        name: string;
        in: string;
        required: boolean;
        schema: MutableSchema;
      }>;
      post: MutableFixtureOperation;
    }
  >;
  components: {
    schemas: Record<string, MutableSchema>;
  };
};

function schemaProperties(schema: MutableSchema): Record<string, MutableSchema> {
  return schema.properties as Record<string, MutableSchema>;
}

function schemaVariants(schema: MutableSchema): MutableSchema[] {
  return schema.oneOf as MutableSchema[];
}

function errorResponse() {
  return {
    description: "A stable error.",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ErrorEnvelope" },
      },
    },
  };
}

function validStrictFixture(): MutableStrictFixture {
  return {
    openapi: "3.1.0",
    info: { title: "fixture", version: "1" },
    paths: {
      "/api/v1/action-coordination/v2/actions/{actionId}/interest": {
        parameters: [
          {
            name: "actionId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "Idempotency-Key",
            in: "header",
            required: true,
            schema: {
              type: "string",
              minLength: 8,
              maxLength: 128,
              pattern: "^[A-Za-z0-9._:-]{8,128}$",
            },
          },
        ],
        post: {
          operationId: "createBLightInterest",
          "x-sideseat-contract": "b-light-v2",
          "x-sideseat-stable-operation-id": "createBLightInterest",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/InterestRequest" },
              },
            },
          },
          responses: {
            201: {
              description: "Created.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/InterestEnvelope" },
                },
              },
            },
            401: { $ref: "#/components/responses/Error" },
            403: { $ref: "#/components/responses/Error" },
            409: { $ref: "#/components/responses/Error" },
            422: { $ref: "#/components/responses/Error" },
            500: { $ref: "#/components/responses/Error" },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer" },
      },
      responses: { Error: errorResponse() },
      schemas: {
        ErrorEnvelope: {
          type: "object",
          properties: {
            error: {
              type: "object",
              additionalProperties: false,
              properties: { code: { type: "string" }, message: { type: "string" } },
              required: ["code", "message"],
            },
          },
          required: ["error"],
        },
        InterestRequest: {
          type: "object",
          additionalProperties: false,
          properties: { interestSurface: { type: "string" } },
          required: ["interestSurface"],
        },
        InterestEnvelope: {
          type: "object",
          additionalProperties: false,
          properties: {
            data: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
          },
          required: ["data"],
        },
      },
    },
  } as unknown as MutableStrictFixture;
}

function strictRoute(statuses = ["201"]) {
  const explicitStatuses = new Set(statuses);
  return {
    method: "post",
    path: "/api/v1/action-coordination/v2/actions/{actionId}/interest",
    file: "fixture/route.ts",
    explicitStatuses,
    explicitSuccessStatuses: new Set(statuses.filter((status) => status.startsWith("2"))),
  };
}

function validateStrictFixture(spec: MutableStrictFixture) {
  return validateOpenApiContract({
    spec,
    routeOperations: [strictRoute()],
    strictOperationManifest: new Map([
      [
        "post /api/v1/action-coordination/v2/actions/{actionId}/interest",
        {
          operationId: "createBLightInterest",
          statuses: ["201", "401", "403", "409", "422", "500"],
        },
      ],
    ]),
  });
}

test("the repository v1 contract passes structural and route checks", () => {
  const result = checkOpenApiProject(root);
  assert.deepEqual(result.errors, []);
  assert.ok(result.implementedCount > 0);
});

test("coordination-language mutation is part of the generated client contract", () => {
  const spec = JSON.parse(readFileSync(join(root, "openapi/v1.json"), "utf8"));
  const operation = spec.paths["/api/v1/me/languages"].put;

  assert.equal(operation.operationId, "updateCurrentProfileLanguages");
  assert.equal(
    operation.requestBody.content["application/json"].schema.$ref,
    "#/components/schemas/ProfileLanguagesUpdateRequest",
  );
  assert.equal(
    operation.responses["200"].content["application/json"].schema.allOf[1]
      .properties.data.$ref,
    "#/components/schemas/CurrentProfile",
  );
});

test("legacy direct Interest documents its actual 201 and explicit wire schema", () => {
  const spec = JSON.parse(readFileSync(join(root, "openapi/v1.json"), "utf8"));
  const item = spec.paths["/api/v1/discover/posts/{postId}/interest"];
  const routeFile = join(root, "app/api/v1/discover/posts/[postId]/interest/route.ts");
  const routes = extractRouteOperations({
    root,
    file: routeFile,
    source: readFileSync(routeFile, "utf8"),
  });

  assert.ok(item.post.responses["201"]);
  assert.equal(item.post.responses["200"], undefined);
  assert.deepEqual(Object.keys(item.post.responses).sort(), [
    "201",
    "401",
    "403",
    "404",
    "409",
    "422",
    "429",
    "500",
  ]);
  assert.deepEqual(Object.keys(item.delete.responses).sort(), [
    "200",
    "401",
    "403",
    "404",
    "409",
    "422",
    "500",
  ]);
  assert.equal(
    item.post.responses["201"].content["application/json"].schema.$ref,
    "#/components/schemas/LegacyDirectActionInterestCreateEnvelope",
  );
  assert.equal(
    item.delete.responses["200"].content["application/json"].schema.$ref,
    "#/components/schemas/LegacyDirectActionInterestWithdrawEnvelope",
  );
  assert.ok(item.delete.responses["403"]);
  assert.ok(
    item.parameters.some(
      (parameter: { in: string; name: string; required: boolean }) =>
        parameter.in === "header" &&
        parameter.name === "Idempotency-Key" &&
        parameter.required,
    ),
  );
  assert.equal(routes.find((route) => route.method === "post")?.explicitSuccessStatuses.has("201"), true);
  assert.deepEqual(
    [...(routes.find((route) => route.method === "delete")?.explicitSuccessStatuses ?? [])],
    ["200"],
  );

  const context = spec.components.schemas.LegacyDirectActionContext;
  assert.equal(
    context.properties.course.$ref,
    "#/components/schemas/LegacyDirectActionInterestCourse",
  );
  assert.deepEqual(spec.components.schemas.LegacyDirectActionInterestCourse.type, [
    "object",
    "null",
  ]);
  for (const field of ["startsAt", "endsAt", "location"]) {
    assert.ok(context.properties[field].type.includes("null"));
  }
  const draft = spec.components.schemas.LegacyDirectActionPlanDraft;
  for (const field of ["startTime", "endTime", "location"]) {
    assert.ok(draft.properties[field].type.includes("null"));
  }
});

test("Discover Actions expose a bounded capability-aware coordination read model", () => {
  const spec = JSON.parse(readFileSync(join(root, "openapi/v1.json"), "utf8"));
  const post = spec.components.schemas.DiscoverBuddyPost;
  const coordination = spec.components.schemas.DiscoverActionCoordination;

  assert.equal(
    post.properties.coordination.$ref,
    "#/components/schemas/DiscoverActionCoordination",
  );
  assert.ok(post.required.includes("coordination"));
  assert.equal(coordination.additionalProperties, false);
  assert.deepEqual(coordination.properties.policy.enum, [
    "DIRECT_CONVERSATION_V1",
    "CREATOR_GATED_V2",
  ]);
  assert.deepEqual(coordination.properties.interactionMode.enum, [
    "DIRECT_CONVERSATION",
    "EXPRESS_INTEREST",
    "READ_ONLY",
  ]);
  assert.deepEqual(coordination.properties.readOnlyReason.enum, [
    "CLIENT_UPDATE_REQUIRED",
    "PILOT_UNAVAILABLE",
    null,
  ]);
});

test("an implementation success status missing from OpenAPI fails validation", () => {
  const spec = validStrictFixture();
  spec.paths["/api/v1/action-coordination/v2/actions/{actionId}/interest"].post.responses["200"] =
    spec.paths["/api/v1/action-coordination/v2/actions/{actionId}/interest"].post.responses["201"];
  delete spec.paths["/api/v1/action-coordination/v2/actions/{actionId}/interest"].post.responses["201"];

  const errors = validateStrictFixture(spec);
  assert.ok(errors.some((error) => error.includes("implementation explicitly returns 201")));
});

test("operation IDs and request/response schemas are mandatory", () => {
  const spec = validStrictFixture();
  const operation = spec.paths["/api/v1/action-coordination/v2/actions/{actionId}/interest"].post;
  operation.operationId = "Invalid operation id";
  operation.requestBody!.content["application/json"].schema = "not-a-schema";
  operation.responses["201"].content!["application/json"].schema = "not-a-schema";

  const errors = validateStrictFixture(spec);
  assert.ok(errors.some((error) => error.includes("operationId must be stable")));
  assert.ok(errors.some((error) => error.includes("request application/json must declare a schema")));
  assert.ok(errors.some((error) => error.includes("201: application/json must declare a schema")));
});

test("strict operation IDs cannot be silently renamed", () => {
  const spec = validStrictFixture();
  spec.paths["/api/v1/action-coordination/v2/actions/{actionId}/interest"].post.operationId =
    "renamedBLightInterest";

  const errors = validateStrictFixture(spec);
  assert.ok(errors.some((error) => error.includes("must match its frozen operation ID")));
});

test("strict mutations require idempotency and explicit request-body semantics", () => {
  const spec = validStrictFixture();
  const pathItem = spec.paths["/api/v1/action-coordination/v2/actions/{actionId}/interest"];
  pathItem.parameters = pathItem.parameters.filter((parameter) => parameter.in !== "header");
  delete pathItem.post.requestBody;

  const errors = validateStrictFixture(spec);
  assert.ok(errors.some((error) => error.includes("must require a schema-defined Idempotency-Key")));
  assert.ok(errors.some((error) => error.includes("x-sideseat-empty-request-body")));
});

test("strict security cannot include an anonymous alternative", () => {
  const spec = validStrictFixture();
  spec.paths["/api/v1/action-coordination/v2/actions/{actionId}/interest"].post.security.push({});

  const errors = validateStrictFixture(spec);
  assert.ok(errors.some((error) => error.includes("must require bearerAuth")));
});

test("B-light operations reject generic success envelopes, including nested refs", () => {
  const spec = validStrictFixture();
  schemaProperties(spec.components.schemas.InterestEnvelope).data = {
    $ref: "#/components/schemas/V2SuccessEnvelope",
  };
  spec.components.schemas.V2SuccessEnvelope = {
    type: "object",
    additionalProperties: true,
  };

  const errors = validateStrictFixture(spec);
  assert.ok(errors.some((error) => error.includes("must not reference generic schema V2SuccessEnvelope")));

  schemaProperties(spec.components.schemas.InterestEnvelope).data = {};
  const emptyPayloadErrors = validateStrictFixture(spec);
  assert.ok(
    emptyPayloadErrors.some((error) =>
      error.includes("must not contain empty unconstrained payloads"),
    ),
  );
});

test("new B-light operations require independent manifest registration", () => {
  const errors = validateOpenApiContract({
    spec: validStrictFixture(),
    routeOperations: [strictRoute()],
    strictOperationManifest: new Map(),
  });
  assert.ok(errors.some((error) => error.includes("must be registered in the checker manifest")));
});

test("B-light oneOf unions require a fixed discriminator in every variant", () => {
  const spec = validStrictFixture();
  schemaProperties(spec.components.schemas.InterestEnvelope).data = {
    $ref: "#/components/schemas/RouteFocus",
  };
  spec.components.schemas.RouteFocus = {
    oneOf: [
      {
        type: "object",
        properties: { type: { const: "INTEREST" }, interestId: { type: "string" } },
        required: ["type", "interestId"],
      },
      {
        type: "object",
        properties: { type: { const: "PLAN" }, planId: { type: "string" } },
        required: ["type", "planId"],
      },
    ],
  };

  let errors = validateStrictFixture(spec);
  assert.ok(errors.some((error) => error.includes("must declare discriminator.propertyName")));

  spec.components.schemas.RouteFocus.discriminator = { propertyName: "type" };
  errors = validateStrictFixture(spec);
  assert.equal(errors.some((error) => error.includes("discriminator")), false);

  schemaProperties(schemaVariants(spec.components.schemas.RouteFocus)[1]).type.const = "INTEREST";
  errors = validateStrictFixture(spec);
  assert.ok(errors.some((error) => error.includes("discriminator value \"INTEREST\" is duplicated")));
});

test("route discovery includes exported arrow functions and aliased exports", () => {
  const operations = extractRouteOperations({
    root: "/fixture",
    file: "/fixture/app/api/v1/example/route.ts",
    source: `
      export const POST = async () => ({ status: 201 });
      const read = async () => ({ status: 200 });
      const remove = async () => ({ status: 202 });
      export const DELETE = remove;
      export const PATCH: RouteHandler = async () => ({ status: 200 });
      export { read as GET };
    `,
  });

  assert.deepEqual(
    operations.map((operation) => [operation.method, [...operation.explicitSuccessStatuses]]),
    [
      ["post", ["201"]],
      ["delete", []],
      ["patch", ["200"]],
      ["get", ["200"]],
    ],
  );
});
