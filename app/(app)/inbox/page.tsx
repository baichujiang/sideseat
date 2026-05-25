import { InboxChatsShell } from "@/components/inbox/inbox-quick-chips";
import { InboxRealtimeRefresh } from "@/components/inbox/inbox-realtime-refresh";
import { InboxSessionBootstrap } from "@/components/inbox/inbox-session-bootstrap";
import { TabKeepAliveSnapshot } from "@/components/layout/tab-keep-alive";
import { ensureAssistantBotConnection } from "@/lib/auth/assistant-bot";
import { getSessionUser } from "@/lib/auth/session";
import { buildInboxListVersion, prepareInboxListMerged } from "@/lib/inbox/inbox-list-version";
import { getInboxMergeBundle } from "@/lib/queries/inbox-merge";
import { getRecommendedClassmatesForViewer } from "@/lib/queries/recommended-classmates";
import { getServerAppLocale } from "@/lib/i18n/server-locale";

export default async function InboxPage() {
  const sessionUser = await getSessionUser();
  await getServerAppLocale();
  if (!sessionUser) {
    return (
      <TabKeepAliveSnapshot tab="inbox">
        <InboxSessionBootstrap />
      </TabKeepAliveSnapshot>
    );
  }
  const user = sessionUser;

  const [, { merged: rawMerged, plansNeedingYourAction }, recommendedClassmates] = await Promise.all([
    ensureAssistantBotConnection(user.id),
    getInboxMergeBundle(user.id),
    getRecommendedClassmatesForViewer(user.id),
  ]);
  const merged = prepareInboxListMerged(rawMerged);
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
  const inboxVersion = buildInboxListVersion(merged, plansNeedingYourAction);

  return (
    <TabKeepAliveSnapshot tab="inbox">
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
    </TabKeepAliveSnapshot>
  );
}
