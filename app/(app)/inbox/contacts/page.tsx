import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { ConnectionStatus, FriendLinkStatus } from "@prisma/client";

import { GuestAppCta } from "@/components/app/guest-app-cta";
import { BackLink } from "@/components/nav/back-link";
import { EmptyState } from "@/components/ui/empty-state";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export default async function ContactsPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <BackLink href="/inbox" label="Back to contacts" />
          <h1 className="text-lg font-semibold">Contacts</h1>
        </div>
        <GuestAppCta returnTo="/inbox/contacts" />
      </div>
    );
  }
  if (!sessionUser.onboardingComplete) {
    redirect("/onboarding");
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
        <BackLink href="/inbox" label="Back to contacts" />
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Contacts</h1>
          <p className="text-xs text-muted-foreground">Close friends you upgraded from a chat</p>
        </div>
      </div>

      {links.length ? (
        <ul className="overflow-hidden rounded-[1.125rem] border border-border/60 bg-card shadow-[0_2px_16px_-4px_rgba(15,23,42,0.06)]">
          {links.map((link) => {
            const c = link.connection;
            const peer = c.userAId === user.id ? c.userB : c.userA;
            const subtitle =
              c.invitation?.course?.name ?? (c.invitationId ? "Class match" : "Direct chat");
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
                  <Link
                    href={profileHref}
                    className="block truncate text-[15px] font-semibold leading-tight text-foreground"
                  >
                    {peer.nickname ?? "Student"}
                  </Link>
                  <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{subtitle}</p>
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
          title="No contacts yet"
          description="When a chat goes well, invite them as a close friend from their profile or the chat screen. After you both accept, they appear here."
        />
      )}
    </div>
  );
}
