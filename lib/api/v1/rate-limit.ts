import "server-only";

import { createHash } from "crypto";

import { prisma } from "@/lib/db/prisma";

export type RateLimitRule = {
  scope: string;
  subject: string;
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
};

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function getV1ClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const firstForwarded = forwarded?.split(",")[0]?.trim();
  return firstForwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function rateLimitSubject(value: string) {
  return sha256(`sideseat:v1:rate-limit-subject:${value}`);
}

export async function consumeV1RateLimit(
  rule: RateLimitRule,
  now = new Date(),
): Promise<RateLimitResult> {
  if (!Number.isInteger(rule.limit) || rule.limit < 1) {
    throw new Error("Rate limit must be a positive integer.");
  }
  if (!Number.isInteger(rule.windowMs) || rule.windowMs < 1_000) {
    throw new Error("Rate limit window must be at least one second.");
  }

  const windowStartedAt = new Date(Math.floor(now.getTime() / rule.windowMs) * rule.windowMs);
  const resetAt = new Date(windowStartedAt.getTime() + rule.windowMs);
  const id = sha256(`${rule.scope}\0${rule.subject}\0${windowStartedAt.toISOString()}`);

  const [counter] = await Promise.all([
    prisma.apiRateLimitCounter.upsert({
      where: { id },
      create: {
        id,
        scope: rule.scope,
        count: 1,
        windowStartedAt,
        expiresAt: resetAt,
      },
      update: { count: { increment: 1 } },
      select: { count: true },
    }),
    prisma.apiRateLimitCounter.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);

  return {
    allowed: counter.count <= rule.limit,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - counter.count),
    resetAt,
  };
}

export function rateLimitHeaders(result: RateLimitResult, now = new Date()) {
  const resetSeconds = Math.ceil(result.resetAt.getTime() / 1_000);
  const retryAfterSeconds = Math.max(1, Math.ceil((result.resetAt.getTime() - now.getTime()) / 1_000));
  return {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(resetSeconds),
    ...(result.allowed ? {} : { "Retry-After": String(retryAfterSeconds) }),
  };
}
