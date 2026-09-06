import "server-only";

import type { PrismaClient } from "@prisma/client";

import { publicScheduleShareOrigin } from "@/lib/schedule-share/public-share-origin";
import {
  generateScheduleShareToken,
  hashScheduleShareToken,
} from "@/lib/schedule-share/token";

const MAX_ACTIVE_CALENDAR_SUBSCRIPTIONS = 5;
const ACCESS_TOUCH_INTERVAL_MS = 24 * 60 * 60 * 1000;

export class CalendarSubscriptionLimitError extends Error {
  constructor() {
    super("Up to five Apple Calendar connections can be active at once.");
    this.name = "CalendarSubscriptionLimitError";
  }
}

export class CalendarSubscriptionNotFoundError extends Error {
  constructor() {
    super("The calendar connection was not found.");
    this.name = "CalendarSubscriptionNotFoundError";
  }
}

function ownerConnection(link: {
  id: string;
  label: string;
  createdAt: Date;
  lastAccessedAt: Date | null;
}) {
  return {
    id: link.id,
    label: link.label,
    createdAt: link.createdAt.toISOString(),
    lastAccessedAt: link.lastAccessedAt?.toISOString() ?? null,
  };
}

export async function listCalendarSubscriptions(db: PrismaClient, ownerUserId: string) {
  const links = await db.calendarSubscriptionLink.findMany({
    where: { ownerUserId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, label: true, createdAt: true, lastAccessedAt: true },
  });
  return { connections: links.map(ownerConnection) };
}

export async function createCalendarSubscription(
  db: PrismaClient,
  args: {
    ownerUserId: string;
    label: string;
    requestOrigin: string;
  },
) {
  const activeCount = await db.calendarSubscriptionLink.count({
    where: { ownerUserId: args.ownerUserId, revokedAt: null },
  });
  if (activeCount >= MAX_ACTIVE_CALENDAR_SUBSCRIPTIONS) {
    throw new CalendarSubscriptionLimitError();
  }

  const token = generateScheduleShareToken();
  const link = await db.calendarSubscriptionLink.create({
    data: {
      ownerUserId: args.ownerUserId,
      tokenHash: hashScheduleShareToken(token),
      label: args.label,
    },
    select: { id: true, label: true, createdAt: true, lastAccessedAt: true },
  });
  const origin = publicScheduleShareOrigin({
    requestOrigin: args.requestOrigin,
    configuredOrigin: process.env.SIDESEAT_PUBLIC_SHARE_ORIGIN,
  });
  return {
    connection: ownerConnection(link),
    subscriptionUrl: `${origin.replace(/\/$/, "")}/api/public/calendar-subscriptions/${encodeURIComponent(token)}.ics`,
  };
}

export async function revokeCalendarSubscription(
  db: PrismaClient,
  args: { ownerUserId: string; linkId: string },
) {
  const existing = await db.calendarSubscriptionLink.findFirst({
    where: { id: args.linkId, ownerUserId: args.ownerUserId },
    select: { id: true, revokedAt: true },
  });
  if (!existing) throw new CalendarSubscriptionNotFoundError();
  if (!existing.revokedAt) {
    await db.calendarSubscriptionLink.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
  }
  return { id: existing.id, revoked: true };
}

export async function resolveCalendarSubscription(db: PrismaClient, rawToken: string) {
  const token = rawToken.endsWith(".ics") ? rawToken.slice(0, -4) : rawToken;
  if (!/^[A-Za-z0-9_-]{40,96}$/.test(token)) return null;
  return db.calendarSubscriptionLink.findFirst({
    where: { tokenHash: hashScheduleShareToken(token), revokedAt: null },
    select: {
      id: true,
      updatedAt: true,
      lastAccessedAt: true,
      owner: { select: { id: true, school: true } },
    },
  });
}

export async function touchCalendarSubscription(
  db: PrismaClient,
  link: { id: string; lastAccessedAt: Date | null },
) {
  if (
    link.lastAccessedAt &&
    Date.now() - link.lastAccessedAt.getTime() < ACCESS_TOUCH_INTERVAL_MS
  ) {
    return;
  }
  await db.calendarSubscriptionLink.updateMany({
    where: { id: link.id, revokedAt: null },
    data: { lastAccessedAt: new Date() },
  });
}
