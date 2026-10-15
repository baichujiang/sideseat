import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
const base = process.env.SIDESEAT_UNIFIED_PLAN_QA_API;
const accountPath = process.env.SIDESEAT_UNIFIED_PLAN_QA_ACCOUNTS;
assert(base && accountPath, "Set the verified deployment and private QA accounts file");
const accounts = JSON.parse(fs.readFileSync(accountPath, "utf8"));
assert.equal(accounts.length, 5);
assert(accounts.every(a => /^pollqa_u100[a-z0-9]+_[0-4]$/.test(a.identifier)));
const protectedDeployment = process.env.SIDESEAT_UNIFIED_PLAN_USE_VERCEL_CURL === "1";
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sideseat-unified-http-"));
fs.chmodSync(temporary, 0o700);
const auth = [], polls = [], checks = [];
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

async function data(route, options, expected = 200) {
  const response = await request(route, options);
  assert.equal(response.status, expected, `${options?.method ?? "GET"} ${route.split("/").slice(0, 4).join("/")}`);
  return response.json().data;
}
try {
  for (const route of ["/api/v1/client-config", "/.well-known/apple-app-site-association", "/privacy", "/support"]) assert.equal((await request(route)).status, 200);
  for (const [n, account] of accounts.entries()) {
    const login = await data("/api/v1/auth/login", { method: "POST", body: { identifier: account.identifier, password: account.password, device: { id: randomUUID(), name: `Preview100 QA ${n}`, appVersion: "1.0.0", platformVersion: "26.0" } } });
    auth.push(login.tokens.accessToken);
  }
  const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const input = { title: "Preview 100 isolated unified plan QA", location: "Library", timeZone: "Europe/Berlin", dates: [date], startMinute: 540, endMinute: 720, durationMinutes: 60, expectedCount: 5, planningMode: "COLLECT" };
  const create = async extra => {
    const poll = await data("/api/v1/time-polls", { method: "POST", auth: auth[0], key: randomUUID(), body: { ...input, ...extra } }, 201);
    polls.push(poll.token); return poll;
  };
  let poll = await create();
  const route = `/api/v1/time-polls/${poll.token}`;
  for (let n = 0; n < 5; n++) poll = await data(route + "/response", { method: "PUT", auth: auth[n], body: { displayName: `Person ${n + 1}`, slotIds: [0, 1, 2, 3] } });
  assert.equal(poll.summary.common, true); assert.equal(poll.summary.maximum, 5);
  poll = await data(route + "/response", { method: "PUT", auth: auth[4], body: { displayName: "Person 5", slotIds: [] } });
  assert.equal(poll.summary.common, false); assert.equal(poll.summary.maximum, 4);
  for (let n = 0; n < 5; n++) {
    const saved = await data(route, { auth: auth[n] });
    assert.deepEqual(saved.mySlotIds, n === 4 ? [] : [0, 1, 2, 3]);
    assert((await data("/api/v1/time-polls", { auth: auth[n] })).polls.some(p => p.token === poll.token));
  }
  checks.push("five saved responses, 5/5 common, 4/5 maximum, five-account reopen/list");
  poll = await data(route + "/invitations", { method: "POST", auth: auth[0], body: { version: 0, start: poll.slots[0].start, attendeeIds: poll.summary.windows[0].attendeeIds } });
  assert.equal(poll.invitations.length, 4);
  assert.equal((await request(route + "/invitation-response", { method: "PUT", auth: auth[4], body: { version: 1, status: "ACCEPTED" } })).status, 403);
  const schedule = async n => (await data(`/api/v1/home/schedule?windowStart=${date}T00:00:00Z&windowEnd=${date}T23:59:59Z`, { auth: auth[n] })).studyEntries.filter(e => e.timePollToken === poll.token);
  assert.equal((await schedule(0)).length, 0);
  for (let n = 1; n < 4; n++) {
    poll = await data(route + "/invitation-response", { method: "PUT", auth: auth[n], body: { version: 1, status: "ACCEPTED" } });
    assert.equal(poll.phase, n === 3 ? "CONFIRMED" : "INVITING");
  }
  for (let n = 0; n < 5; n++) {
    const entries = await schedule(n); assert.equal(entries.length, n === 4 ? 0 : 1);
    if (n < 4) {
      assert.equal(entries[0].eventParticipants.length, 3);
      const search = await data(`/api/v1/calendar/search?q=${encodeURIComponent(input.title)}`, { auth: auth[n] });
      assert(search.results.some(e => e.id === entries[0].id && e.timePollToken === poll.token));
      assert.equal((await request(`/api/v1/calendar/events/${entries[0].id}`, { method: "DELETE", auth: auth[n], key: randomUUID() })).status, 404);
    }
  }
  checks.push("explicit four-person invitation, excluded fifth, individual confirmation, four calendar/search projections, read-only shared facts");
  await data(route + "/cancel", { method: "POST", auth: auth[0], body: { version: 1 } });
  for (let n = 0; n < 5; n++) assert.equal((await schedule(n)).length, 0);
  const direct = await create({ title: "Preview100 direct-time QA", planningMode: "FIXED", fixedStart: `${date}T12:00:00Z` });
  assert.equal(direct.invitations[0].status, "ACCEPTED");
  for (let n = 1; n < 5; n++) {
    const accepted = await data(`/api/v1/time-polls/${direct.token}/invitation-response`, { method: "PUT", auth: auth[n], body: { version: 1, status: "ACCEPTED" } });
    assert.equal(accepted.phase, n === 4 ? "CONFIRMED" : "INVITING");
  }
  checks.push("direct-time five-person invitation completes the same lifecycle; cancellation cleans all projections");
  console.log(JSON.stringify({ base, passed: true, checks }, null, 2));
} finally {
  for (const token of polls) {
    await request(`/api/v1/time-polls/${token}/cancel`, { method: "POST", auth: auth[0], body: { version: 1 } });
    const removed = await request(`/api/v1/time-polls/${token}`, { method: "DELETE", auth: auth[0] });
    assert.equal(removed.status, 200);
  }
  fs.rmSync(temporary, { recursive: true, force: true });
}
