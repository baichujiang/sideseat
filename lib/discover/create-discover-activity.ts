import "server-only";

import { DiscoverActivityStatus, type Prisma, type User } from "@prisma/client";

import {
  DISCOVER_ACTIVITY_DEFAULT_DURATION_MS,
  MAX_OPEN_DISCOVER_ACTIVITIES_PER_USER,
} from "@/lib/constants/discover-activity";
import { DEFAULT_SCHOOL, normalizeSchoolCode } from "@/lib/constants/schools";
import {
  discoverActivityForFeedInclude,
  prismaDiscoverActivityToRow,
} from "@/lib/discover/prisma-discover-activity-for-discover";
import { createDiscoverActivitySchema } from "@/lib/validators/discover-activity";

export class DiscoverActivityCreateError extends Error {
  constructor(readonly code: "CREATE_LIMIT") {
    super(code);
    this.name = "DiscoverActivityCreateError";
  }
}

export async function createDiscoverActivityForUser(
  user: Pick<User, "id" | "school">,
  input: unknown,
  city: string,
  tx: Prisma.TransactionClient,
) {
  const values = createDiscoverActivitySchema.parse(input);
  const now = new Date();
  await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
  const openCount = await tx.discoverActivity.count({
    where: {
      organizerId: user.id,
      status: { in: [DiscoverActivityStatus.OPEN, DiscoverActivityStatus.FULL] },
      startAt: { gt: now },
    },
  });
  if (openCount >= MAX_OPEN_DISCOVER_ACTIVITIES_PER_USER) {
    throw new DiscoverActivityCreateError("CREATE_LIMIT");
  }

  const startAt = new Date(values.startAt);
  const created = await tx.discoverActivity.create({
    data: {
      organizerId: user.id,
      city,
      school: normalizeSchoolCode(user.school) ?? DEFAULT_SCHOOL,
      title: values.title.trim(),
      description: values.description.trim(),
      startAt,
      endAt: new Date(startAt.getTime() + DISCOVER_ACTIVITY_DEFAULT_DURATION_MS),
      location: values.location.trim(),
      capacity: values.unlimitedCapacity ? null : (values.capacity ?? null),
      status: DiscoverActivityStatus.OPEN,
    },
    include: discoverActivityForFeedInclude,
  });

  return prismaDiscoverActivityToRow(created, user.id, now);
}
