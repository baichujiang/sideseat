import { OnboardingContinueCta } from "@/components/app/onboarding-continue-cta";
import { InboxChatsView } from "@/components/inbox/inbox-chats-view";
import { InboxCreateSheet } from "@/components/inbox/inbox-create-sheet";
import { InboxQuickChips } from "@/components/inbox/inbox-quick-chips";
import { InboxRealtimeRefresh } from "@/components/inbox/inbox-realtime-refresh";
import { GuestAppCta } from "@/components/app/guest-app-cta";
import { getSessionUser } from "@/lib/auth/session";
import { getInboxMergeBundle } from "@/lib/queries/inbox-merge";

export default async function InboxPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return (
      <div className="space-y-3">
        <header className="px-0.5">
          <h1 className="page-screen-title">Chats</h1>
          <p className="page-screen-subtitle mt-0.5">
            Course chats and direct conversations
          </p>
        </header>
        <GuestAppCta
          returnTo="/inbox"
          headline="Sign in to see your chats"
          body="Your inbox syncs across devices once you log in."
        />
      </div>
    );
  }
  const user = sessionUser;

  const { merged, unreadTotal, plansNeedingYourAction, activePostCount } = await getInboxMergeBundle(
    user.id,
  );
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
  const inboxVersion = merged
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

  return (
    <div className="space-y-3">
      <InboxRealtimeRefresh version={inboxVersion} />
      <header className="px-0.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="page-screen-title">Chats</h1>
            <p className="page-screen-subtitle mt-0.5">
              Course chats, contacts, and group conversations
            </p>
          </div>
          {user.onboardingComplete ? <InboxCreateSheet initialContacts={directContacts} /> : null}
        </div>
      </header>

      {!user.onboardingComplete ? (
        <OnboardingContinueCta
          title="Finish setup when you're ready"
          body="Your inbox is already available. Completing your profile helps classmates recognize you more easily."
        />
      ) : null}

      <InboxQuickChips
        unreadTotal={unreadTotal}
        plansNeedingYourAction={plansNeedingYourAction}
        activePostCount={activePostCount}
      />

      <InboxChatsView userId={user.id} merged={merged} />
    </div>
  );
}
