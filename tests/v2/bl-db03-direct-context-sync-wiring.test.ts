import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

test("every legacy Connection terminal path uses the DIRECT compatibility synchronizer", async () => {
  const synchronizerOwners = [
    "lib/api/v1/connection-actions-service.ts",
    "app/api/connections/[connectionId]/end/route.ts",
    "lib/api/v1/connection-block-transaction.ts",
    "lib/connections/moderation-block-transaction.ts",
  ];
  const sources = await Promise.all(
    synchronizerOwners.map(async (file) => ({
      file,
      source: await readFile(join(root, file), "utf8"),
    })),
  );

  for (const { file, source } of sources) {
    assert.match(
      source,
      /terminalizeConnection(?:s)?AndDirectV1Contexts/,
      file,
    );
  }

  const pairBlock = await readFile(
    join(root, "lib/api/v1/pair-block-transaction.ts"),
    "utf8",
  );
  assert.match(pairBlock, /convergeLockedPairPeerBlock/);

  const webBlock = await readFile(
    join(root, "app/api/blocks/route.ts"),
    "utf8",
  );
  assert.match(webBlock, /installPairPeerBlock/);
  assert.doesNotMatch(
    webBlock,
    /tx\.connection\.update/,
  );

  const adminBlock = await readFile(
    join(root, "app/api/admin/reports/[reportId]/block/route.ts"),
    "utf8",
  );
  assert.match(adminBlock, /installUserModerationBlock/);
  assert.doesNotMatch(
    adminBlock,
    /tx\.connection\.updateMany/,
  );
});

test("DIRECT compatibility sync locks Context before Connection", async () => {
  const source = await readFile(
    join(root, "lib/v2/direct-v1-context-sync.ts"),
    "utf8",
  );
  const contextLock = source.indexOf("FOR UPDATE OF context");
  const connectionLock = source.indexOf(
    "const locked = await tx.$queryRaw<ConnectionSnapshot[]>",
  );
  assert.notEqual(contextLock, -1);
  assert.notEqual(connectionLock, -1);
  assert.ok(
    contextLock < connectionLock,
    "Context must be locked before Connection in the global row-lock order",
  );
});

test("native Block is status-agnostic and installs its barrier inside the terminal transaction", async () => {
  const source = await readFile(
    join(root, "lib/api/v1/connection-actions-service.ts"),
    "utf8",
  );
  const start = source.indexOf("export async function blockConnectionPeer");
  const end = source.indexOf("export async function patchContactRemark", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const blockSource = source.slice(start, end);

  assert.match(blockSource, /prisma\.\$transaction/);
  assert.match(blockSource, /installConnectionPeerBlock/);
  assert.doesNotMatch(blockSource, /requireActiveConnection/);
});
