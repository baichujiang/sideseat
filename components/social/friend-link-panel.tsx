import Link from "next/link";
import type { Route } from "next";
import { FriendLinkStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";

export type FriendLinkState = {
  status: FriendLinkStatus;
  requesterId: string;
  responderId: string;
} | null;

export function FriendLinkPanel({
  connectionId,
  currentUserId,
  peerNickname,
  returnTo,
  friendLink,
  variant,
}: {
  connectionId: string;
  currentUserId: string;
  peerNickname: string | null;
  returnTo: string;
  friendLink: FriendLinkState;
  variant: "profile" | "chat";
}) {
  const name = peerNickname ?? "Student";
  const isFriends = friendLink?.status === FriendLinkStatus.ACCEPTED;
  const pendingForMe =
    friendLink?.status === FriendLinkStatus.PENDING && friendLink.responderId === currentUserId;
  const pendingFromMe =
    friendLink?.status === FriendLinkStatus.PENDING && friendLink.requesterId === currentUserId;

  const box =
    variant === "profile"
      ? "rounded-xl border border-border bg-muted/20 px-3 py-3"
      : "border-t border-border bg-violet-50/50 px-3 py-2.5 dark:bg-violet-950/20";

  if (isFriends) {
    return (
      <div className={box}>
        <p className="text-sm font-medium text-foreground">Close friends</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          You&apos;ve upgraded this match — they appear in your{" "}
          <Link href={"/inbox/contacts" as Route} className="font-semibold text-primary underline">
            Contacts
          </Link>
          .
        </p>
      </div>
    );
  }

  if (pendingForMe) {
    return (
      <div className={box}>
        <p className="mb-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{name}</span> invited you to be close
          friends (address book).
        </p>
        <div className="flex gap-2">
          <form
            action={`/api/connections/${connectionId}/friend-link`}
            className="flex-1"
            method="post"
          >
            <input name="action" type="hidden" value="accept" />
            <input name="returnTo" type="hidden" value={returnTo} />
            <Button className="w-full" size="sm" type="submit">
              Accept
            </Button>
          </form>
          <form
            action={`/api/connections/${connectionId}/friend-link`}
            className="flex-1"
            method="post"
          >
            <input name="action" type="hidden" value="decline" />
            <input name="returnTo" type="hidden" value={returnTo} />
            <Button className="w-full" size="sm" type="submit" variant="outline">
              Decline
            </Button>
          </form>
        </div>
      </div>
    );
  }

  if (pendingFromMe) {
    return (
      <div className={box}>
        <p className="mb-2 text-center text-xs text-muted-foreground">
          Close-friend invite sent — waiting for <span className="font-medium text-foreground">{name}</span>.
        </p>
        <form action={`/api/connections/${connectionId}/friend-link`} method="post">
          <input name="action" type="hidden" value="cancel" />
          <input name="returnTo" type="hidden" value={returnTo} />
          <Button className="w-full" size="sm" type="submit" variant="ghost">
            Withdraw invite
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className={box}>
      <p className="mb-2 text-xs text-muted-foreground">
        Getting along? Upgrade to <span className="font-medium text-foreground">close friends</span>{" "}
        — after both agree, they show up in{" "}
        <Link href={"/inbox/contacts" as Route} className="font-semibold text-primary underline">
          Contacts
        </Link>
        .
      </p>
      <form action={`/api/connections/${connectionId}/friend-link`} method="post">
        <input name="action" type="hidden" value="request" />
        <input name="returnTo" type="hidden" value={returnTo} />
        <Button className="w-full" size="sm" type="submit" variant="outline">
          Invite to close friends
        </Button>
      </form>
    </div>
  );
}
