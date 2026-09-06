import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = process.cwd();

test("generic direct-message deletion excludes server-owned workflow cards", async () => {
  const route = await readFile(
    `${root}/app/api/connections/[connectionId]/messages/[messageId]/route.ts`,
    "utf8",
  );
  assert.match(route, /MessageType\.TEXT/);
  assert.match(route, /MessageType\.IMAGE/);
  assert.match(route, /MessageType\.LOCATION/);
  assert.doesNotMatch(route, /MessageType\.PLAN_REQUEST_CARD/);
  assert.doesNotMatch(route, /MessageType\.PLAN_CONFIRMED_CARD/);
});

test("iOS exposes generic deletion only for user-authored content", async () => {
  const models = await readFile(
    `${root}/ios-native/SideSeat/Features/Chat/ChatModels.swift`,
    "utf8",
  );
  const store = await readFile(
    `${root}/ios-native/SideSeat/Features/Chat/DirectChatStore.swift`,
    "utf8",
  );
  const view = await readFile(
    `${root}/ios-native/SideSeat/Features/Chat/DirectChatView.swift`,
    "utf8",
  );

  assert.match(
    models,
    /var supportsUserDeletion:[\s\S]*type == "TEXT" \|\| type == "IMAGE" \|\| type == "LOCATION"/,
  );
  assert.match(store, /existing\.supportsUserDeletion/);
  assert.match(view, /isMine && message\.supportsUserDeletion/);
});
