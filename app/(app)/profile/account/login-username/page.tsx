import { redirect } from "next/navigation";

import { BackLink } from "@/components/nav/back-link";
import { LoginUsernameCard } from "@/components/profile/login-username-card";
import { isSystemAllocatedUsername } from "@/lib/auth/system-username";
import { getSessionUser } from "@/lib/auth/session";
import { getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";

export default async function LoginUsernamePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.isGuest) redirect("/profile/account");

  const locale = await getServerAppLocale();
  const m = getMessages(locale);
  const username = user.username?.trim() ?? "";
  if (!username) redirect("/profile/account");

  const showSystemHint = isSystemAllocatedUsername(username);

  return (
    <div className="space-y-5 pb-2">
      <header className="flex items-center gap-2 px-0.5">
        <BackLink fallback="/profile/account" label={m.account.back} />
        <div>
          <h1 className="page-screen-title-ink">{m.account.loginUsername.title}</h1>
          <p className="page-screen-subtitle mt-0.5">
            {showSystemHint ? m.account.loginUsername.hintSystem : m.account.loginUsername.hint}
          </p>
        </div>
      </header>

      <LoginUsernameCard currentUsername={username} variant="form" />
    </div>
  );
}
