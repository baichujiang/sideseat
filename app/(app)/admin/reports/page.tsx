import Link from "next/link";
import { ReportReason, ReportStatus } from "@prisma/client";

import { ReportDetailDrawer } from "@/components/admin/report-detail-drawer";
import { ReportFilterBar } from "@/components/admin/report-filter-bar";
import { SectionHeader } from "@/components/layout/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { requireAdminUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    status?: string;
    reason?: string;
    q?: string;
    handledBy?: string;
  }>;
}) {
  await requireAdminUser();
  const params = (await searchParams) ?? {};
  const statusParam = Object.values(ReportStatus).includes(params.status as ReportStatus)
    ? (params.status as ReportStatus)
    : undefined;
  const reasonParam = Object.values(ReportReason).includes(params.reason as ReportReason)
    ? (params.reason as ReportReason)
    : undefined;
  const queryParam = params.q?.trim() ?? "";
  const handledByParam = params.handledBy && params.handledBy !== "ALL" ? params.handledBy : undefined;

  const reportWhere = {
    ...(statusParam ? { status: statusParam } : {}),
    ...(reasonParam ? { reason: reasonParam } : {}),
    ...(handledByParam ? { handledByEmail: handledByParam } : {}),
    ...(queryParam
      ? {
          OR: [
            { details: { contains: queryParam, mode: "insensitive" as const } },
            { adminNotes: { contains: queryParam, mode: "insensitive" as const } },
            { reporter: { nickname: { contains: queryParam, mode: "insensitive" as const } } },
            { reporter: { email: { contains: queryParam, mode: "insensitive" as const } } },
            { reportedUser: { nickname: { contains: queryParam, mode: "insensitive" as const } } },
            { reportedUser: { email: { contains: queryParam, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [reports, totalOpen, totalReview, totalResolved, totalReports, totalBlocks, handledEmails] =
    await Promise.all([
      prisma.report.findMany({
        where: reportWhere,
        include: {
          reporter: true,
          reportedUser: true,
          actionLog: {
            orderBy: {
              createdAt: "desc",
            },
          },
          moderationBlocks: {
            where: {
              isActive: true,
            },
          },
          connection: true,
          invitation: {
            include: {
              course: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      }),
      prisma.report.count({ where: { status: ReportStatus.OPEN } }),
      prisma.report.count({ where: { status: ReportStatus.UNDER_REVIEW } }),
      prisma.report.count({ where: { status: ReportStatus.RESOLVED } }),
      prisma.report.count(),
      prisma.moderationBlock.count({ where: { isActive: true } }),
      prisma.report.findMany({
        where: {
          handledByEmail: {
            not: null,
          },
        },
        select: {
          handledByEmail: true,
        },
        distinct: ["handledByEmail"],
      }),
    ]);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Moderation queue"
        action={
          <Link className="text-sm font-medium text-foreground" href="/home">
            Back to app
          </Link>
        }
      />

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Open" value={totalOpen} />
        <StatCard label="Review" value={totalReview} />
        <StatCard label="Resolved" value={totalResolved} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Reports" value={totalReports} />
        <StatCard label="Blocks" value={totalBlocks} />
      </div>

      <ReportFilterBar
        activeHandledBy={handledByParam ?? ""}
        activeQuery={queryParam}
        activeReason={reasonParam ?? "ALL"}
        activeStatus={statusParam ?? "ALL"}
        handlers={handledEmails.flatMap((item) => (item.handledByEmail ? [item.handledByEmail] : []))}
      />

      {reports.length ? (
        <ReportDetailDrawer
          reports={reports.map((report) => ({
            id: report.id,
            reason: report.reason,
            status: report.status,
            details: report.details,
            createdAt: report.createdAt.toISOString(),
            handledByEmail: report.handledByEmail,
            adminNotes: report.adminNotes,
            connectionId: report.connectionId,
            reporterLabel:
              report.reporter.nickname ?? report.reporter.email ?? report.reporter.username,
            reportedLabel:
              report.reportedUser.nickname ?? report.reportedUser.email ?? report.reportedUser.username,
            courseName: report.invitation?.course?.name ?? null,
            isUserBlocked: report.moderationBlocks.length > 0,
            actionLog: report.actionLog.map((entry) => ({
              id: entry.id,
              actionType: entry.actionType,
              actorEmail: entry.actorEmail,
              fromStatus: entry.fromStatus,
              toStatus: entry.toStatus,
              noteSnapshot: entry.noteSnapshot,
              createdAt: entry.createdAt.toISOString(),
            })),
          }))}
        />
      ) : (
        <EmptyState title="No reports match the current filter" />
      )}
    </div>
  );
}
