import "server-only";

import { Prisma, type CalendarEntry, type PrismaClient } from "@prisma/client";
import { addDays } from "date-fns";

import { calendarOccurrenceId, parseCalendarOccurrenceId } from "@/lib/calendar/calendar-occurrence-id";
import { expandCalendarRecurrenceInWindow } from "@/lib/calendar/calendar-recurrence";
import { publicScheduleShareOrigin } from "@/lib/schedule-share/public-share-origin";
import {
  generateScheduleShareToken,
  hashScheduleShareToken,
} from "@/lib/schedule-share/token";

const EVENT_SHARE_TTL_DAYS = 14;

export class EventShareSourceNotFoundError extends Error {
  constructor() {
    super("The calendar event was not found.");
    this.name = "EventShareSourceNotFoundError";
  }
}

type ShareableEvent = Pick<CalendarEntry, "title" | "location" | "note" | "startAt" | "endAt"> & {
  sourceEventId: string;
};

export type CreateEventShareInput = {
  includeLocation: boolean;
  includeNotes: boolean;
};

function displayLabel(user: { nickname: string | null; username: string }) {
  return user.nickname?.trim() || user.username;
}

async function resolveShareableEvent(
  db: PrismaClient,
  ownerUserId: string,
  eventId: string,
): Promise<ShareableEvent | null> {
  const occurrence = parseCalendarOccurrenceId(eventId);
  if (!occurrence) {
    const entry = await db.calendarEntry.findFirst({
      where: {
        id: eventId,
        userId: ownerUserId,
        projectionStatus: "ACTIVE",
      },
      select: {
        title: true,
        location: true,
        note: true,
        startAt: true,
        endAt: true,
      },
    });
    return entry ? { ...entry, sourceEventId: eventId } : null;
  }

  const master = await db.calendarEntry.findFirst({
    where: {
      id: occurrence.seriesId,
      userId: ownerUserId,
      projectionStatus: "ACTIVE",
    },
    select: {
      id: true,
      title: true,
      location: true,
      note: true,
      startAt: true,
      endAt: true,
      repeatRule: true,
      repeatUntil: true,
      isRecurrenceMaster: true,
    },
  });
  if (!master || !master.isRecurrenceMaster) return null;

  const [override, cancellation] = await Promise.all([
    db.calendarEntry.findFirst({
      where: {
        userId: ownerUserId,
        projectionStatus: "ACTIVE",
        recurrenceMasterId: master.id,
        recurrenceOriginalStartAt: occurrence.originalStartAt,
      },
      select: {
        title: true,
        location: true,
        note: true,
        startAt: true,
        endAt: true,
      },
    }),
    db.calendarRecurrenceCancellation.findFirst({
      where: {
        recurrenceMasterId: master.id,
        originalStartAt: occurrence.originalStartAt,
      },
      select: { id: true },
    }),
  ]);
  if (cancellation) return null;
  if (override) return { ...override, sourceEventId: eventId };

  const generated = expandCalendarRecurrenceInWindow(
    {
      startAt: master.startAt,
      endAt: master.endAt,
      repeat: master.repeatRule,
      repeatUntil: master.repeatUntil,
    },
    new Date(occurrence.originalStartAt.getTime() - 1),
    new Date(occurrence.originalStartAt.getTime() + 1),
  ).find((candidate) => candidate.startAt.getTime() === occurrence.originalStartAt.getTime());
  if (!generated) return null;

  return {
    sourceEventId: calendarOccurrenceId(master.id, occurrence.originalStartAt),
    title: master.title,
    location: master.location,
    note: master.note,
    startAt: generated.startAt,
    endAt: generated.endAt,
  };
}

export async function createEventShareLink(
  db: PrismaClient,
  args: {
    owner: { id: string; nickname: string | null; username: string };
    eventId: string;
    input: CreateEventShareInput;
    requestOrigin: string;
  },
) {
  const event = await resolveShareableEvent(db, args.owner.id, args.eventId);
  if (!event) throw new EventShareSourceNotFoundError();

  const token = generateScheduleShareToken();
  const link = await db.eventShareLink.create({
    data: {
      ownerUserId: args.owner.id,
      sourceEventId: event.sourceEventId,
      tokenHash: hashScheduleShareToken(token),
      ownerDisplayLabel: displayLabel(args.owner),
      title: event.title,
      startAt: event.startAt,
      endAt: event.endAt,
      location: args.input.includeLocation ? event.location : null,
      note: args.input.includeNotes ? event.note : null,
      expiresAt: addDays(new Date(), EVENT_SHARE_TTL_DAYS),
    },
    select: { id: true, expiresAt: true },
  });
  const origin = publicScheduleShareOrigin({
    requestOrigin: args.requestOrigin,
    configuredOrigin: process.env.SIDESEAT_PUBLIC_SHARE_ORIGIN,
  });
  return {
    linkId: link.id,
    token,
    shareUrl: `${origin.replace(/\/$/, "")}/share/event/${encodeURIComponent(token)}`,
    expiresAt: link.expiresAt.toISOString(),
  };
}

export async function resolveEventShareLink(db: PrismaClient, token: string) {
  if (!token || token.length > 128) return null;
  return db.eventShareLink.findFirst({
    where: {
      tokenHash: hashScheduleShareToken(token),
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
}

export function eventShareSnapshot(
  link: NonNullable<Awaited<ReturnType<typeof resolveEventShareLink>>>,
) {
  return {
    linkId: link.id,
    ownerDisplayLabel: link.ownerDisplayLabel,
    title: link.title,
    startAt: link.startAt.toISOString(),
    endAt: link.endAt.toISOString(),
    location: link.location,
    note: link.note,
    expiresAt: link.expiresAt.toISOString(),
  };
}

export async function eventShareRecipientPayload(
  db: PrismaClient,
  args: { token: string; viewerUserId: string },
) {
  const link = await resolveEventShareLink(db, args.token);
  if (!link) return null;
  const existing = await db.calendarEntry.findFirst({
    where: { userId: args.viewerUserId, eventShareLinkId: link.id },
    select: { id: true },
  });
  return {
    snapshot: eventShareSnapshot(link),
    ownedByViewer: link.ownerUserId === args.viewerUserId,
    addedCalendarEntryId: existing?.id ?? null,
  };
}

export async function importEventShare(
  db: PrismaClient,
  args: { token: string; viewerUserId: string },
) {
  const link = await resolveEventShareLink(db, args.token);
  if (!link || link.ownerUserId === args.viewerUserId) return null;

  const existing = await db.calendarEntry.findFirst({
    where: { userId: args.viewerUserId, eventShareLinkId: link.id },
    select: { id: true },
  });
  if (existing) return { calendarEntryId: existing.id, created: false };

  try {
    const created = await db.calendarEntry.create({
      data: {
        userId: args.viewerUserId,
        eventShareLinkId: link.id,
        title: link.title,
        location: link.location,
        note: link.note,
        source: "event_share",
        repeatRule: "NONE",
        startAt: link.startAt,
        endAt: link.endAt,
      },
      select: { id: true },
    });
    return { calendarEntryId: created.id, created: true };
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
      const racedImport = await db.calendarEntry.findFirst({
        where: { userId: args.viewerUserId, eventShareLinkId: link.id },
        select: { id: true },
      });
      if (racedImport) {
        return { calendarEntryId: racedImport.id, created: false };
      }
    }
    throw cause;
  }
}
