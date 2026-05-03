import { redirect } from "next/navigation";
import { ConnectionStatus } from "@prisma/client";

import { GuestAppCta } from "@/components/app/guest-app-cta";
import { DirectInboxRow } from "@/components/inbox/direct-inbox-row";
import { BackLink } from "@/components/nav/back-link";
import { EmptyState } from "@/components/ui/empty-state";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { compareConnectionsForInbox } from "@/lib/queries/inbox-order";
import { inboxDirectUnreadCounts } from "@/lib/queries/inbox-unread-counts";

export default async function ToReplyPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <BackLink href="/inbox" label="Back to contacts" />
          <h1 className="text-lg font-semibold">To reply</h1>
        </div>
        <GuestAppCta returnTo="/inbox/to-reply" />
      </div>
    );
  }
  if (!sessionUser.onboardingComplete) {
    redirect("/onboarding");
  }
  const user = sessionUser;

  const connections = await prisma.connection.findMany({
    where: {
      status: ConnectionStatus.ACTIVE,
      OR: [{ userAId: user.id }, { userBId: user.id }],
    },
    include: {
      userA: true,
      userB: true,
      invitation: { include: { course: true } },
      originCourse: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { sender: true },
      },
      _count: { select: { messages: true } },
    },
  });

  const toReply = connections
    .sort((a, b) =>
      compareConnectionsForInbox(
        a,
        b,
        user.id,
        (value) => value.messages[0]?.createdAt ?? value.updatedAt,
      ),
    )
    .filter(
    (connection) =>
      connection._count.messages === 1 && connection.messages[0]?.senderId !== user.id,
    );

  const unreadByConn = await inboxDirectUnreadCounts(
    user.id,
    toReply.map((c) => c.id),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BackLink href="/inbox" label="Back to contacts" />
        <div>
          <h1 className="text-lg font-semibold tracking-tight">To reply</h1>
          <p className="text-xs text-muted-foreground">First hellos from classmates waiting for you</p>
        </div>
      </div>

      {toReply.length ? (
        <ul className="overflow-hidden rounded-[1.125rem] border border-border/60 bg-card shadow-[0_2px_16px_-4px_rgba(15,23,42,0.06)]">
          {toReply.map((connection) => (
            <DirectInboxRow
              key={connection.id}
              userId={user.id}
              connection={connection}
              unreadCount={unreadByConn.get(connection.id) ?? 0}
              returnTo="/inbox/to-reply"
            />
          ))}
        </ul>
      ) : (
        <EmptyState
          title="Nothing to reply to"
          description="When someone sends you a first hello, it will appear here before it becomes a normal chat."
        />
      )}
    </div>
  );
}
