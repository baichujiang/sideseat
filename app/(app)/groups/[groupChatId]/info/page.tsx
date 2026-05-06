import Link from "next/link";
import type { Route } from "next";
import { UsersRound } from "lucide-react";

import { BackLink } from "@/components/nav/back-link";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import { requireGroupChatParticipant } from "@/lib/auth/guards";
import { groupChatDisplayTitle } from "@/lib/group-chats/title";
import { safeReturnPath } from "@/lib/nav/back";

export default async function GroupChatInfoPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupChatId: string }>;
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const { groupChatId } = await params;
  const query = (await searchParams) ?? {};
  const backHref = safeReturnPath(query.returnTo, `/groups/${groupChatId}`);
  const { groupChat, user } = await requireGroupChatParticipant(groupChatId);
  const title = groupChatDisplayTitle(
    groupChat.title,
    groupChat.participants.map((participant) => participant.user),
    user.id,
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-background/95 px-2 py-2 backdrop-blur-sm">
        <BackLink href={backHref} label="Back" />
        <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-1 pl-1 pr-2">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-classmates-blue-soft/80 text-classmates-blue">
            <UsersRound className="h-5 w-5" strokeWidth={2.2} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">{title}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {groupChat.participants.length} member{groupChat.participants.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-2">
          {groupChat.participants.map((participant) => {
            const profileHref =
              participant.userId === user.id
                ? (`/profile?returnTo=${encodeURIComponent(`/groups/${groupChat.id}/info`)}` as Route)
                : (`/users/${participant.userId}?returnTo=${encodeURIComponent(`/groups/${groupChat.id}/info`)}` as Route);
            const displayName = participant.user.nickname?.trim() || participant.user.username;
            const subtitle =
              participant.userId === user.id ? "You" : `@${participant.user.username}`;

            return (
              <Link
                key={participant.userId}
                href={profileHref}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5 transition hover:bg-muted/40 active:bg-muted/70"
              >
                <PresetAvatar id={participant.user.avatarUrl} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
