/**
 * Backfill pending ScheduleShareGuestProposal rows (with proposerUserId) into PlanRequest + PLAN_REQUEST_CARD.
 *
 * Usage: npx tsx scripts/backfill-schedule-share-plan-requests.ts [--dry-run]
 */
import { PlanType } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { ensureActiveConnectionForScheduleShare } from "@/lib/schedule-share/ensure-connection-for-schedule-share";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const pending = await prisma.scheduleShareGuestProposal.findMany({
    where: {
      status: "PENDING",
      proposerUserId: { not: null },
      planRequest: null,
    },
    include: { scheduleShareLink: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Found ${pending.length} pending guest proposals without a plan.`);

  let created = 0;
  let skipped = 0;

  for (const guest of pending) {
    const proposerUserId = guest.proposerUserId!;
    const ownerUserId = guest.scheduleShareLink.ownerUserId;

    const existingPlan = await prisma.planRequest.findFirst({
      where: {
        scheduleShareLinkId: guest.scheduleShareLinkId,
        proposerUserId,
        status: "PENDING",
      },
      select: { id: true },
    });
    if (existingPlan) {
      skipped += 1;
      continue;
    }

    const conn = await ensureActiveConnectionForScheduleShare(prisma, proposerUserId, ownerUserId);
    if (!conn.ok) {
      console.warn(`Skip guest ${guest.id}: connection ${conn.reason}`);
      skipped += 1;
      continue;
    }

    if (dryRun) {
      console.log(`Would backfill guest ${guest.id} → connection ${conn.connectionId}`);
      created += 1;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const plan = await tx.planRequest.create({
        data: {
          connectionId: conn.connectionId,
          scheduleShareLinkId: guest.scheduleShareLinkId,
          scheduleShareGuestProposalId: guest.id,
          proposerUserId,
          receiverUserId: ownerUserId,
          planType: PlanType.CUSTOM,
          title: guest.title,
          message: guest.note,
          location: guest.location,
          startTime: guest.startTime,
          endTime: guest.endTime,
        },
      });

      const hasCard = await tx.message.findFirst({
        where: {
          connectionId: conn.connectionId,
          type: "PLAN_REQUEST_CARD",
          planRequestId: plan.id,
        },
        select: { id: true },
      });

      if (!hasCard) {
        await tx.message.create({
          data: {
            connectionId: conn.connectionId,
            senderId: proposerUserId,
            body: "",
            type: "PLAN_REQUEST_CARD",
            planRequestId: plan.id,
          },
        });
        await tx.connection.update({
          where: { id: conn.connectionId },
          data: { updatedAt: new Date() },
        });
      }
    });

    created += 1;
  }

  console.log(dryRun ? `Dry run: would create ${created}, skip ${skipped}` : `Created ${created}, skipped ${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
