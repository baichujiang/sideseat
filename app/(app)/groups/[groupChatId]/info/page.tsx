import Link from "next/link";
import type { Route } from "next";
import { ChevronRight } from "lucide-react";

import { GroupChatAddMembers } from "@/components/groups/group-chat-add-members";
import { GroupChatTitleEditor } from "@/components/groups/group-chat-title-editor";
import { BackLink } from "@/components/nav/back-link";
import { GroupChatAvatarCollage } from "@/components/ui/group-chat-avatar-collage";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import { requireGroupChatParticipant } from "@/lib/auth/guards";
import { groupChatDisplayTitle } from "@/lib/group-chats/title";
import { resolveBackHref } from "@/lib/nav/back";
import { listDirectContactsExcludingSelfNotes } from "@/lib/queries/direct-contacts";

export default async function GroupChatInfoPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupChatId: string }>;
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const { groupChatId } = await params;
  const query = (await searchParams) ?? {};
  const { groupChat, user } = await requireGroupChatParticipant(groupChatId);
  const directContacts = await listDirectContactsExcludingSelfNotes(user.id);
  const infoPath =
    query.returnTo != null && query.returnTo !== ""
      ? (`/groups/${groupChat.id}/info?returnTo=${encodeURIComponent(query.returnTo)}` as Route)
      : (`/groups/${groupChat.id}/info` as Route);
  const title = groupChatDisplayTitle(
    groupChat.title,
    groupChat.participants.map((participant) => participant.user),
    user.id,
  );
  const autoTitle = groupChatDisplayTitle(
    null,
    groupChat.participants.map((participant) => participant.user),
    user.id,
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-background/95 px-2 py-2 backdrop-blur-sm">
        <BackLink returnTo={query.returnTo} fallback={`/groups/${groupChatId}`} label="Back" />
        <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-1 pl-1 pr-2">
          <GroupChatAvatarCollage
            participants={groupChat.participants.map((participant) => ({
              userId: participant.userId,
              avatarUrl: participant.user.avatarUrl,
            }))}
            sizePx={40}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">{title}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {groupChat.participants.length} member{groupChat.participants.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <GroupChatTitleEditor
          groupChatId={groupChat.id}
          storedTitle={groupChat.title}
          autoTitle={autoTitle}
        />

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between gap-2 px-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Members</p>
            <GroupChatAddMembers
              groupChatId={groupChat.id}
              currentMemberIds={groupChat.participants.map((p) => p.userId)}
              initialContacts={directContacts}
            />
          </div>
          {groupChat.participants.map((participant) => {
            const profileReturn = encodeURIComponent(infoPath);
            const profileHref =
              participant.userId === user.id
                ? (`/profile?returnTo=${profileReturn}` as Route)
                : (`/users/${participant.userId}?returnTo=${profileReturn}` as Route);
            const displayName = participant.user.nickname?.trim() || participant.user.username;
            const subtitle =
              participant.userId === user.id ? "You" : `@${participant.user.username}`;
            const profileLabel =
              participant.userId === user.id ? "Open your profile" : `Open ${displayName}'s profile`;

            return (
              <Link
                key={participant.userId}
                href={profileHref}
                aria-label={profileLabel}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5 transition hover:bg-muted/40 active:bg-muted/70"
              >
                <PresetAvatar id={participant.user.avatarUrl} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} aria-hidden />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
