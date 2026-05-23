import { redirect } from "next/navigation";

import { ProfileDiscoverCityEditor } from "@/components/profile/edit/profile-discover-city-editor";
import { ProfileSubpageShell } from "@/components/profile/profile-subpage-shell";
import { getServerDiscoverServedCity } from "@/lib/discover/discover-city-preference";
import { getSessionUser } from "@/lib/auth/session";
import { getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";

export default async function ProfileDiscoverCityPage() {
  const user = await getSessionUser();
  if (!user || user.isGuest) redirect("/profile");
  const locale = await getServerAppLocale();
  const pr = getMessages(locale).profile;
  const city = await getServerDiscoverServedCity();

  return (
    <ProfileSubpageShell
      title={pr.discoverCityRowTitle}
      subtitle={pr.discoverCityRowSubtitle}
      backFallback="/profile/info"
    >
      <ProfileDiscoverCityEditor city={city} />
    </ProfileSubpageShell>
  );
}
