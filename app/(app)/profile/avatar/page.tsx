import { redirect } from "next/navigation";

import { ProfileAvatarEditor } from "@/components/profile/edit/profile-avatar-editor";
import { ProfileSubpageShell } from "@/components/profile/profile-subpage-shell";
import { getSessionUser } from "@/lib/auth/session";
import { getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";

export default async function ProfileAvatarPage() {
  const user = await getSessionUser();
  if (!user || user.isGuest) redirect("/profile");
  const locale = await getServerAppLocale();
  const t = getMessages(locale).meIdentity;

  return (
    <ProfileSubpageShell title={t.rowPhoto} backFallback="/profile/info">
      <ProfileAvatarEditor initialAvatarUrl={user.avatarUrl} />
    </ProfileSubpageShell>
  );
}
