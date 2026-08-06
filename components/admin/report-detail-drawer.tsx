"use client";

import Link from "next/link";
import type { Route } from "next";
import { ReportStatus } from "@prisma/client";
import { useMemo, useRef, useState } from "react";

import { AdminBlockButton } from "@/components/admin/admin-block-button";
import { ReportReviewForm } from "@/components/admin/report-review-form";
import { Button } from "@/components/ui/button";
import { AppPushLayer } from "@/components/ui/app-push-layer";
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
  targetKind: string;
  targetPreview: string | null;
  targetHref: string | null;
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
  const lastDetailIdRef = useRef<string | null>(null);
  if (activeReportId != null) {
    lastDetailIdRef.current = activeReportId;
  }
  const detailReportId = activeReportId ?? lastDetailIdRef.current;
  const detailReport = useMemo(
    () => (detailReportId ? reports.find((report) => report.id === detailReportId) ?? null : null),
    [detailReportId, reports],
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
              <p>Target: {report.targetKind}</p>
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

      <AppPushLayer
        open={activeReportId != null}
        onClose={() => setActiveReportId(null)}
        zClassName="z-40"
        panelClassName="w-[min(100vw,28rem)] border-0 bg-background shadow-none dark:shadow-none"
      >
        {detailReport ? (
          <div className="flex h-full min-h-0 flex-col overflow-y-auto p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Report detail</p>
                <h2 className="text-xl font-semibold">
                  {detailReport.reason.toLowerCase().replaceAll("_", " ")}
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
                  <p>Reporter: {detailReport.reporterLabel}</p>
                  <p>Reported user: {detailReport.reportedLabel}</p>
                  <p>Submitted: {new Date(detailReport.createdAt).toLocaleString()}</p>
                  <p>Target: {detailReport.targetKind}</p>
                  {detailReport.targetPreview ? (
                    <p className="rounded-md border border-border/70 bg-muted/35 p-3 text-foreground">
                      {detailReport.targetPreview}
                    </p>
                  ) : null}
                  {detailReport.targetHref ? (
                    <Link className="font-medium text-primary underline-offset-4 hover:underline" href={detailReport.targetHref as Route}>
                      Open reported post
                    </Link>
                  ) : null}
                  {detailReport.courseName ? <p>Course: {detailReport.courseName}</p> : null}
                  {detailReport.connectionId ? <p>Connection: {detailReport.connectionId}</p> : null}
                  {detailReport.details ? (
                    <p className="text-foreground">Reporter notes: {detailReport.details}</p>
                  ) : null}
                </div>
              </Card>

              <Card className="space-y-3">
                <CardTitle>Handling</CardTitle>
                <ReportReviewForm
                  initialNotes={detailReport.adminNotes}
                  initialStatus={detailReport.status}
                  reportId={detailReport.id}
                />
                <AdminBlockButton blocked={detailReport.isUserBlocked} reportId={detailReport.id} />
              </Card>

              <Card className="space-y-3">
                <CardTitle>History</CardTitle>
                {detailReport.actionLog.length ? (
                  <div className="space-y-3">
                    {detailReport.actionLog.map((entry) => (
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
        ) : null}
      </AppPushLayer>
    </>
  );
}
