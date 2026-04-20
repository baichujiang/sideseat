import { SectionHeader } from "@/components/layout/section-header";
import { LinkButton } from "@/components/ui/link-button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: Promise<{ submitted?: string }>;
}) {
  const user = await requireOnboardedUser();
  const query = (await searchParams) ?? {};
  const reports = await prisma.report.findMany({
    where: {
      reporterId: user.id,
    },
    include: {
      reportedUser: true,
      invitation: {
        include: {
          course: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return (
    <div className="space-y-6">
      <SectionHeader
        title="My reports"
        action={
          <LinkButton href="/profile" size="sm" variant="outline">
            Back to profile
          </LinkButton>
        }
      />

      {query.submitted === "1" ? (
        <Card className="space-y-2 border-[#d5e9df] bg-[#eef8f2]">
          <CardTitle>Report submitted</CardTitle>
        </Card>
      ) : null}

      <div className="grid gap-4">
        {reports.length ? (
          reports.map((report) => (
            <Card key={report.id} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle>{report.reason.toLowerCase().replaceAll("_", " ")}</CardTitle>
                  <CardDescription>
                    Against{" "}
                    {report.reportedUser.nickname ??
                      report.reportedUser.email ??
                      report.reportedUser.username}
                  </CardDescription>
                </div>
                <StatusBadge
                  tone={
                    report.status === "OPEN"
                      ? "danger"
                      : report.status === "UNDER_REVIEW"
                        ? "warm"
                        : report.status === "RESOLVED"
                          ? "calm"
                          : "neutral"
                  }
                >
                  {report.status.toLowerCase().replaceAll("_", " ")}
                </StatusBadge>
              </div>
              <div className="grid gap-1 text-sm text-muted-foreground">
                <p>Submitted: {report.createdAt.toLocaleString()}</p>
                {report.invitation?.course ? <p>Course: {report.invitation.course.name}</p> : null}
                {report.details ? <p className="text-foreground">Notes: {report.details}</p> : null}
              </div>
            </Card>
          ))
        ) : (
          <EmptyState title="No reports submitted" />
        )}
      </div>
    </div>
  );
}
