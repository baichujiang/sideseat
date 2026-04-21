import Link from "next/link";

import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { InvitationActions } from "@/components/inbox/invitation-actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";

export default async function InboxRequestsPage() {
  const user = await requireOnboardedUser();
  const received = await prisma.invitation.findMany({
    where: { receiverId: user.id },
    include: { sender: true, course: true },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  return (
    <div className="space-y-5">
      <Link className="text-xs text-muted-foreground hover:text-foreground" href="/inbox">
        ← Inbox
      </Link>

      {received.length ? (
        <div className="space-y-3">
          {received.map((invitation) => (
            <Card key={invitation.id} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <CardTitle className="text-base">{invitation.sender.nickname}</CardTitle>
                  <CardDescription>
                    {invitation.type.toLowerCase().replaceAll("_", " ")} · {invitation.course.name}
                  </CardDescription>
                </div>
                <StatusBadge tone={invitation.status === "PENDING" ? "warm" : "neutral"}>
                  {invitation.status.toLowerCase()}
                </StatusBadge>
              </div>
              {invitation.note ? <p className="text-sm">{invitation.note}</p> : null}
              {invitation.status === "PENDING" ? (
                <InvitationActions invitationId={invitation.id} />
              ) : null}
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No requests" />
      )}
    </div>
  );
}
