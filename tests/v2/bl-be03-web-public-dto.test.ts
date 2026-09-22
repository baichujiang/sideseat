import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { DiscoverPostClientRow } from "@/lib/discover/discover-post-row";

const RAW_ACTION_POLICY_FIELDS = [
  "coordinationPolicy",
  "policySchemaVersion",
  "policyParametersSnapshot",
  "experimentKeySnapshot",
  "experimentVariantSnapshot",
  "clientCapabilitySnapshot",
  "policySnapshottedAt",
] as const;

type RawActionPolicyField = (typeof RAW_ACTION_POLICY_FIELDS)[number];
type LeakedClientField = Extract<keyof DiscoverPostClientRow, RawActionPolicyField>;

// Compile-time regression: adding any raw Action policy field to the public
// client DTO changes this type from `true` and fails `tsc`.
const clientDtoHasNoRawActionPolicyFields: LeakedClientField extends never
  ? true
  : false = true;

async function source(path: string): Promise<string> {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("Web public Discover DTO strips raw policy snapshots at server boundaries", async () => {
  assert.equal(clientDtoHasNoRawActionPolicyFields, true);

  const mapper = await source("lib/discover/public-discover-post-row.ts");
  assert.match(mapper, /^import "server-only";/);
  assert.match(
    mapper,
    /allowsLegacyDirectConversation:\s*[\s\S]*allowsLegacyDirectConversationForAction\(policyTuple\)/,
  );
  for (const field of RAW_ACTION_POLICY_FIELDS) {
    assert.match(mapper, new RegExp(`\\b${field},`));
  }

  const discoverPage = await source("app/(app)/discover/page.tsx");
  const savedPostsPage = await source(
    "app/(app)/profile/saved-posts/page.tsx",
  );
  const myPostsPage = await source("app/(app)/profile/my-posts/page.tsx");
  const savedPostsRoute = await source(
    "app/api/classmate-posts/saved/route.ts",
  );
  const createPostRoute = await source("app/api/classmate-posts/route.ts");
  for (const boundary of [
    discoverPage,
    savedPostsPage,
    myPostsPage,
    savedPostsRoute,
  ]) {
    assert.match(boundary, /toPublicDiscoverPostRow/);
  }
  assert.match(createPostRoute, /withoutRawActionPolicySnapshots\(post\)/);
});

test("Discover client components consume only the bounded server decision", async () => {
  const clientFiles = await Promise.all(
    [
      "components/discover/discover-list.tsx",
      "components/discover/discover-post-card.tsx",
      "components/discover/buddy-request-card.tsx",
      "components/discover/discover-feed.tsx",
      "components/profile/saved-posts-buddy-feed.tsx",
      "components/profile/my-post-buddy-card.tsx",
    ].map(source),
  );

  for (const clientFile of clientFiles) {
    assert.doesNotMatch(
      clientFile,
      /action-coordination\/policy-snapshot/,
    );
    for (const field of RAW_ACTION_POLICY_FIELDS) {
      assert.doesNotMatch(clientFile, new RegExp(`\\b${field}\\b`));
    }
  }

  assert.match(
    clientFiles[1],
    /post\.allowsLegacyDirectConversation\s*\?\s*\([\s\S]*<DiscoverMessageButton/,
  );
  assert.match(
    clientFiles[2],
    /showDefaultMessage\s*=[\s\S]*post\.allowsLegacyDirectConversation/,
  );
});

test("native serializer retains the complete server-side policy tuple", async () => {
  const prismaMapper = await source(
    "lib/discover/prisma-classmate-post-for-discover.ts",
  );
  const nativeService = await source("lib/api/v1/discover-service.ts");

  assert.match(prismaMapper, /^import "server-only";/);
  for (const field of RAW_ACTION_POLICY_FIELDS) {
    assert.match(
      prismaMapper,
      new RegExp(`${field}:\\s*post\\.${field}`),
    );
  }
  assert.match(
    nativeService,
    /coordination:\s*actionCoordinationReadModel\(\{[\s\S]*action:\s*row/,
  );
});
