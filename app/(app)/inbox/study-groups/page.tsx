import { GuestAppCta } from "@/components/app/guest-app-cta";
import { InboxChatsView } from "@/components/inbox/inbox-chats-view";
import { BackLink } from "@/components/nav/back-link";
import { getSessionUser } from "@/lib/auth/session";
import { getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";
import { getInboxMergeBundle } from "@/lib/queries/inbox-merge";

const RETURN_TO = "/inbox/study-groups";

export default async function InboxStudyGroupsPage() {
  const sessionUser = await getSessionUser();
  const locale = await getServerAppLocale();
  const ui = getMessages(locale);

  if (!sessionUser) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <BackLink fallback="/inbox" label={ui.common.back} />
          <h1 className="page-screen-title">{ui.inbox.studyGroupsPageTitle}</h1>
        </div>
        <GuestAppCta returnTo={RETURN_TO} />
      </div>
    );
  }

  const { merged } = await getInboxMergeBundle(sessionUser.id);
  const groups = merged.filter((item) => item.kind === "group");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-0.5">
        <BackLink fallback="/inbox" label={ui.common.back} />
        <div>
          <h1 className="page-screen-title">{ui.inbox.studyGroupsPageTitle}</h1>
          <p className="page-screen-subtitle mt-0.5">{ui.inbox.studyGroupsPageSubtitle}</p>
        </div>
      </div>
      <InboxChatsView
        userId={sessionUser.id}
        merged={groups}
        query=""
        emptyKind="group"
        returnTo={RETURN_TO}
      />
    </div>
  );
}
