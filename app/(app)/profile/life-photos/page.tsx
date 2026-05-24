import { redirect } from "next/navigation";

import {
  ProfileLifePhotosEditor,
  type LifePhotoRow,
} from "@/components/profile/profile-life-photos-editor";
import { ProfileSubpageShell } from "@/components/profile/profile-subpage-shell";
import { getSessionUser } from "@/lib/auth/session";
import { getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";
import { prisma } from "@/lib/db/prisma";

export default async function ProfileLifePhotosPage() {
  const user = await getSessionUser();
  if (!user || user.isGuest) redirect("/profile");
  const locale = await getServerAppLocale();
  const ui = getMessages(locale);

  const rows = await prisma.userLifePhoto.findMany({
    where: { userId: user.id },
    orderBy: { sortOrder: "asc" },
    select: { id: true, url: true, sortOrder: true },
  });
  const initialPhotos: LifePhotoRow[] = rows.map((r) => ({
    id: r.id,
    url: r.url,
    sortOrder: r.sortOrder,
  }));

  return (
    <ProfileSubpageShell title={ui.profileLifePhotos.pageTitle} backFallback="/profile/info">
      <ProfileLifePhotosEditor initialPhotos={initialPhotos} />
    </ProfileSubpageShell>
  );
}
