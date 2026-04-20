import Link from "next/link";

import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";

export default async function InboxSentPage() {
  const user = await requireOnboardedUser();
  const sent = await prisma.invitation.findMany({
    where: { senderId: user.id },
    include: { receiver: true, course: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <Link className="text-xs text-muted-foreground hover:text-foreground" href="/inbox">
          ← Inbox
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">Sent</h1>
      </div>

      {sent.length ? (
        <div className="space-y-3">
          {sent.map((invitation) => (
            <Card key={invitation.id} className="space-y-1">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <CardTitle className="text-base">{invitation.receiver.nickname}</CardTitle>
                  <CardDescription>{invitation.course.name}</CardDescription>
                </div>
                <StatusBadge tone={invitation.status === "ACCEPTED" ? "calm" : "neutral"}>
                  {invitation.status.toLowerCase()}
                </StatusBadge>
              </div>
              {invitation.note ? (
                <p className="text-sm text-muted-foreground">{invitation.note}</p>
              ) : null}
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No sent invitations" />
      )}
    </div>
  );
}
