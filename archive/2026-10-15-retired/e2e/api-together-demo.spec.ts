import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import {
  demoBatch,
  demoIntentInput,
} from "../scripts/lib/together-demo-catalog";
import { assertLocalTestDatabase } from "./helpers/local-test-database";

assertLocalTestDatabase();
const execFileAsync = promisify(execFile);

test("six real demo matches stay in their QA course even with compatible outside intents", async ({
  request,
  baseURL,
}) => {
  test.setTimeout(180_000);
  assert.ok(baseURL);
  assert.ok(["127.0.0.1", "localhost"].includes(new URL(baseURL).hostname));
  const db = new PrismaClient();
  const run = `local${Date.now().toString(36)}`.slice(0, 12);
  const tokens: string[] = [];
  async function login(identifier: string) {
    const response = await request.post("/api/v1/auth/login", {
      data: {
        identifier,
        password: "Password123",
        device: {
          id: `demo-${run}-${identifier}`,
          name: "Together demo QA",
          appVersion: "1.0.0",
          platformVersion: "QA",
        },
      },
    });
    expect(response.status()).toBe(200);
    const { data } = await response.json();
    tokens.push(data.tokens.refreshToken);
    return { Authorization: `Bearer ${data.tokens.accessToken}` };
  }
  try {
    const outsiderHeaders = await login("test_002");
    const startsAt = new Date(
      Math.ceil((Date.now() + 18 * 3_600_000) / 3_600_000) * 3_600_000,
    );
    const window = {
      startAt: startsAt.toISOString(),
      endAt: new Date(startsAt.getTime() + 2 * 3_600_000).toISOString(),
    };
    for (const item of demoBatch("categories")) {
      const response = await request.post("/api/v1/me/weekly-intents", {
        headers: {
          ...outsiderHeaders,
          "Idempotency-Key": `${run}-outside-${item.key}`,
        },
        data: { ...demoIntentInput(item, "", window, run), courseId: null },
      });
      expect(response.status()).toBe(201);
    }
    expect(
      (
        await request.post("/api/v1/me/together-matching-session", {
          headers: {
            ...outsiderHeaders,
            "Idempotency-Key": `${run}-outside-session`,
          },
        })
      ).status(),
    ).toBe(200);
    const seeded = await execFileAsync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/seed-together-demo.ts",
        "--apply",
        "--run",
        run,
        "--base-url",
        baseURL,
      ],
      {
        env: { ...process.env, SIDESEAT_QA_PASSWORD: "Password123" },
        timeout: 120_000,
      },
    );
    expect(seeded.stdout).toContain('"status":"READY"');
    expect(seeded.stdout).toContain('"realMatchingCards":6');

    const ownerHeaders = await login("test_001");
    const owner = await db.user.findUniqueOrThrow({
      where: { username: "test_001" },
      select: { id: true },
    });
    const course = await db.course.findFirstOrThrow({
      where: { code: `QA-TG-${run}` },
      select: { id: true },
    });
    const own = await db.weeklyIntent.findMany({
      where: { userId: owner.id, courseId: course.id },
      select: { id: true },
    });
    const ids = new Set(own.map((item) => item.id));
    const response = await request.get("/api/v1/me/mutual-opportunities", {
      headers: ownerHeaders,
    });
    expect(response.status()).toBe(200);
    const cards = (await response.json()).data.opportunities.filter(
      (item: { viewerIntentId: string }) => ids.has(item.viewerIntentId),
    );
    expect(cards).toHaveLength(6);
    expect(
      new Set(cards.map((item: { topic: string }) => item.topic)).size,
    ).toBe(6);
    for (const card of cards) {
      expect(card.state).toBe("NEEDS_DECISION");
      expect(card.matchFit.score).toBe(100);
    }
    const outsider = await request.get("/api/v1/me/mutual-opportunities", {
      headers: outsiderHeaders,
    });
    expect((await outsider.json()).data.opportunities).toHaveLength(0);
    expect(
      await db.mutualOpportunity.count({ where: { courseId: course.id } }),
    ).toBe(6);
    expect(
      await db.mutualOpportunityDecision.count({
        where: { opportunity: { courseId: course.id } },
      }),
    ).toBe(0);
  } finally {
    for (const refreshToken of tokens) {
      expect(
        (
          await request.post("/api/v1/auth/logout", { data: { refreshToken } })
        ).status(),
      ).toBe(200);
    }
    await db.$disconnect();
  }
});
