import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";

import { EmptyState } from "@/components/ui/empty-state";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";

export default async function InboxPage() {
  const user = await requireOnboardedUser();

  const [pendingReceivedCount, sentCount, connections] = await Promise.all([
    prisma.invitation.count({
      where: { receiverId: user.id, status: "PENDING" },
    }),
    prisma.invitation.count({
      where: { senderId: user.id },
    }),
    prisma.connection.findMany({
      where: {
        status: "ACTIVE",
        OR: [{ userAId: user.id }, { userBId: user.id }],
      },
      include: {
        userA: true,
        userB: true,
        invitation: { include: { course: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { sender: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <InboxPill
          href="/inbox/requests"
          label="Requests"
          count={pendingReceivedCount}
          highlight={pendingReceivedCount > 0}
        />
        <InboxPill href="/inbox/sent" label="Sent" count={sentCount} />
      </div>

      <section className="space-y-2">
        {connections.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card">
            {connections.map((connection) => {
              const other =
                connection.userAId === user.id ? connection.userB : connection.userA;
              const lastMessage = connection.messages[0];
              const fromMe = lastMessage?.senderId === user.id;
              const preview = lastMessage?.body
                ? `${fromMe ? "You: " : ""}${lastMessage.body}`
                : connection.invitation?.course
                  ? `Matched via ${connection.invitation.course.name}`
                  : "Say hi";
              const when = lastMessage?.createdAt ?? connection.updatedAt;
              const unread = Boolean(lastMessage && !fromMe);
              const initial = (other.nickname ?? "?").slice(0, 1).toUpperCase();

              return (
                <li key={connection.id}>
                  <Link
                    href={`/connections/${connection.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                      {initial}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-foreground">
                          {other.nickname ?? "Student"}
                        </p>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {formatDistanceToNowStrict(when, { addSuffix: false })}
                        </span>
                      </div>
                      <p
                        className={`truncate text-xs ${
                          unread ? "font-medium text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {preview}
                      </p>
                    </div>
                    {unread ? (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title="No chats yet" />
        )}
      </section>
    </div>
  );
}

function InboxPill({
  href,
  label,
  count,
  highlight = false,
}: {
  href: "/inbox/requests" | "/inbox/sent";
  label: string;
  count: number;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-1 items-center justify-between gap-2 rounded-2xl border px-3 py-2 text-sm transition-colors ${
        highlight
          ? "border-primary/30 bg-primary/10 text-foreground"
          : "border-border bg-card text-foreground hover:bg-muted/60"
      }`}
    >
      <span className="font-medium">{label}</span>
      <span
        className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${
          highlight ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        }`}
      >
        {count}
      </span>
    </Link>
  );
}
