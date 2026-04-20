"use client";

import { ReportStatus } from "@prisma/client";
import { useMemo, useState } from "react";

import { AdminBlockButton } from "@/components/admin/admin-block-button";
import { ReportReviewForm } from "@/components/admin/report-review-form";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";

type ReportRecord = {
  id: string;
  reason: string;
  status: ReportStatus;
  details: string | null;
  createdAt: string;
  handledByEmail: string | null;
  adminNotes: string | null;
  connectionId: string | null;
  reporterLabel: string;
  reportedLabel: string;
  courseName: string | null;
  isUserBlocked: boolean;
  actionLog: Array<{
    id: string;
    actionType: string;
    actorEmail: string;
    fromStatus: string | null;
    toStatus: string | null;
    noteSnapshot: string | null;
    createdAt: string;
  }>;
};

function toneForStatus(status: ReportStatus) {
  if (status === ReportStatus.OPEN) return "danger";
  if (status === ReportStatus.UNDER_REVIEW) return "warm";
  if (status === ReportStatus.RESOLVED) return "calm";
  return "neutral";
}

export function ReportDetailDrawer({ reports }: { reports: ReportRecord[] }) {
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const activeReport = useMemo(
    () => reports.find((report) => report.id === activeReportId) ?? null,
    [activeReportId, reports],
  );

  return (
    <>
      <div className="grid gap-4">
        {reports.map((report) => (
          <Card key={report.id} className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle>{report.reason.toLowerCase().replaceAll("_", " ")}</CardTitle>
                <CardDescription>
                  Reporter: {report.reporterLabel} · Reported: {report.reportedLabel}
                </CardDescription>
              </div>
              <StatusBadge tone={toneForStatus(report.status)}>
                {report.status.toLowerCase().replaceAll("_", " ")}
              </StatusBadge>
            </div>
            <div className="grid gap-1 text-sm text-muted-foreground">
              <p>Submitted: {new Date(report.createdAt).toLocaleString()}</p>
              {report.courseName ? <p>Course context: {report.courseName}</p> : null}
              {report.handledByEmail ? <p>Last handled by: {report.handledByEmail}</p> : null}
              {report.isUserBlocked ? <p className="text-destructive">Platform block active</p> : null}
            </div>
            <Button className="w-full" onClick={() => setActiveReportId(report.id)} type="button" variant="outline">
              Open details
            </Button>
          </Card>
        ))}
      </div>

      {activeReport ? (
        <div className="fixed inset-0 z-40 bg-black/30">
          <div className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col overflow-y-auto border-l border-border bg-background p-5 shadow-soft">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Report detail</p>
                <h2 className="text-xl font-semibold">
                  {activeReport.reason.toLowerCase().replaceAll("_", " ")}
                </h2>
              </div>
              <Button onClick={() => setActiveReportId(null)} size="sm" type="button" variant="ghost">
                Close
              </Button>
            </div>

            <div className="space-y-4">
              <Card className="space-y-3">
                <CardTitle>Context</CardTitle>
                <div className="grid gap-2 text-sm text-muted-foreground">
                  <p>Reporter: {activeReport.reporterLabel}</p>
                  <p>Reported user: {activeReport.reportedLabel}</p>
                  <p>Submitted: {new Date(activeReport.createdAt).toLocaleString()}</p>
                  {activeReport.courseName ? <p>Course: {activeReport.courseName}</p> : null}
                  {activeReport.connectionId ? <p>Connection: {activeReport.connectionId}</p> : null}
                  {activeReport.details ? (
                    <p className="text-foreground">Reporter notes: {activeReport.details}</p>
                  ) : null}
                </div>
              </Card>

              <Card className="space-y-3">
                <CardTitle>Handling</CardTitle>
                <ReportReviewForm
                  initialNotes={activeReport.adminNotes}
                  initialStatus={activeReport.status}
                  reportId={activeReport.id}
                />
                <AdminBlockButton blocked={activeReport.isUserBlocked} reportId={activeReport.id} />
              </Card>

              <Card className="space-y-3">
                <CardTitle>History</CardTitle>
                {activeReport.actionLog.length ? (
                  <div className="space-y-3">
                    {activeReport.actionLog.map((entry) => (
                      <div key={entry.id} className="rounded-2xl border border-border/70 bg-white/70 p-3 text-sm">
                        <p className="font-medium text-foreground">
                          {entry.actionType.toLowerCase().replaceAll("_", " ")}
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          {entry.actorEmail} · {new Date(entry.createdAt).toLocaleString()}
                        </p>
                        {entry.fromStatus || entry.toStatus ? (
                          <p className="mt-1 text-muted-foreground">
                            {entry.fromStatus ?? "none"} → {entry.toStatus ?? "none"}
                          </p>
                        ) : null}
                        {entry.noteSnapshot ? (
                          <p className="mt-2 text-foreground">{entry.noteSnapshot}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <CardDescription>No handling actions yet.</CardDescription>
                )}
              </Card>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
