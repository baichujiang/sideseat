import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const openApiUrl = new URL("../../openapi/v1.json", import.meta.url);
const serviceUrl = new URL(
  "../../lib/v2/action-coordination/reservation-service.ts",
  import.meta.url,
);
const lifecycleUrl = new URL(
  "../../lib/v2/action-lifecycle-finalizer.ts",
  import.meta.url,
);
const responsesUrl = new URL(
  "../../lib/v2/action-coordination/response-service.ts",
  import.meta.url,
);

type Schema = {
  $ref?: string;
  type?: string | string[];
  const?: unknown;
  enum?: unknown[];
  format?: string;
  additionalProperties?: boolean;
  required?: string[];
  properties: Record<string, Schema>;
};

type Operation = {
  operationId: string;
  "x-sideseat-contract": string;
  "x-sideseat-stable-operation-id": string;
  "x-sideseat-empty-request-body"?: boolean;
  parameters?: Array<{ name: string; in: string; required?: boolean; schema: Schema }>;
  responses: Record<string, { $ref?: string; content?: unknown }>;
};

type Spec = {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, Schema> };
};

test("BL-API-03 freezes reserve, safe-drain release, and heartbeat operations", async () => {
  const spec = JSON.parse(await readFile(openApiUrl, "utf8")) as Spec;
  const cases = [
    {
      path: "/api/v1/action-coordination/v2/interests/{interestId}/reservations",
      method: "post",
      operationId: "reserveCreatorGatedActionCoordination",
      statuses: ["200", "201", "400", "401", "403", "404", "409", "422", "426", "500"],
      capable: true,
    },
    {
      path: "/api/v1/action-coordination/v2/reservations/{reservationId}",
      method: "delete",
      operationId: "releaseCreatorGatedActionCoordinationReservation",
      statuses: ["200", "400", "401", "403", "404", "409", "422", "500"],
      capable: false,
    },
    {
      path: "/api/v1/action-coordination/v2/reservations/{reservationId}/heartbeat",
      method: "post",
      operationId: "heartbeatCreatorGatedActionCoordinationReservation",
      statuses: ["200", "400", "401", "403", "404", "409", "422", "426", "500"],
      capable: true,
    },
  ] as const;

  for (const expected of cases) {
    const operation = spec.paths[expected.path]?.[expected.method];
    assert.ok(operation);
    assert.equal(operation.operationId, expected.operationId);
    assert.equal(operation["x-sideseat-contract"], "b-light-v2");
    assert.equal(operation["x-sideseat-stable-operation-id"], expected.operationId);
    assert.equal(operation["x-sideseat-empty-request-body"], true);
    assert.deepEqual(Object.keys(operation.responses).sort(), [...expected.statuses].sort());
    const parameters = operation.parameters ?? [];
    assert.equal(parameters.some((value) => value.name === "Idempotency-Key"), true);
    assert.equal(
      parameters.some((value) => value.name === "X-SideSeat-Capabilities"),
      expected.capable,
    );
  }
});

test("BL-API-03 reservation wire is typed and keeps the shell creator-private", async () => {
  const spec = JSON.parse(await readFile(openApiUrl, "utf8")) as Spec;
  const reservation = spec.components.schemas.ActionCoordinationReservation;
  assert.deepEqual(reservation.required, [
    "id",
    "contextId",
    "leaseExpiresAt",
    "generation",
    "actionContextPreview",
    "planDraft",
    "focus",
  ]);
  assert.equal(reservation.properties.id.format, "uuid");
  assert.equal(
    reservation.properties.actionContextPreview.$ref,
    "#/components/schemas/CreatorGatedLiveInterestContext",
  );
  assert.equal(
    reservation.properties.planDraft.$ref,
    "#/components/schemas/CreatorGatedLivePlanDraft",
  );
  assert.equal(
    reservation.properties.focus.$ref,
    "#/components/schemas/CoordinationShellFocus",
  );
  const release = spec.components.schemas.ActionCoordinationReservationRelease;
  assert.deepEqual(release.required, [
    "reservationId",
    "contextId",
    "interestId",
    "actionId",
    "generation",
    "releasedAt",
    "focus",
  ]);
  const responseItem = spec.components.schemas.ActionResponseItem;
  assert.equal(responseItem.properties.canStartCoordination.type, "boolean");
  assert.ok(
    responseItem.properties.startCoordinationUnavailableReason.enum?.includes(null),
  );
});

test("BL-API-03 service stays a reservation shell without activation artifacts", async () => {
  const source = await readFile(serviceUrl, "utf8");
  const lifecycleSource = await readFile(lifecycleUrl, "utf8");
  assert.match(source, /DEFAULT_COORDINATION_RESERVATION_LEASE_MS\s*=\s*5\s*\*\s*60_000/);
  assert.match(source, /INITIATING[\s\S]*OPEN/);
  assert.match(source, /COORDINATION_RESERVED/);
  assert.match(source, /releaseInitiatingReservationInTransaction/);
  assert.match(lifecycleSource, /COORDINATION_RELEASED/);
  assert.match(source, /currentPendingRevisionId/);
  assert.match(source, /isCreatorGatedExperimentEnrollmentEnabled/);
  assert.match(source, /recoverExpiredReservationLeaseInTransaction/);
  assert.doesNotMatch(source, /\.connection\.create/);
  assert.doesNotMatch(source, /\.message\.create/);
  assert.doesNotMatch(source, /enqueueNotificationOutboxItem/);
  assert.doesNotMatch(source, /notificationOutbox/);
  assert.doesNotMatch(source, /firstContentType\s*:/);
});

test("BL-API-03 Responses eligibility keeps a resumable shell and excludes its own slot", async () => {
  const source = await readFile(responsesUrl, "utf8");
  assert.match(
    source,
    /context\.state !== "WAITING" && context\.state !== "INITIATING"/,
  );
  assert.match(source, /context\.reservationId/);
  assert.match(source, /context\.leaseExpiresAt/);
  assert.match(
    source,
    /activeCoordinationCount - \(context\.state === "INITIATING" \? 1 : 0\)/,
  );
  assert.match(source, /currentReservationCreatorEligible/);
  assert.match(source, /currentResponseAudienceEligible/);
});
