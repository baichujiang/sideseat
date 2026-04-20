import Link from "next/link";
import { ClientSignalAction } from "@prisma/client";
import { subDays } from "date-fns";

import { SectionHeader } from "@/components/layout/section-header";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAdminUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";

function tone(suspiciousCount: number) {
  if (suspiciousCount >= 4) return "danger";
  if (suspiciousCount >= 2) return "warm";
  return "neutral";
}

export default async function AdminSafetyPage() {
  await requireAdminUser();

  const signals = await prisma.clientSignal.findMany({
    where: {
      createdAt: {
        gte: subDays(new Date(), 7),
      },
      action: {
        in: [ClientSignalAction.SIGNUP, ClientSignalAction.LOGIN],
      },
      OR: [{ installId: { not: null } }, { ipHash: { not: null } }],
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 250,
  });

  const grouped = Array.from(
    signals.reduce((map, signal) => {
      const key = signal.installId ?? signal.ipHash ?? signal.id;
      const entry = map.get(key) ?? {
        key,
        installId: signal.installId,
        ipHash: signal.ipHash,
        signals: [] as typeof signals,
        emails: new Set<string>(),
        users: new Set<string>(),
      };

      entry.signals.push(signal);
      if (signal.attemptedEmail) entry.emails.add(signal.attemptedEmail);
      if (signal.userId) entry.users.add(signal.userId);
      map.set(key, entry);
      return map;
    }, new Map<string, {
      key: string;
      installId: string | null;
      ipHash: string | null;
      signals: typeof signals;
      emails: Set<string>;
      users: Set<string>;
    }>())
      .values()
  )
    .map((entry) => ({
      ...entry,
      suspiciousCount: Math.max(entry.emails.size, entry.users.size, entry.signals.length > 3 ? 2 : 1),
    }))
    .filter((entry) => entry.emails.size > 1 || entry.users.size > 1)
    .sort((left, right) => right.suspiciousCount - left.suspiciousCount || right.signals[0]!.createdAt.getTime() - left.signals[0]!.createdAt.getTime());

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Safety signals"
        action={
          <Link className="text-sm font-medium text-foreground" href="/admin/reports">
            Back to reports
          </Link>
        }
      />

      <div className="grid gap-4">
        {grouped.length ? (
          grouped.map((group) => (
            <Card key={group.key} className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle>Potential repeat registration signal</CardTitle>
                  <CardDescription>
                    {group.emails.size} email{group.emails.size === 1 ? "" : "s"} seen from the same install or network fingerprint in the last 7 days.
                  </CardDescription>
                </div>
                <StatusBadge tone={tone(group.suspiciousCount)}>
                  {group.suspiciousCount >= 4 ? "high review" : group.suspiciousCount >= 2 ? "review" : "low"}
                </StatusBadge>
              </div>

              <div className="grid gap-1 text-sm text-muted-foreground">
                {group.installId ? <p>Install ID: {group.installId}</p> : null}
                {group.ipHash ? <p>IP hash: {group.ipHash.slice(0, 18)}...</p> : null}
                <p>Emails: {Array.from(group.emails).join(", ")}</p>
                <p>Events: {group.signals.length}</p>
                <p>
                  Latest action: {group.signals[0]?.action.toLowerCase().replaceAll("_", " ")} ·{" "}
                  {group.signals[0]?.createdAt.toLocaleString()}
                </p>
              </div>
            </Card>
          ))
        ) : (
          <EmptyState title="No suspicious clusters yet" />
        )}
      </div>
    </div>
  );
}
