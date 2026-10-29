import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

// A local, disposable browser/native interoperability run. Never seed production.
const origin = process.env.WEB_QA_ORIGIN ?? "http://127.0.0.1:3344";
assert(
  ["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname),
  "This smoke run is local-only.",
);
const directory = process.env.WEB_QA_DIRECTORY;
assert(directory, "Set WEB_QA_DIRECTORY to a private temporary directory.");
await mkdir(directory, { recursive: true, mode: 0o700 });
const key = randomUUID().replaceAll("-", "").slice(0, 10);
const password = `Local-Web-QA-${randomUUID()}!`;
const checks = [];
const accounts = [];
const capability = {
  "X-SideSeat-Persistent-Intent": "1",
  "X-SideSeat-Flexible-Timing": "1",
  "X-SideSeat-Discovery-Matching": "1",
};
async function request(path, credential = {}, method = "GET", body) {
  const response = await fetch(origin + path, {
    method,
    headers: {
      ...capability,
      ...credential,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(method !== "GET" ? { "Idempotency-Key": randomUUID() } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  assert(
    response.ok,
    `${method} ${path}: ${response.status} ${JSON.stringify(payload.error)}`,
  );
  return { data: payload.data, response };
}
try {
  for (let index = 0; index < 2; index++) {
    const username = `webqa_${key}_${index}`;
    const { data, response } = await request("/api/auth/signup", {}, "POST", {
      displayName: index ? "同行测试同学" : "网页测试同学",
      username,
      password,
      school: "TUM",
      studentStatus: "CURRENT_STUDENT",
      degreeLevel: "MASTER",
      semester: 3,
    });
    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    const native = (
      await request("/api/v1/auth/login", {}, "POST", {
        identifier: username,
        password,
        device: {
          id: `web-qa-${key}-${index}`,
          name: "Web interoperability QA",
          appVersion: "260",
          platformVersion: "test",
        },
      })
    ).data;
    const account = {
      id: data.userId,
      username,
      password,
      cookie,
      nativeToken: native.tokens.accessToken,
    };
    accounts.push(account);
    assert.equal(native.user.id, data.userId);
    const browserProfile = (await request("/api/v1/me", { Cookie: cookie }))
      .data;
    const nativeProfile = (
      await request("/api/v1/me", {
        Authorization: `Bearer ${account.nativeToken}`,
      })
    ).data;
    assert.equal(browserProfile.id, nativeProfile.id);
    checks.push(`account-${index}: shared browser/native identity`);
  }
  await writeFile(
    `${directory}/accounts.private.json`,
    JSON.stringify(accounts),
    { mode: 0o600 },
  );
  const owner = { Cookie: accounts[0].cookie },
    native = { Authorization: `Bearer ${accounts[0].nativeToken}` },
    peer = { Authorization: `Bearer ${accounts[1].nativeToken}` };
  await request("/api/v1/me/profile", owner, "PATCH", {
    bio: "在网页填写，在手机继续。",
  });
  assert.equal(
    (await request("/api/v1/me", native)).data.tagline,
    "在网页填写，在手机继续。",
  );
  checks.push("profile: browser write → native read");
  const intent = (
    await request("/api/v1/me/weekly-intents", owner, "POST", {
      topic: "COFFEE",
      activityText: "下课一起喝咖啡",
      timeZone: "Europe/Berlin",
      timePreference: { kind: "UNDECIDED" },
      timeWindows: [],
      note: "网页和手机共享的意愿",
      exploreVisible: true,
      automaticMatching: true,
    })
  ).data.intent;
  assert(
    (await request("/api/v1/me/weekly-intents", native)).data.intents.some(
      (row) => row.id === intent.id,
    ),
  );
  checks.push("intention: browser write → native read");
  await request(`/api/v1/me/weekly-intents/${intent.id}`, native, "PATCH", {
    action: "EDIT",
    expectedVersion: intent.version,
    note: "手机侧更新的意愿",
  });
  assert(
    (await request("/api/v1/me/weekly-intents", owner)).data.intents.some(
      (row) => row.id === intent.id && row.note === "手机侧更新的意愿",
    ),
  );
  checks.push("intention: native write → browser read");
  const day = new Date(Date.now() + 3 * 86400000);
  day.setUTCHours(12, 0, 0, 0);
  const end = new Date(day.getTime() + 3600000);
  const windowStart = new Date(day.getTime() - 86400000).toISOString(),
    windowEnd = new Date(day.getTime() + 7 * 86400000).toISOString();
  const schedulePath = `/api/v1/home/schedule?windowStart=${windowStart}&windowEnd=${windowEnd}`;
  await request("/api/v1/calendar/events", owner, "POST", {
    title: "网页端自习安排",
    startAt: day.toISOString(),
    endAt: end.toISOString(),
    repeat: "NONE",
    withUserIds: [],
  });
  assert(
    (await request(schedulePath, native)).data.studyEntries.some(
      (row) => row.title === "网页端自习安排",
    ),
  );
  checks.push("calendar: browser write → native read");
  await request("/api/v1/calendar/events", native, "POST", {
    title: "手机端散步安排",
    startAt: end.toISOString(),
    endAt: new Date(end.getTime() + 3600000).toISOString(),
    repeat: "NONE",
    withUserIds: [],
  });
  assert(
    (await request(schedulePath, owner)).data.studyEntries.some(
      (row) => row.title === "手机端散步安排",
    ),
  );
  checks.push("calendar: native write → browser read");
  const poll = (
    await request("/api/v1/time-polls", owner, "POST", {
      title: "一起去美术馆",
      location: "慕尼黑",
      timeZone: "Europe/Berlin",
      dates: [day.toISOString().slice(0, 10)],
      startMinute: 540,
      endMinute: 1260,
      planningMode: "COLLECT",
    })
  ).data;
  const nativePoll = (await request(`/api/v1/time-polls/${poll.token}`, native))
    .data;
  assert.equal(nativePoll.token, poll.token);
  await request(`/api/v1/time-polls/${poll.token}/response`, native, "PUT", {
    displayName: "网页测试同学",
    slotIds: [0, 1, 2, 3],
  });
  assert.deepEqual(
    (await request(`/api/v1/time-polls/${poll.token}`, owner)).data.mySlotIds,
    [0, 1, 2, 3],
  );
  checks.push("plan: shared token, native availability → browser read");
  const connection = (
    await request("/api/v1/contacts", owner, "POST", { peerId: accounts[1].id })
  ).data;
  const cid = connection.connectionId;
  await request(`/api/v1/connections/${cid}/messages`, owner, "POST", {
    type: "TEXT",
    body: "周末一起逛美术馆？",
  });
  assert(
    (
      await request(`/api/v1/connections/${cid}/messages`, peer)
    ).data.messages.some((row) => row.body === "周末一起逛美术馆？"),
  );
  checks.push("chat: browser send → peer native receive");
  await request(`/api/v1/connections/${cid}/messages`, peer, "POST", {
    type: "TEXT",
    body: "好呀，在手机端收到啦。",
  });
  assert(
    (
      await request(`/api/v1/connections/${cid}/messages`, owner)
    ).data.messages.some((row) => row.body === "好呀，在手机端收到啦。"),
  );
  checks.push("chat: peer native send → browser receive");
  const direct = (
    await request(`/api/v1/connections/${cid}/plans`, owner, "POST", {
      title: "一起喝咖啡",
      startTime: new Date(day.getTime() + 2 * 3600000).toISOString(),
      endTime: new Date(day.getTime() + 3 * 3600000).toISOString(),
      location: "校园咖啡馆",
      planType: "CUSTOM",
    })
  ).data.plan;
  await request(`/api/v1/plans/${direct.id}/accept`, peer, "POST", {});
  assert.equal(
    (await request("/api/v1/plans", owner)).data.plans.find(
      (row) => row.id === direct.id,
    ).status,
    "ACCEPTED",
  );
  assert.equal(
    (await request(schedulePath, owner)).data.studyEntries.filter(
      (row) => row.title === "一起喝咖啡",
    ).length,
    1,
  );
  assert.equal(
    (await request(schedulePath, peer)).data.studyEntries.filter(
      (row) => row.title === "一起喝咖啡",
    ).length,
    1,
  );
  checks.push(
    "plan: browser invite → peer native accept → exactly one calendar per participant",
  );
  await writeFile(
    `${directory}/context.private.json`,
    JSON.stringify({
      connectionId: cid,
      pollToken: poll.token,
      intentId: intent.id,
      day: day.toISOString(),
    }),
    { mode: 0o600 },
  );
  await writeFile(
    `${directory}/result.json`,
    JSON.stringify(
      { passed: true, checks, environment: "local", physicalDeviceTest: false },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      passed: true,
      checks,
      accountUsernames: accounts.map((row) => row.username),
      privateDirectory: directory,
    }),
  );
} catch (error) {
  await writeFile(
    `${directory}/accounts.private.json`,
    JSON.stringify(accounts),
    { mode: 0o600 },
  );
  console.error(error.message);
  process.exitCode = 1;
}
