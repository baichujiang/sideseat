import Link from "next/link";
import { ReportReason, ReportStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LinkButton } from "@/components/ui/link-button";
import { StatusBadge } from "@/components/ui/status-badge";

function buildHref({
  status,
  reason,
  q,
  handledBy,
}: {
  status?: string;
  reason?: string;
  q?: string;
  handledBy?: string;
}) {
  const query: Record<string, string> = {};

  if (status && status !== "ALL") query.status = status;
  if (reason && reason !== "ALL") query.reason = reason;
  if (q) query.q = q;
  if (handledBy && handledBy !== "ALL") query.handledBy = handledBy;

  return { pathname: "/admin/reports", query } as const;
}

export function ReportFilterBar({
  activeStatus,
  activeReason,
  activeQuery,
  activeHandledBy,
  handlers,
}: {
  activeStatus: "ALL" | ReportStatus;
  activeReason: "ALL" | ReportReason;
  activeQuery: string;
  activeHandledBy: string;
  handlers: string[];
}) {
  return (
    <Card className="space-y-4 bg-[rgba(255,255,255,0.74)]">
      <form action="/admin/reports" className="space-y-3" method="get">
        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">Search report details</label>
          <Input
            defaultValue={activeQuery}
            name="q"
            placeholder="Search reporter, reported user, notes, or details"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">Handled by</label>
          <select className="field-select" defaultValue={activeHandledBy || "ALL"} name="handledBy">
            <option value="ALL">All handlers</option>
            {handlers.map((handler) => (
              <option key={handler} value={handler}>
                {handler}
              </option>
            ))}
          </select>
        </div>
        {activeStatus !== "ALL" ? <input name="status" type="hidden" value={activeStatus} /> : null}
        {activeReason !== "ALL" ? <input name="reason" type="hidden" value={activeReason} /> : null}
        <Button className="w-full" type="submit">
          Apply search
        </Button>
      </form>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">Filter reports</p>
        <div className="flex flex-wrap gap-2">
          <Link href={buildHref({ status: "ALL", reason: activeReason, q: activeQuery, handledBy: activeHandledBy })}>
            <StatusBadge tone={activeStatus === "ALL" ? "calm" : "neutral"}>all statuses</StatusBadge>
          </Link>
          {Object.values(ReportStatus).map((status) => (
            <Link
              key={status}
              href={buildHref({ status, reason: activeReason, q: activeQuery, handledBy: activeHandledBy })}
            >
              <StatusBadge tone={activeStatus === status ? "warm" : "neutral"}>
                {status.toLowerCase().replaceAll("_", " ")}
              </StatusBadge>
            </Link>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">Reason</p>
        <div className="flex flex-wrap gap-2">
          <Link href={buildHref({ status: activeStatus, reason: "ALL", q: activeQuery, handledBy: activeHandledBy })}>
            <StatusBadge tone={activeReason === "ALL" ? "calm" : "neutral"}>all reasons</StatusBadge>
          </Link>
          {Object.values(ReportReason).map((reason) => (
            <Link
              key={reason}
              href={buildHref({ status: activeStatus, reason, q: activeQuery, handledBy: activeHandledBy })}
            >
              <StatusBadge tone={activeReason === reason ? "warm" : "neutral"}>
                {reason.toLowerCase().replaceAll("_", " ")}
              </StatusBadge>
            </Link>
          ))}
        </div>
      </div>

      <LinkButton className="w-full" href="/admin/reports" variant="outline">
        Clear filters
      </LinkButton>
    </Card>
  );
}
