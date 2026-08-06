import { redirect } from "next/navigation";

import { BackLink } from "@/components/nav/back-link";
import { DeleteAccountForm } from "@/components/profile/delete-account-form";
import { getSessionUser } from "@/lib/auth/session";
import { getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";

export default async function DeleteAccountPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const locale = await getServerAppLocale();
  const messages = getMessages(locale);
  return (
    <div className="space-y-5 pb-2">
      <header className="flex items-center gap-2 px-0.5">
        <BackLink fallback="/profile/account" label={messages.common.back} />
        <div>
          <h1 className="page-screen-title-ink">{messages.account.deleteTitle}</h1>
          <p className="page-screen-subtitle mt-0.5">{messages.account.deleteSubtitle}</p>
        </div>
      </header>

      <DeleteAccountForm username={user.username} />
    </div>
  );
}
