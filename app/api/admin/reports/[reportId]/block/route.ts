import { ReportActionType, ReportStatus } from "@prisma/client";

import { requireAdminUser } from "@/lib/auth/guards";
import {
  deactivateUserModerationBlock,
  installUserModerationBlock,
} from "@/lib/connections/moderation-block-transaction";
import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/http";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  try {
    const admin = await requireAdminUser();
    const { reportId } = await params;

    const report = await prisma.report.findUnique({ where: { id: reportId } });

    if (!report) {
      return error("Report not found.", 404);
    }

    await prisma.$transaction(async (tx) => {
      const endedAt = new Date();
      const moderation = await installUserModerationBlock(tx, {
        userId: report.reportedUserId,
        reportId: report.id,
        reason: report.reason.toLowerCase().replaceAll("_", " "),
        createdByEmail: admin.adminActor,
        endedAt,
      });
      if (!moderation.created) return;

      await tx.report.update({
        where: { id: report.id },
        data: {
          status: ReportStatus.UNDER_REVIEW,
          handledByEmail: admin.adminActor,
          reviewedAt: new Date(),
        },
      });

      await tx.reportAction.create({
        data: {
          reportId: report.id,
          actionType: ReportActionType.USER_BLOCKED,
          actorEmail: admin.adminActor,
          fromStatus: report.status,
          toStatus: ReportStatus.UNDER_REVIEW,
          noteSnapshot: "Admin created a platform-level moderation block.",
        },
      });
    });

    return ok({ blocked: true });
  } catch (cause) {
    console.error(cause);
    return error("Unable to block the reported user.", 400);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  try {
    const admin = await requireAdminUser();
    const { reportId } = await params;
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: {
        moderationBlocks: {
          where: { isActive: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!report) {
      return error("Report not found.", 404);
    }

    const activeBlock = report.moderationBlocks[0];

    if (!activeBlock) {
      return ok({ unblocked: true });
    }

    await prisma.$transaction(async (tx) => {
      const deactivated = await deactivateUserModerationBlock(tx, {
        userId: report.reportedUserId,
        moderationBlockId: activeBlock.id,
      });
      if (!deactivated) return;

      await tx.reportAction.create({
        data: {
          reportId: report.id,
          actionType: ReportActionType.USER_UNBLOCKED,
          actorEmail: admin.adminActor,
          fromStatus: report.status,
          toStatus: report.status,
          noteSnapshot: "Admin removed the platform-level moderation block.",
        },
      });
    });

    return ok({ unblocked: true });
  } catch (cause) {
    console.error(cause);
    return error("Unable to remove the block.", 400);
  }
}
