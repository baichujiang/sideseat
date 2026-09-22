#!/usr/bin/env node

const baseURL = (process.env.SIDESEAT_QA_BASE_URL ?? "https://api.sideseat.de")
  .replace(/\/$/, "");
const password = process.env.SIDESEAT_QA_PASSWORD?.trim();
const rawIdentifiers = process.env.SIDESEAT_QA_USERS?.trim();

if (!password || !rawIdentifiers) {
  throw new Error(
    "SIDESEAT_QA_USERS and SIDESEAT_QA_PASSWORD are required for the state-changing smoke test.",
  );
}

const identifiers = rawIdentifiers
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

if (
  identifiers.length !== 2 ||
  new Set(identifiers).size !== 2 ||
  identifiers.some((identifier) => !identifier.startsWith("qa_mutual_"))
) {
  throw new Error(
    "SIDESEAT_QA_USERS must contain exactly two distinct qa_mutual_* accounts.",
  );
}

function idempotencyKey(label) {
  return `mutual-smoke-${label}-${Date.now()}-${crypto.randomUUID()}`;
}

async function request(path, options = {}) {
  const result = await rawRequest(path, options);
  if (result.status < 200 || result.status >= 300) {
    throw new Error(
      `${options.method ?? "GET"} ${path} returned ${result.status}: ${JSON.stringify(result.payload)}`,
    );
  }
  return result.payload?.data;
}

async function rawRequest(path, options = {}) {
  const response = await fetch(`${baseURL}/${path.replace(/^\//, "")}`, {
    ...options,
    headers: {
      accept: "application/json",
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.idempotency
        ? { "idempotency-key": options.idempotency }
        : {}),
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => null);
  return { status: response.status, payload };
}

async function login(identifier) {
  const data = await request("api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({
      identifier,
      password,
      device: {
        id: `mutual-smoke-${identifier}-20260831`,
        name: "Mutual Opportunity release smoke",
        appVersion: "1.0.0",
        platformVersion: "release-preflight",
      },
    }),
  });
  return { identifier, token: data.tokens.accessToken };
}

function activeIntents(payload) {
  const rows = Array.isArray(payload?.intents)
    ? payload.intents
    : payload?.intent
      ? [payload.intent]
      : [];
  return [...new Map(rows.map((intent) => [intent.id, intent])).values()];
}

async function endCurrentIntents(account) {
  const current = await request("api/v1/me/weekly-intents", {
    token: account.token,
  });
  for (const intent of activeIntents(current)) {
    await request(`api/v1/me/weekly-intents/${intent.id}`, {
      method: "DELETE",
      token: account.token,
      idempotency: idempotencyKey(`end-${account.identifier}-${intent.id}`),
      body: JSON.stringify({ expectedVersion: intent.version }),
    });
  }
}

async function createIntent(account, window) {
  const data = await request("api/v1/me/weekly-intents", {
    method: "POST",
    token: account.token,
    idempotency: idempotencyKey(`create-${account.identifier}`),
    body: JSON.stringify({
      topic: "SPORTS",
      sportTag: "BADMINTON",
      courseId: null,
      timeWindows: [window],
      timeZone: "Europe/Berlin",
      note: "Badminton Mutual Opportunity release smoke",
    }),
  });
  return data.intent;
}

async function startMatchingSession(account) {
  const session = await request("api/v1/me/together-matching-session", {
    method: "POST",
    token: account.token,
    idempotency: idempotencyKey(`start-matching-${account.identifier}`),
  });
  const durationMs =
    Date.parse(session?.matchingUntil ?? "") -
    Date.parse(session?.startedAt ?? "");
  if (
    session?.state !== "MATCHING" ||
    !session.startedAt ||
    !session.matchingUntil ||
    durationMs !== 48 * 60 * 60_000
  ) {
    throw new Error(
      `${account.identifier} did not enter a 48-hour matching session: ${JSON.stringify(session)}`,
    );
  }
  return session;
}

async function assertFlags(account) {
  const data = await request("api/v1/me/experiments", { token: account.token });
  const features = data.experiments?.[0]?.features ?? {};
  if (!features.v2WeeklyIntent || !features.v2MutualOpportunity) {
    throw new Error(
      `${account.identifier} is missing the Weekly Intent or Mutual Opportunity feature flag.`,
    );
  }
}

const accounts = await Promise.all(identifiers.map(login));
await Promise.all(accounts.map(assertFlags));
await Promise.all(accounts.map(endCurrentIntents));

