import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { Info, KeyRound, LogOut, Mail, ShieldBan, UserX } from "lucide-react";

import { LogoutForm } from "@/components/auth/logout-form";
import { BackLink } from "@/components/nav/back-link";
import { meSettingsRowListIconShellLargeClass } from "@/components/profile/me-settings-row";
import { ReplayTutorialAccountRow } from "@/components/profile/replay-tutorial-account-row";
import { LanguagePreferenceCard } from "@/components/settings/language-preference-card";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { formatMessage, getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";

export default async function ProfileAccountPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const locale = await getServerAppLocale();
  const m = getMessages(locale);
  const blockedCount = await prisma.block.count({ where: { blockerId: user.id } });
  const blockedMeta =
    blockedCount === 0
      ? m.account.blockedNone
      : blockedCount === 1
        ? m.account.blockedOne
        : formatMessage(m.account.blockedMany, { count: blockedCount });

  const loginEmailMeta = user.email?.trim() ? user.email.trim() : m.account.loginEmail.notSet;

  return (
    <div className="space-y-5 pb-2">
      <header className="flex items-center gap-2 px-0.5">
        <BackLink fallback="/profile" label={m.account.back} />
        <div>
          <h1 className="page-screen-title-ink">{m.account.title}</h1>
          <p className="page-screen-subtitle mt-0.5">{m.account.subtitle}</p>
        </div>
      </header>

      <LanguagePreferenceCard />

      <div className="overflow-hidden rounded-2xl border border-classmates-edge bg-classmates-surface shadow-[0_4px_14px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card">
        {!user.isGuest ? (
          <>
            <Link
              href="/profile/account/login-email"
              className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors active:bg-classmates-warm-alt dark:active:bg-muted/30 [@media(hover:hover)]:hover:bg-classmates-warm-alt dark:[@media(hover:hover)]:hover:bg-muted/25"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className={meSettingsRowListIconShellLargeClass}>
                  <Mail className="h-5 w-5" strokeWidth={2} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold leading-tight text-foreground">
                    {m.account.loginEmail.title}
                  </p>
                  <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{loginEmailMeta}</p>
                </div>
              </div>
            </Link>
            <Link
              href="/profile/account/password"
              className="flex items-center justify-between gap-3 border-t border-classmates-hairline px-4 py-3.5 transition-colors active:bg-classmates-warm-alt dark:border-border/60 dark:active:bg-muted/30 [@media(hover:hover)]:hover:bg-classmates-warm-alt dark:[@media(hover:hover)]:hover:bg-muted/25"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className={meSettingsRowListIconShellLargeClass}>
                  <KeyRound className="h-5 w-5" strokeWidth={2} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold leading-tight text-foreground">
                    {m.account.changePassword.title}
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {m.account.changePassword.listSubtitle}
                  </p>
                </div>
              </div>
            </Link>
          </>
        ) : null}
        <ReplayTutorialAccountRow className={!user.isGuest ? "border-t border-classmates-hairline dark:border-border/60" : undefined} />
        <Link
          href="/profile/blocked"
          className="flex items-center justify-between gap-3 border-t border-classmates-hairline px-4 py-3.5 transition-colors active:bg-classmates-warm-alt dark:border-border/60 dark:active:bg-muted/30 [@media(hover:hover)]:hover:bg-classmates-warm-alt dark:[@media(hover:hover)]:hover:bg-muted/25"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className={meSettingsRowListIconShellLargeClass}>
              <ShieldBan className="h-5 w-5" strokeWidth={2} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold leading-tight text-foreground">{m.account.blockedTitle}</p>
              <p className="mt-1 text-[12px] font-medium tabular-nums text-muted-foreground">{blockedMeta}</p>
            </div>
          </div>
        </Link>
        <Link
          href={"/about" as Route}
          className="flex items-center justify-between gap-3 border-t border-classmates-hairline px-4 py-3.5 transition-colors active:bg-classmates-warm-alt dark:border-border/60 dark:active:bg-muted/30 [@media(hover:hover)]:hover:bg-classmates-warm-alt dark:[@media(hover:hover)]:hover:bg-muted/25"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className={meSettingsRowListIconShellLargeClass}>
              <Info className="h-5 w-5" strokeWidth={2} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold leading-tight text-foreground">{m.account.aboutTitle}</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">{m.account.aboutSubtitle}</p>
            </div>
          </div>
        </Link>
        <Link
          href="/profile/account/delete"
          className="flex items-center justify-between gap-3 border-t border-classmates-hairline px-4 py-3.5 transition-colors active:bg-classmates-warm-alt dark:border-border/60 dark:active:bg-muted/30 [@media(hover:hover)]:hover:bg-classmates-warm-alt dark:[@media(hover:hover)]:hover:bg-muted/25"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <UserX className="h-5 w-5" strokeWidth={2} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold leading-tight text-destructive">{m.account.deleteTitle}</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">{m.account.deleteSubtitle}</p>
            </div>
          </div>
        </Link>
        <LogoutForm className="block">
          <button
            type="submit"
            className="flex w-full items-center gap-3 border-t border-classmates-hairline px-4 py-3.5 text-left transition-colors active:bg-classmates-warm-alt dark:border-border/60 dark:active:bg-muted/30 [@media(hover:hover)]:hover:bg-classmates-warm-alt dark:[@media(hover:hover)]:hover:bg-muted/25"
          >
            <span className={meSettingsRowListIconShellLargeClass}>
              <LogOut className="h-5 w-5" strokeWidth={2} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold leading-tight text-foreground">{m.account.logOut}</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">{m.me.logOutRowSubtitle}</p>
            </div>
          </button>
        </LogoutForm>
      </div>
    </div>
  );
}
