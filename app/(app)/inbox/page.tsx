import { InboxChatsShell } from "@/components/inbox/inbox-quick-chips";
import { InboxRealtimeRefresh } from "@/components/inbox/inbox-realtime-refresh";
import { InboxSessionBootstrap } from "@/components/inbox/inbox-session-bootstrap";
import { ensureAssistantBotConnection } from "@/lib/auth/assistant-bot";
import { getSessionUser } from "@/lib/auth/session";
import { dedupeAssistantInboxRows } from "@/lib/inbox/dedupe-assistant-inbox-rows";
import { pinAssistantBotInbox } from "@/lib/inbox/pin-assistant-bot";
import { getInboxMergeBundle } from "@/lib/queries/inbox-merge";
import { getRecommendedClassmatesForViewer } from "@/lib/queries/recommended-classmates";
import { getServerAppLocale } from "@/lib/i18n/server-locale";

export default async function InboxPage() {
  const sessionUser = await getSessionUser();
  await getServerAppLocale();
  if (!sessionUser) {
    return <InboxSessionBootstrap />;
  }
  const user = sessionUser;
  await ensureAssistantBotConnection(user.id);

  const [{ merged: rawMerged, plansNeedingYourAction }, recommendedClassmates] = await Promise.all([
    getInboxMergeBundle(user.id),
    getRecommendedClassmatesForViewer(user.id),
  ]);
  const merged = pinAssistantBotInbox(dedupeAssistantInboxRows(rawMerged));
  const directContacts = merged
    .filter((item): item is Extract<(typeof merged)[number], { kind: "direct" }> => item.kind === "direct")
    .filter((item) => item.connection.userAId !== item.connection.userBId)
    .map((item) => {
      const peer = item.connection.userAId === user.id ? item.connection.userB : item.connection.userA;
      return {
        peerId: peer.id,
        connectionId: item.connection.id,
        nickname: peer.nickname,
        username: peer.username,
        avatarUrl: peer.avatarUrl,
      };
    });
  const listVersion = merged
    .map((item) => {
      if (item.kind === "direct") {
        return [
          "direct",
          item.connection.id,
          item.connection.messages[0]?.id ?? "none",
          item.unreadCount,
          item.sortAt.toISOString(),
        ].join(":");
      }

      if (item.kind === "course") {
        return [
          "course",
          item.course.id,
          item.last?.id ?? "none",
          item.unreadCount,
          item.sortAt.toISOString(),
        ].join(":");
      }

      return [
        "group",
        item.groupChat.id,
        item.last?.id ?? "none",
        item.unreadCount,
        item.sortAt.toISOString(),
      ].join(":");
    })
    .join("|");
  const inboxVersion = `${listVersion}|plans:${plansNeedingYourAction}`;

  return (
    <div className="space-y-3">
      <InboxRealtimeRefresh version={inboxVersion} />
      <InboxChatsShell
        userId={user.id}
        merged={merged}
        plansNeedingYourAction={plansNeedingYourAction}
        initialContacts={directContacts}
        showCreateSheet
        recommendedClassmates={recommendedClassmates}
      />
    </div>
  );
}