const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const startAt = new Date(Date.now() + 2 * 60 * 60_000);
const endAt = new Date(Date.now() + 3 * 60 * 60_000);
const window = { startAt: startAt.toISOString(), endAt: endAt.toISOString() };
const createdIntents = await Promise.all(
  accounts.map((account) => createIntent(account, window)),
);
if (
  !createdIntents[0]?.id ||
  !createdIntents[1]?.id ||
  createdIntents[0].id === createdIntents[1].id
) {
  throw new Error("The smoke users did not receive two independent Weekly Intents.");
}

const matchingSessions = await Promise.all(
  accounts.map(startMatchingSession),
);

const firstList = await request("api/v1/me/mutual-opportunities", {
  token: accounts[0].token,
});
const opportunity = firstList.opportunities?.find(
  (item) =>
    item.state === "NEEDS_DECISION" &&
    item.topic === "SPORTS" &&
    item.sportTag === "BADMINTON",
);
if (!opportunity) {
  throw new Error(
    "No actionable mutual opportunity was generated. The QA pair may still be inside the pair cooldown; retry with two fresh SIDESEAT_QA_USERS.",
  );
}
if (opportunity.viewerIntentId !== createdIntents[0].id) {
  throw new Error("The first participant's opportunity is not linked to their own intent.");
}

const secondList = await request("api/v1/me/mutual-opportunities", {
  token: accounts[1].token,
});
const secondOpportunity = secondList.opportunities?.find(
  (item) => item.id === opportunity.id,
);
if (!secondOpportunity) {
  throw new Error("The same opportunity is not visible to both participants.");
}
if (secondOpportunity.viewerIntentId !== createdIntents[1].id) {
  throw new Error("The second participant's opportunity is not linked to their own intent.");
}

const waiting = await request(
  `api/v1/me/mutual-opportunities/${opportunity.id}/decision`,
  {
    method: "POST",
    token: accounts[0].token,
    idempotency: idempotencyKey("first-yes"),
    body: JSON.stringify({ decision: "YES" }),
  },
);
if (waiting.state !== "DECIDED" || waiting.viewerDecision !== "YES") {
  throw new Error(
    `A single YES did not remain visible as waiting: ${JSON.stringify(waiting)}`,
  );
}
const waitingList = await request("api/v1/me/mutual-opportunities", {
  token: accounts[0].token,
});
if (
  !waitingList.opportunities?.some(
    (item) => item.id === opportunity.id && item.state === "DECIDED",
  )
) {
  throw new Error("The participant who said YES cannot see the waiting opportunity.");
}
const mutual = await request(
  `api/v1/me/mutual-opportunities/${opportunity.id}/decision`,
  {
    method: "POST",
    token: accounts[1].token,
    idempotency: idempotencyKey("second-yes"),
    body: JSON.stringify({ decision: "YES" }),
  },
);
if (mutual.state !== "READY_TO_COORDINATE" || !mutual.coordination?.connectionId) {
  throw new Error("Mutual YES did not create a coordination conversation.");
}

const chat = await request(
  `api/v1/connections/${mutual.coordination.connectionId}/messages?limit=50`,
  { token: accounts[0].token },
);
if (
  !chat.messages?.some(
    (message) =>
      message.type === "MUTUAL_OPPORTUNITY_CARD" &&
      message.mutualOpportunity?.id === opportunity.id,
  )
) {
  throw new Error("The activated chat is missing its Mutual Opportunity source card.");
}

const planTitle = `Badminton mutual smoke ${runId}`;
const planBody = {
  title: planTitle,
  location: "SideSeat QA",
  message: "Production Mutual Opportunity end-to-end smoke",
  planType: "SPORTS",
  startTime: startAt.toISOString(),
  endTime: endAt.toISOString(),
  origin: {
    kind: "MUTUAL_OPPORTUNITY",
    id: opportunity.id,
  },
};
const createdPlanPayload = await request(
  `api/v1/connections/${mutual.coordination.connectionId}/plans`,
  {
    method: "POST",
    token: accounts[0].token,
    idempotency: idempotencyKey("plan-create"),
    body: JSON.stringify(planBody),
  },
);
const createdPlan = createdPlanPayload?.plan;
if (
  !createdPlan?.id ||
  createdPlan.status !== "PENDING" ||
  !createdPlan.commitmentId ||
  createdPlan.origin?.kind !== "MUTUAL_OPPORTUNITY" ||
  createdPlan.origin?.id !== opportunity.id
) {
  throw new Error(
    `The source-derived Plan was not created correctly: ${JSON.stringify(createdPlan)}`,
  );
}

