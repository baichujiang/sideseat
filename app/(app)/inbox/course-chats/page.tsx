import { GuestAppCta } from "@/components/app/guest-app-cta";
import { InboxChatsView } from "@/components/inbox/inbox-chats-view";
import { BackLink } from "@/components/nav/back-link";
import { getSessionUser } from "@/lib/auth/session";
import { getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";
import { getInboxMergeBundle } from "@/lib/queries/inbox-merge";

const RETURN_TO = "/inbox/course-chats";

export default async function InboxCourseChatsPage() {
  const sessionUser = await getSessionUser();
  const locale = await getServerAppLocale();
  const ui = getMessages(locale);

  if (!sessionUser) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <BackLink fallback="/inbox" label={ui.common.back} />
          <h1 className="page-screen-title">{ui.inbox.courseChatsPageTitle}</h1>
        </div>
        <GuestAppCta returnTo={RETURN_TO} />
      </div>
    );
  }

  const { merged } = await getInboxMergeBundle(sessionUser.id);
  const courses = merged.filter((item) => item.kind === "course");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-0.5">
        <BackLink fallback="/inbox" label={ui.common.back} />
        <div>
          <h1 className="page-screen-title">{ui.inbox.courseChatsPageTitle}</h1>
          <p className="page-screen-subtitle mt-0.5">{ui.inbox.courseChatsPageSubtitle}</p>
        </div>
      </div>
      <InboxChatsView
        userId={sessionUser.id}
        merged={courses}
        query=""
        emptyKind="course"
        returnTo={RETURN_TO}
      />
    </div>
  );
}
