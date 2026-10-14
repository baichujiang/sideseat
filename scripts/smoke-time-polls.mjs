import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const base = process.env.SIDESEAT_TIME_POLL_QA_API;
const accountPath = process.env.SIDESEAT_TIME_POLL_QA_ACCOUNTS;
if (!base || !accountPath) throw new Error("Set the verified API and private five-account QA file.");
const accounts = JSON.parse(fs.readFileSync(accountPath, "utf8"));
assert.equal(accounts.length, 5);
assert(accounts.every((account) => /^pollqa_[a-z0-9]+_[0-4]$/.test(account.identifier)));
const protectedDeployment = process.env.SIDESEAT_TIME_POLL_USE_VERCEL_CURL === "1";
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sideseat-poll-http-"));
fs.chmodSync(temporary, 0o700);
const checks = [];
let pollToken, ownerAuth;

async function request(route, { method = "GET", auth, body, key } = {}) {
  let status, text;
  if (protectedDeployment) {
    const bodyPath = path.join(temporary, "body.json"), configPath = path.join(temporary, "request.cfg");
    const config = [`request = ${JSON.stringify(method)}`, 'header = "Content-Type: application/json"'];
    if (auth) config.push(`header = ${JSON.stringify("Authorization: Bearer " + auth)}`);
    if (key) config.push(`header = ${JSON.stringify("Idempotency-Key: " + key)}`);
    if (body) { fs.writeFileSync(bodyPath, JSON.stringify(body), { mode: 0o600 }); config.push(`data-binary = ${JSON.stringify("@" + bodyPath)}`); }
    fs.writeFileSync(configPath, config.join("\n") + "\n", { mode: 0o600 });
    const result = spawnSync("vercel", ["curl", route, "--deployment", base, "--", "--config", configPath, "--silent", "--show-error", "--write-out", "\n%{http_code}"], { encoding: "utf8" });
    if (result.status !== 0) throw new Error(`Protected request failed: ${method} ${route.split("/").slice(0, 4).join("/")}`);
    const last = result.stdout.lastIndexOf("\n"); status = Number(result.stdout.slice(last + 1)); text = result.stdout.slice(0, last);
  } else {
    const headers = { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...(key ? { "Idempotency-Key": key } : {}) };
    const response = await fetch(base + route, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
    status = response.status; text = await response.text();
  }
  return { status, text, json: () => JSON.parse(text) };
}

try {
  for (const route of ["/api/v1/client-config", "/.well-known/apple-app-site-association", "/privacy", "/support"]) {
    const result = await request(route); assert.equal(result.status, 200); checks.push({ route, status: result.status });
    if (route.includes("apple-app")) {
      const details = result.json().applinks.details;
      assert(details.some((entry) => entry.appIDs.includes("V4238R5R53.app.sideseat.mobile.preview") && entry.components.some((component) => component["/"] === "/time-polls/*")));
    }
    if (route === "/privacy") assert(result.text.includes("names and availability in time polls"));
  }
  const auth = [];
  for (const [index, account] of accounts.entries()) {
    const login = await request("/api/v1/auth/login", { method: "POST", body: { identifier: account.identifier, password: account.password, device: { id: "poll-smoke-" + index, name: "Native time poll QA", appVersion: "1.0.0", platformVersion: "26.0" } } });
    assert.equal(login.status, 200); auth.push(login.json().data.tokens.accessToken);
  }
  ownerAuth = auth[0];
  const key = "native-poll-smoke-" + Date.now();
  const input = { title: "Native five-person release QA", timeZone: "Europe/Berlin", dates: ["2026-10-16"], startMinute: 540, endMinute: 1020 };
  const created = await request("/api/v1/time-polls", { method: "POST", auth: ownerAuth, key, body: input });
  assert.equal(created.status, 201); const poll = created.json().data; pollToken = poll.token;
  assert.equal(poll.slots.length, 32);
  const replay = await request("/api/v1/time-polls", { method: "POST", auth: ownerAuth, key, body: input });
  assert.equal(replay.json().data.token, pollToken);
  const handoff = await request(`/time-polls/${pollToken}`);
  assert.equal(handoff.status, 200); assert(handoff.text.includes(`sideseat://time-polls/${pollToken}`)); assert(!handoff.text.includes("Person 1"));
  const selections = auth.map((_, index) => [0, 1, 2, 3, 4 + index]);
  for (const [index, bearer] of auth.entries()) {
    const saved = await request(`/api/v1/time-polls/${pollToken}/response`, { method: "PUT", auth: bearer, body: { displayName: "Person " + (index + 1), slotIds: selections[index] } });
    assert.equal(saved.status, 200); assert.deepEqual(saved.json().data.mySlotIds, selections[index]);
  }
  const common = (await request(`/api/v1/time-polls/${pollToken}`, { auth: ownerAuth })).json().data.summary;
  assert.equal(common.common, true); assert.equal(common.maximum, 5); assert.equal(common.windows.length, 1);
  assert.equal(common.windows[0].start, poll.slots[0].start); assert.equal(common.windows[0].end, poll.slots[3].end);
  selections[4] = [8];
  const erased = await request(`/api/v1/time-polls/${pollToken}/response`, { method: "PUT", auth: auth[4], body: { displayName: "Person 5", slotIds: selections[4] } });
  assert.equal(erased.status, 200); const best = erased.json().data.summary;
  assert.equal(best.common, false); assert.equal(best.maximum, 4); assert.equal(best.participantCount, 5);
  for (const [index, bearer] of auth.entries()) {
    const reopened = (await request(`/api/v1/time-polls/${pollToken}`, { auth: bearer })).json().data;
    assert.deepEqual(reopened.mySlotIds, selections[index]); assert.equal(reopened.myDisplayName, "Person " + (index + 1)); assert.equal(reopened.summary.maximum, 4);
    const list = (await request("/api/v1/time-polls", { auth: bearer })).json().data;
    assert(list.polls.some((item) => item.token === pollToken));
  }
  assert.equal((await request(`/api/v1/time-polls/${pollToken}`)).status, 401);
  assert.equal((await request(`/api/v1/time-polls/${pollToken}`, { method: "DELETE", auth: auth[1] })).status, 404);
  checks.push({ flow: "five accounts create/paint/erase/reopen", common: 5, best: 4, respondents: 5, idempotent: true, privateBrowserHandoff: true });
  console.log(JSON.stringify({ base, passed: true, checks }, null, 2));
} finally {
  if (pollToken && ownerAuth) {
    const deleted = await request(`/api/v1/time-polls/${pollToken}`, { method: "DELETE", auth: ownerAuth });
    assert.equal(deleted.status, 200);
  }
  fs.rmSync(temporary, { recursive: true, force: true });
}
