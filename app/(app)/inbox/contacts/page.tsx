import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { ConnectionStatus, FriendLinkStatus } from "@prisma/client";

import { GuestAppCta } from "@/components/app/guest-app-cta";
import { BackLink } from "@/components/nav/back-link";
import { EmptyState } from "@/components/ui/empty-state";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import { UserGenderCardIcon } from "@/components/ui/user-gender-icon";
import { getSessionUser } from "@/lib/auth/session";
import { contactRemarkForViewer } from "@/lib/connections/contact-remark";
import { prisma } from "@/lib/db/prisma";

export default async function ContactsPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <BackLink fallback="/inbox" label="Back to Chats" />
          <h1 className="page-screen-title">Close friends</h1>
        </div>
        <GuestAppCta returnTo="/inbox/contacts" />
      </div>
    );
  }
  const user = sessionUser;

  const links = await prisma.friendLink.findMany({
    where: {
      status: FriendLinkStatus.ACCEPTED,
      connection: {
        status: ConnectionStatus.ACTIVE,
        OR: [{ userAId: user.id }, { userBId: user.id }],
      },
    },
    include: {
      connection: {
        include: {
          userA: true,
          userB: true,
          invitation: { include: { course: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BackLink fallback="/inbox" label="Back to Chats" />
        <div>
          <h1 className="page-screen-title">Close friends</h1>
        </div>
      </div>

      {links.length ? (
        <ul className="overflow-hidden rounded-[1.125rem] border border-border/60 bg-card shadow-[0_2px_16px_-4px_rgba(15,23,42,0.06)]">
          {links.map((link) => {
            const c = link.connection;
            const peer = c.userAId === user.id ? c.userB : c.userA;
            const myRemark = contactRemarkForViewer(c, user.id);
            const peerNick = peer.nickname?.trim() ?? "";
            const listTitle = myRemark || peerNick || "Student";
            const subtitle = c.invitation?.course?.name ?? null;
            const profileHref =
              `/users/${peer.id}?returnTo=${encodeURIComponent("/inbox/contacts")}` as Route;
            const chatHref = `/connections/${c.id}?returnTo=%2Finbox%2Fcontacts` as Route;

            return (
              <li
                key={link.id}
                className="flex items-center gap-3.5 border-b border-border/50 px-4 py-3.5 last:border-b-0"
              >
                <Link href={profileHref} className="shrink-0">
                  <PresetAvatar id={peer.avatarUrl} size={52} className="ring-2 ring-background shadow-sm" />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <Link
                      href={profileHref}
                      className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-tight text-foreground"
                    >
                      {listTitle}
                    </Link>
                    <UserGenderCardIcon gender={peer.gender} className="shrink-0" />
                  </div>
                  {myRemark && myRemark !== peerNick ? (
                    <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                      {peerNick || `@${peer.username}`}
                    </p>
                  ) : null}
                  {subtitle ? (
                    <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{subtitle}</p>
                  ) : null}
                </div>
                <Link
                  href={chatHref}
                  className="shrink-0 rounded-full bg-primary/10 px-3.5 py-1.5 text-[13px] font-semibold text-primary transition-colors hover:bg-primary/15 active:bg-primary/20"
                >
                  Chat
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          title="No close friends yet"
          description="When a chat goes well, invite them as a close friend from their profile or the chat screen. After you both accept, they appear here."
        />
      )}
    </div>
  );
}