const acceptedPayload = await request(
  `api/v1/plans/${createdPlan.id}/accept`,
  {
    method: "POST",
    token: accounts[1].token,
    idempotency: idempotencyKey("plan-accept"),
  },
);
const acceptedPlan = acceptedPayload?.plan;
if (
  acceptedPlan?.status !== "ACCEPTED" ||
  acceptedPlan.commitmentId !== createdPlan.commitmentId
) {
  throw new Error(
    `The Plan commitment was not confirmed: ${JSON.stringify(acceptedPlan)}`,
  );
}

const scheduleStart = new Date(startAt.getTime() - 60 * 60_000).toISOString();
const scheduleEnd = new Date(endAt.getTime() + 60 * 60_000).toISOString();
const participantIds = [
  acceptedPlan.proposer?.id,
  acceptedPlan.receiver?.id,
];
if (participantIds.some((id) => !id)) {
  throw new Error("The accepted Plan did not return both participant identities.");
}

for (let index = 0; index < accounts.length; index += 1) {
  const account = accounts[index];
  const plans = await request("api/v1/plans", { token: account.token });
  const listedPlan = plans.plans?.find((plan) => plan.id === createdPlan.id);
  if (
    listedPlan?.status !== "ACCEPTED" ||
    listedPlan.commitmentId !== createdPlan.commitmentId
  ) {
    throw new Error(`${account.identifier} cannot see the confirmed commitment.`);
  }

  const schedule = await request(
    `api/v1/home/schedule?windowStart=${encodeURIComponent(scheduleStart)}&windowEnd=${encodeURIComponent(scheduleEnd)}`,
    { token: account.token },
  );
  const projection = schedule.studyEntries?.find(
    (entry) =>
      entry.title === planTitle &&
      entry.startISO === startAt.toISOString() &&
      entry.endISO === endAt.toISOString(),
  );
  const peerId = participantIds[index === 0 ? 1 : 0];
  if (
    !projection ||
    !projection.eventParticipants?.some((participant) => participant.userId === peerId)
  ) {
    throw new Error(`${account.identifier} is missing the confirmed Calendar projection.`);
  }
}

for (let index = 0; index < accounts.length; index += 1) {
  const account = accounts[index];
  const currentIntents = await request("api/v1/me/weekly-intents", {
    token: account.token,
  });
  if (
    activeIntents(currentIntents).some(
      (intent) => intent.id === createdIntents[index].id,
    )
  ) {
    throw new Error(`${account.identifier}'s source Weekly Intent is still active.`);
  }

  const currentOpportunities = await request(
    "api/v1/me/mutual-opportunities",
    { token: account.token },
  );
  if (
    currentOpportunities.opportunities?.some(
      (candidate) => candidate.id === opportunity.id,
    )
  ) {
    throw new Error(`${account.identifier} still sees the arranged opportunity as current.`);
  }
}

const duplicate = await rawRequest(
  `api/v1/connections/${mutual.coordination.connectionId}/plans`,
  {
    method: "POST",
    token: accounts[0].token,
    idempotency: idempotencyKey("plan-duplicate"),
    body: JSON.stringify(planBody),
  },
);
if (
  duplicate.status !== 409 ||
  duplicate.payload?.error?.code !== "INVALID_REQUEST"
) {
  throw new Error(
    `A duplicate Plan from the arranged opportunity was not rejected with 409: ${JSON.stringify(duplicate)}`,
  );
}

console.log(
  JSON.stringify(
    {
      status: "PASS",
      baseURL,
      accounts: identifiers,
      flags: ["v2WeeklyIntent", "v2MutualOpportunity"],
      opportunityState: mutual.state,
      concreteActivity: opportunity.sportTag,
      matchingSessionsStarted: matchingSessions.length,
      singleYesWaitingVisible: true,
      conversationCreated: true,
      sourceCardPresent: true,
      planId: createdPlan.id,
      commitmentId: createdPlan.commitmentId,
      commitmentConfirmed: true,
      calendarProjections: 2,
      sourceIntentsEnded: 2,
      currentOpportunityRemoved: true,
      duplicateSourcePlanRejected: true,
    },
    null,
    2,
  ),
);
