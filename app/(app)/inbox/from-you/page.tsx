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

export default async function FromYouPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <BackLink href="/inbox" label="Back to Chats" />
          <h1 className="page-screen-title">From you</h1>
        </div>
        <GuestAppCta returnTo="/inbox/from-you" />
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

  const fromYou = connections
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
      connection._count.messages === 1 && connection.messages[0]?.senderId === user.id,
    );

  const unreadByConn = await inboxDirectUnreadCounts(
    user.id,
    fromYou.map((c) => c.id),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BackLink href="/inbox" label="Back to Chats" />
        <div>
          <h1 className="page-screen-title">From you</h1>
          <p className="text-xs text-muted-foreground">First hellos you sent that are still waiting</p>
        </div>
      </div>

      {fromYou.length ? (
        <ul className="space-y-2">
          {fromYou.map((connection) => (
            <DirectInboxRow
              key={connection.id}
              userId={user.id}
              connection={connection}
              unreadCount={unreadByConn.get(connection.id) ?? 0}
              returnTo="/inbox/from-you"
            />
          ))}
        </ul>
      ) : (
        <EmptyState
          title="Nothing pending from you"
          description="When you send a first hello and they have not replied yet, it will appear here."
        />
      )}
    </div>
  );
}
