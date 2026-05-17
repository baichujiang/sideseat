import { OnboardingContinueCta } from "@/components/app/onboarding-continue-cta";
import { InboxChatsShell } from "@/components/inbox/inbox-quick-chips";
import { InboxRealtimeRefresh } from "@/components/inbox/inbox-realtime-refresh";
import { GuestAppCta } from "@/components/app/guest-app-cta";
import { getSessionUser } from "@/lib/auth/session";
import { getInboxMergeBundle } from "@/lib/queries/inbox-merge";
import { getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";

export default async function InboxPage() {
  const sessionUser = await getSessionUser();
  const locale = await getServerAppLocale();
  const ui = getMessages(locale);
  if (!sessionUser) {
    return (
      <div className="space-y-3">
        <header className="px-0.5 text-center">
          <h1 className="page-screen-title">{ui.inbox.screenTitle}</h1>
          <p className="page-screen-subtitle mt-0.5">{ui.inbox.screenSubtitleGuest}</p>
        </header>
        <GuestAppCta returnTo="/inbox" headline={ui.inbox.guestHeadline} body={ui.inbox.guestBody} />
      </div>
    );
  }
  const user = sessionUser;

  const { merged, plansNeedingYourAction } = await getInboxMergeBundle(user.id);
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
      {!user.onboardingComplete ? (
        <OnboardingContinueCta title={ui.inbox.onboardingTitle} body={ui.inbox.onboardingBody} />
      ) : null}
      <InboxChatsShell
        userId={user.id}
        merged={merged}
        plansNeedingYourAction={plansNeedingYourAction}
        initialContacts={directContacts}
        showCreateSheet={user.onboardingComplete}
      />
    </div>
  );
}
