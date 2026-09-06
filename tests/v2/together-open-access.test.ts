import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

type CommonJsModuleResolver = typeof Module & {
  _resolveFilename: (
    request: string,
    parent: unknown,
    isMain: boolean,
    options?: unknown,
  ) => string;
};

const commonJsModule = Module as CommonJsModuleResolver;
const resolveFilename = commonJsModule._resolveFilename;
const serverOnlyStub = fileURLToPath(
  new URL("./server-only-test-stub.cjs", import.meta.url),
);
commonJsModule._resolveFilename = function resolveServerOnly(
  request,
  parent,
  isMain,
  options,
) {
  if (request === "server-only") return serverOnlyStub;
  return resolveFilename.call(this, request, parent, isMain, options);
};

const source = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const featureEnvironment = [
  "V2_GLOBAL_KILL_SWITCH",
  "V2_WEEKLY_INTENT_ENABLED",
  "V2_MUTUAL_OPPORTUNITY_ENABLED",
  "V2_TESTFLIGHT_ALLOW_ALL",
  "V2_TESTFLIGHT_ALLOWLIST",
] as const;

test("Together is open without pilot membership and still obeys kill switches", async () => {
  const previous = new Map(
    featureEnvironment.map((key) => [key, process.env[key]]),
  );
  const {
    isV2PilotUser,
    v2TogetherClientFeatures,
  } = await import("../../lib/v2/feature-flags");

  try {
    Object.assign(process.env, {
      V2_GLOBAL_KILL_SWITCH: "0",
      V2_WEEKLY_INTENT_ENABLED: "1",
      V2_MUTUAL_OPPORTUNITY_ENABLED: "1",
      V2_TESTFLIGHT_ALLOW_ALL: "0",
      V2_TESTFLIGHT_ALLOWLIST: "",
    });
    assert.equal(
      isV2PilotUser({ id: "not-allowlisted", email: null, username: "tester" }),
      false,
    );
    assert.deepEqual(v2TogetherClientFeatures(), {
      v2WeeklyIntent: true,
      v2MutualOpportunity: true,
    });

    process.env.V2_MUTUAL_OPPORTUNITY_ENABLED = "0";
    assert.deepEqual(v2TogetherClientFeatures(), {
      v2WeeklyIntent: true,
      v2MutualOpportunity: false,
    });

    process.env.V2_MUTUAL_OPPORTUNITY_ENABLED = "1";
    process.env.V2_GLOBAL_KILL_SWITCH = "1";
    assert.deepEqual(v2TogetherClientFeatures(), {
      v2WeeklyIntent: false,
      v2MutualOpportunity: false,
    });
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("Together routes have no account allowlist while other pilots remain isolated", () => {
  const coreRoutes = [
    "app/api/v1/me/weekly-intents/route.ts",
    "app/api/v1/me/weekly-intents/[intentId]/route.ts",
    "app/api/v1/me/mutual-opportunities/route.ts",
    "app/api/v1/me/mutual-opportunities/[opportunityId]/decision/route.ts",
  ];
  for (const path of coreRoutes) {
    assert.doesNotMatch(source(path), /\bisV2PilotUser\b/, path);
  }

  const experiments = source("lib/v2/experiments.ts");
  assert.match(experiments, /\.\.\.v2TogetherClientFeatures\(\)/);
  assert.match(
    experiments,
    /eligible = isV2ExperimentEnabled\(\) && pilotUser/,
  );
  assert.match(
    experiments,
    /v2SmallGroupPilot:[\s\S]*isV2SmallGroupPilotUser\(user\)/,
  );

  const weeklyCollection = source(coreRoutes[0]);
  assert.match(
    weeklyCollection,
    /POST[\s\S]*isV2FeatureEnabled\("v2WeeklyIntent"\)/,
  );
  const mutualDecision = source(coreRoutes[3]);
  assert.match(
    mutualDecision,
    /POST[\s\S]*isV2FeatureEnabled\("v2WeeklyIntent"\)[\s\S]*isV2FeatureEnabled\("v2MutualOpportunity"\)/,
  );
});
