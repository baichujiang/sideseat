import { redirect } from "next/navigation";

import { ProfileNameEditor } from "@/components/profile/edit/profile-name-editor";
import { ProfileSubpageShell } from "@/components/profile/profile-subpage-shell";
import { getSessionUser } from "@/lib/auth/session";
import { getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";

export default async function ProfileNamePage() {
  const user = await getSessionUser();
  if (!user || user.isGuest) redirect("/profile");
  const locale = await getServerAppLocale();
  const t = getMessages(locale).meIdentity;

  return (
    <ProfileSubpageShell title={t.rowName} backFallback="/profile/info">
      <ProfileNameEditor initialNickname={user.nickname ?? ""} loginUsername={user.username} />
    </ProfileSubpageShell>
  );
}
