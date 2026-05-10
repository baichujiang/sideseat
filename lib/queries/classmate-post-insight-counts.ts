import "server-only";

import { ClassmatePostInsightKind } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export type ClassmatePostInsightCounts = {
  detailViews: number;
  messageIntents: number;
};

/** Aggregated insight rows for the post author's "My posts" screen only. */
export async function classmatePostInsightCountsByPostId(
  postIds: string[],
): Promise<Map<string, ClassmatePostInsightCounts>> {
  const map = new Map<string, ClassmatePostInsightCounts>();
  if (postIds.length === 0) return map;
  for (const id of postIds) {
    map.set(id, { detailViews: 0, messageIntents: 0 });
  }
  const rows = await prisma.classmatePostInsight.groupBy({
    by: ["postId", "kind"],
    where: { postId: { in: postIds } },
    _count: { _all: true },
  });
  for (const row of rows) {
    const cur = map.get(row.postId);
    if (!cur) continue;
    if (row.kind === ClassmatePostInsightKind.DETAIL_VIEW) {
      cur.detailViews = row._count._all;
    } else if (row.kind === ClassmatePostInsightKind.MESSAGE_INTENT) {
      cur.messageIntents = row._count._all;
    }
    map.set(row.postId, cur);
  }
  return map;
}
