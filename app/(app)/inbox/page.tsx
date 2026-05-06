import { redirect } from "next/navigation";

import { InboxChatsView } from "@/components/inbox/inbox-chats-view";
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
  if (!sessionUser.onboardingComplete) {
    redirect("/onboarding");
  }
  const user = sessionUser;

  const { merged, unreadTotal, plansNeedingYourAction, activePostCount } = await getInboxMergeBundle(
    user.id,
  );
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

      return [
        "course",
        item.course.id,
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
        <h1 className="page-screen-title">Chats</h1>
        <p className="page-screen-subtitle mt-0.5">
          Course chats and direct conversations
        </p>
      </header>

      <InboxQuickChips
        unreadTotal={unreadTotal}
        plansNeedingYourAction={plansNeedingYourAction}
        activePostCount={activePostCount}
      />

      <InboxChatsView userId={user.id} merged={merged} />
    </div>
  );
}
