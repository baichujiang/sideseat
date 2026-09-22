import { expect, test, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { assertLocalTestDatabase } from "./helpers/local-test-database";

assertLocalTestDatabase();
const prisma = new PrismaClient();
const E2E_USER = process.env.E2E_USER ?? "test_001";
const E2E_PEER = process.env.E2E_PEER ?? "test_002";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "Password123";
const IP = `198.51.100.${(process.pid % 200) + 80}`;
const device = {
  id: "playwright-ios-schedule-share-device",
  name: "Playwright Schedule Share iPhone",
  appVersion: "1.0.0",
  platformVersion: "17.0",
};

let userId = "";
let peerId = "";
let connectionId = "";
let createdLinkId = "";
let standaloneLinkId = "";
let createdMessageId = "";

async function accessToken(request: APIRequestContext, identifier = E2E_USER) {
  const response = await request.post("/api/v1/auth/login", {
    headers: { "x-forwarded-for": IP },
    data: {
      identifier,
      password: E2E_PASSWORD,
      device: { ...device, id: `${device.id}-${identifier}` },
    },
  });
  expect(response.status()).toBe(200);
  const payload = (await response.json()) as { data: { tokens: { accessToken: string } } };
  return payload.data.tokens.accessToken;
}

test.beforeAll(async () => {
  const users = await prisma.user.findMany({
    where: { username: { in: [E2E_USER, E2E_PEER] } },
    select: { id: true, username: true },
  });
  const byUsername = new Map(users.map((user) => [user.username, user.id]));
  userId = byUsername.get(E2E_USER) ?? "";
  peerId = byUsername.get(E2E_PEER) ?? "";
  if (!userId || !peerId) throw new Error("Seeded schedule-share users missing.");

  const connection = await prisma.connection.findFirst({
    where: {
      OR: [
        { userAId: userId, userBId: peerId },
        { userAId: peerId, userBId: userId },
      ],
    },
    select: { id: true },
  });
  if (!connection) throw new Error("Seeded connection missing.");
  connectionId = connection.id;

  await prisma.connection.update({
    where: { id: connectionId },
    data: { status: "ACTIVE", endedAt: null, endedById: null },
  });
});

test.afterAll(async () => {
  if (createdMessageId) {
    await prisma.message.deleteMany({ where: { id: createdMessageId } });
  }
  if (createdLinkId) {
    await prisma.scheduleShareLink.deleteMany({ where: { id: createdLinkId } });
  }
  if (standaloneLinkId) {
    await prisma.scheduleShareLink.deleteMany({ where: { id: standaloneLinkId } });
  }
  await prisma.$disconnect();
});

test("creates a standalone schedule link without posting a chat message", async ({ request }) => {
  const ownerToken = await accessToken(request, E2E_USER);
  const start = new Date(Date.now() + 24 * 60 * 60_000);
  const end = new Date(start.getTime() + 3 * 24 * 60 * 60_000);
  const messagesBefore = await prisma.message.count({
    where: { connectionId, type: "SCHEDULE_SHARE_CARD" },
  });

  const create = await request.post("/api/v1/schedule-shares", {
    headers: {
      Authorization: `Bearer ${ownerToken}`,
      "Idempotency-Key": `standalone-schedule-share-${Date.now()}`,
      "x-forwarded-for": IP,
    },
    data: {
      rangeStart: start.toISOString(),
      rangeEnd: end.toISOString(),
      revealConfig: {
        categoryIds: [],
        presetKeys: [],
        hideAllDetails: true,
        includedDates: [],
      },
      allowGuestProposals: true,
      usageLimit: "UNLIMITED",
      expiresAt: end.toISOString(),
    },
  });

  expect(create.status()).toBe(201);
  const created = (await create.json()) as {
    data: { shareUrl: string; token: string | null; linkId: string };
  };
  expect(created.data.shareUrl).toContain("/share/view/");
  expect(created.data.token).toBeTruthy();
  standaloneLinkId = created.data.linkId;

  const ownerSettings = await request.get(
    `/api/v1/schedule-shares/owner/${standaloneLinkId}`,
    { headers: { Authorization: `Bearer ${ownerToken}`, "x-forwarded-for": IP } },
  );
  expect(ownerSettings.status()).toBe(200);
  const initialOwnerPayload = (await ownerSettings.json()) as {
    data: {
      linkId: string;
      pendingProposalCount: number;
      isUpdated: boolean;
      settings: {
        rangeStart: string;
        rangeEnd: string;
        allowGuestProposals: boolean;
        usageLimit: string;
      };
    };
  };
  expect(initialOwnerPayload.data.linkId).toBe(standaloneLinkId);
  expect(initialOwnerPayload.data.pendingProposalCount).toBe(0);
  expect(initialOwnerPayload.data.isUpdated).toBe(false);
  expect(initialOwnerPayload.data.settings.usageLimit).toBe("UNLIMITED");

  const peerToken = await accessToken(request, E2E_PEER);
  const hiddenFromPeer = await request.get(
    `/api/v1/schedule-shares/owner/${standaloneLinkId}`,
    { headers: { Authorization: `Bearer ${peerToken}`, "x-forwarded-for": IP } },
  );
  expect(hiddenFromPeer.status()).toBe(404);

  const updatedStart = new Date(start.getTime() + 24 * 60 * 60_000);
  const updatedEnd = new Date(end.getTime() + 24 * 60 * 60_000);
  const update = await request.patch(
    `/api/v1/schedule-shares/owner/${standaloneLinkId}`,
    {
      headers: { Authorization: `Bearer ${ownerToken}`, "x-forwarded-for": IP },
      data: {
        rangeStart: updatedStart.toISOString(),
        rangeEnd: updatedEnd.toISOString(),
        revealConfig: {
          categoryIds: [],
          presetKeys: [],
          hideAllDetails: true,
          includedDates: [updatedStart.toISOString().slice(0, 10)],
        },
        allowGuestProposals: false,
        usageLimit: "UNLIMITED",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(),
      },
    },
  );
  expect(update.status()).toBe(200);
  const updatedPayload = (await update.json()) as {
    data: {
      linkId: string;
      isUpdated: boolean;
      settings: {
        rangeStart: string;
        rangeEnd: string;
        allowGuestProposals: boolean;
        revealConfig: { includedDates: string[] };
      };
    };
  };
  expect(updatedPayload.data.linkId).toBe(standaloneLinkId);
  expect(updatedPayload.data.isUpdated).toBe(true);
  expect(updatedPayload.data.settings.rangeStart).toBe(updatedStart.toISOString());
  expect(updatedPayload.data.settings.rangeEnd).toBe(updatedEnd.toISOString());
  expect(updatedPayload.data.settings.allowGuestProposals).toBe(false);
  expect(updatedPayload.data.settings.revealConfig.includedDates).toEqual([
    updatedStart.toISOString().slice(0, 10),
  ]);

  const originalTokenStillWorks = await request.get(
    `/api/v1/schedule-shares/recipient/${encodeURIComponent(created.data.token!)}`,
    { headers: { Authorization: `Bearer ${peerToken}`, "x-forwarded-for": IP } },
  );
  expect(originalTokenStillWorks.status()).toBe(200);
  const recipientPayload = (await originalTokenStillWorks.json()) as {
    data: { linkId: string; ownedByViewer: boolean; isUpdated: boolean };
  };
  expect(recipientPayload.data.linkId).toBe(standaloneLinkId);
  expect(recipientPayload.data.ownedByViewer).toBe(false);
  expect(recipientPayload.data.isUpdated).toBe(true);

  const ownerRecipientView = await request.get(
    `/api/v1/schedule-shares/recipient/${encodeURIComponent(created.data.token!)}`,
    { headers: { Authorization: `Bearer ${ownerToken}`, "x-forwarded-for": IP } },
  );
  expect(ownerRecipientView.status()).toBe(200);
  expect(
    ((await ownerRecipientView.json()) as { data: { ownedByViewer: boolean } }).data
      .ownedByViewer,
  ).toBe(true);

  const messagesAfter = await prisma.message.count({
    where: { connectionId, type: "SCHEDULE_SHARE_CARD" },
  });
  expect(messagesAfter).toBe(messagesBefore);
});

test("send default schedule share and load peer chat preview", async ({ request }) => {
  const ownerToken = await accessToken(request, E2E_USER);
  const peerToken = await accessToken(request, E2E_PEER);

  const create = await request.post(`/api/v1/connections/${connectionId}/schedule-shares`, {
    headers: {
      Authorization: `Bearer ${ownerToken}`,
      "Idempotency-Key": `schedule-share-${Date.now()}`,
      "x-forwarded-for": IP,
    },
    data: {},
  });
  expect(create.status()).toBe(201);
  const created = (await create.json()) as {
    data: {
      shareUrl: string;
      token: string | null;
      linkId: string;
      message: { id: string; type: string; body: string | null };
    };
  };
  expect(created.data.message.type).toBe("SCHEDULE_SHARE_CARD");
  expect(created.data.shareUrl).toContain("/share/view/");
  expect(created.data.token).toBeTruthy();
  expect(created.data.message.body).toBe(created.data.shareUrl);
  createdLinkId = created.data.linkId;
  createdMessageId = created.data.message.id;

  const editable = await request.get(
    `/api/v1/schedule-shares/owner/${created.data.linkId}`,
    { headers: { Authorization: `Bearer ${ownerToken}`, "x-forwarded-for": IP } },
  );
  expect(editable.status()).toBe(200);
  const editablePayload = (await editable.json()) as {
    data: {
      settings: {
        rangeStart: string;
        rangeEnd: string;
        revealConfig: {
          categoryIds: string[];
          presetKeys: string[];
          hideAllDetails: boolean;
          includedDates: string[];
        };
        allowGuestProposals: boolean;
        usageLimit: string;
        expiresAt: string;
      };
    };
  };
  const makeReusable = await request.patch(
    `/api/v1/schedule-shares/owner/${created.data.linkId}`,
    {
      headers: { Authorization: `Bearer ${ownerToken}`, "x-forwarded-for": IP },
      data: { ...editablePayload.data.settings, usageLimit: "UNLIMITED" },
    },
  );
  expect(makeReusable.status()).toBe(200);

  const preview = await request.get(
    `/api/v1/schedule-shares/chat-preview/${encodeURIComponent(created.data.token!)}`,
    {
      headers: {
        Authorization: `Bearer ${peerToken}`,
        "x-forwarded-for": IP,
      },
    },
  );
  expect(preview.status()).toBe(200);
  const payload = (await preview.json()) as {
    data: {
      expired: boolean;
      linkId: string;
      ownedByViewer: boolean;
      ownerDisplayLabel: string;
      snapshot: { rangeStart: string; rangeEnd: string; freeSlots: unknown[] };
    };
  };
  expect(payload.data.ownerDisplayLabel.length).toBeGreaterThan(0);
  expect(payload.data.linkId).toBe(created.data.linkId);
  expect(payload.data.ownedByViewer).toBe(false);
  expect(payload.data.snapshot.rangeStart).toBeTruthy();
  expect(payload.data.snapshot.rangeEnd).toBeTruthy();
  expect(Array.isArray(payload.data.snapshot.freeSlots)).toBe(true);

  const ownerPreview = await request.get("/api/v1/schedule-shares/owner-preview", {
    headers: { Authorization: `Bearer ${ownerToken}`, "x-forwarded-for": IP },
  });
  expect(ownerPreview.status()).toBe(200);
  const ownerPayload = (await ownerPreview.json()) as {
    data: { snapshot: { rangeStart: string; freeSlots: unknown[] } };
  };
  expect(ownerPayload.data.snapshot.rangeStart).toBeTruthy();
  expect(Array.isArray(ownerPayload.data.snapshot.freeSlots)).toBe(true);

  const recipient = await request.get(
    `/api/v1/schedule-shares/recipient/${encodeURIComponent(created.data.token!)}`,
    {
      headers: { Authorization: `Bearer ${peerToken}`, "x-forwarded-for": IP },
    },
  );
  expect(recipient.status()).toBe(200);
  const recipientPayload = (await recipient.json()) as {
    data: {
      snapshot: { freeSlots: Array<{ start: string; end: string }> };
      allowGuestProposals: boolean;
      proposal: null | { id: string };
    };
  };
  expect(recipientPayload.data.allowGuestProposals).toBe(true);
  expect(recipientPayload.data.snapshot.freeSlots.length).toBeGreaterThan(0);

  const slot = recipientPayload.data.snapshot.freeSlots[0]!;
  const slotStart = new Date(slot.start).getTime();
  const slotEnd = new Date(slot.end).getTime();
  const proposalStart = new Date(slotStart);
  const proposalEnd = new Date(Math.min(slotStart + 30 * 60 * 1000, slotEnd));
  expect(proposalEnd.getTime() - proposalStart.getTime()).toBeGreaterThanOrEqual(15 * 60 * 1000);

  const proposal = await request.post(
    `/api/v1/schedule-shares/recipient/${encodeURIComponent(created.data.token!)}/proposals`,
    {
      headers: {
        Authorization: `Bearer ${peerToken}`,
        "Idempotency-Key": `schedule-proposal-${Date.now()}`,
        "x-forwarded-for": IP,
      },
      data: {
        title: "Coffee catch-up",
        startTime: proposalStart.toISOString(),
        endTime: proposalEnd.toISOString(),
      },
    },
  );
  if (![200, 201].includes(proposal.status())) {
    throw new Error(`proposal failed: ${proposal.status()} ${await proposal.text()}`);
  }
  const proposalBody = (await proposal.json()) as {
    data: { submitted: boolean; proposal: { status: string; title: string } };
  };
  expect(proposalBody.data.submitted).toBe(true);
  expect(proposalBody.data.proposal.title).toBe("Coffee catch-up");
  expect(proposalBody.data.proposal.status).toBe("PENDING");

  const pendingOwnerSettings = await request.get(
    `/api/v1/schedule-shares/owner/${created.data.linkId}`,
    { headers: { Authorization: `Bearer ${ownerToken}`, "x-forwarded-for": IP } },
  );
  expect(pendingOwnerSettings.status()).toBe(200);
  expect(
    ((await pendingOwnerSettings.json()) as { data: { pendingProposalCount: number } }).data
      .pendingProposalCount,
  ).toBe(1);

  const revoked = await request.delete(
    `/api/v1/schedule-shares/owner/${created.data.linkId}`,
    { headers: { Authorization: `Bearer ${ownerToken}`, "x-forwarded-for": IP } },
  );
  expect(revoked.status()).toBe(200);
  expect(((await revoked.json()) as { data: { linkId: string } }).data.linkId).toBe(
    created.data.linkId,
  );

  const revokedAgain = await request.delete(
    `/api/v1/schedule-shares/owner/${created.data.linkId}`,
    { headers: { Authorization: `Bearer ${ownerToken}`, "x-forwarded-for": IP } },
  );
  expect(revokedAgain.status()).toBe(200);

  const unavailable = await request.get(
    `/api/v1/schedule-shares/recipient/${encodeURIComponent(created.data.token!)}`,
    { headers: { Authorization: `Bearer ${peerToken}`, "x-forwarded-for": IP } },
  );
  expect(unavailable.status()).toBe(404);
});
