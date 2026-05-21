import { redirect } from "next/navigation";

import { BackLink } from "@/components/nav/back-link";
import { ChangePasswordCard } from "@/components/profile/change-password-card";
import { getSessionUser } from "@/lib/auth/session";
import { getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";

export default async function ChangePasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.isGuest) redirect("/profile/account");

  const locale = await getServerAppLocale();
  const m = getMessages(locale);

  return (
    <div className="space-y-5 pb-2">
      <header className="flex items-center gap-2 px-0.5">
        <BackLink fallback="/profile/account" label={m.account.back} />
        <div>
          <h1 className="page-screen-title-ink">{m.account.changePassword.title}</h1>
          <p className="page-screen-subtitle mt-0.5">{m.account.changePassword.hint}</p>
        </div>
      </header>

      <ChangePasswordCard variant="form" />
    </div>
  );
}
