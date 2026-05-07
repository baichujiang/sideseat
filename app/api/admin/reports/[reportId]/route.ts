import { ReportActionType, ReportStatus } from "@prisma/client";

import { requireAdminUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { adminReportSchema } from "@/lib/validators/invitation";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  try {
    const admin = await requireAdminUser();
    const values = await parseJson(request, adminReportSchema);
    const { reportId } = await params;
    const currentReport = await prisma.report.findUnique({
      where: {
        id: reportId,
      },
    });

    if (!currentReport) {
      return error("Report not found.", 404);
    }

    const report = await prisma.report.update({
      where: {
        id: reportId,
      },
      data: {
        status: values.status,
        adminNotes: values.adminNotes || null,
        handledByEmail: admin.adminActor,
        reviewedAt: new Date(),
        resolvedAt:
          values.status === ReportStatus.RESOLVED || values.status === ReportStatus.DISMISSED
            ? new Date()
            : null,
      },
    });

    const actions = [];

    if (currentReport.status !== values.status) {
      actions.push({
        reportId,
        actionType: ReportActionType.STATUS_CHANGED,
        actorEmail: admin.adminActor,
        fromStatus: currentReport.status,
        toStatus: values.status,
        noteSnapshot: values.adminNotes || null,
      });
    }

    if ((currentReport.adminNotes ?? "") !== (values.adminNotes || "")) {
      actions.push({
        reportId,
        actionType: ReportActionType.NOTES_UPDATED,
        actorEmail: admin.adminActor,
        fromStatus: values.status,
        toStatus: values.status,
        noteSnapshot: values.adminNotes || null,
      });
    }

    if (actions.length) {
      await prisma.reportAction.createMany({
        data: actions,
      });
    }

    return ok(report);
  } catch (cause) {
    console.error(cause);
    return error("Unable to update report.", 400);
  }
}
