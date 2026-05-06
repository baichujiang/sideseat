import Link from "next/link";
import { redirect } from "next/navigation";
import { LifeBuoy, LogOut, ShieldBan } from "lucide-react";

import { LogoutForm } from "@/components/auth/logout-form";
import { BackLink } from "@/components/nav/back-link";
import { PushNotificationsCard } from "@/components/profile/push-notifications-card";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth/session";
import { getSupportMailto } from "@/lib/constants/support";
import { prisma } from "@/lib/db/prisma";

export default async function ProfileAccountPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!user.onboardingComplete) redirect('/onboarding');

  const blockedCount = await prisma.block.count({ where: { blockerId: user.id } });
  const supportMailto = getSupportMailto();

  return (
    <div className="space-y-5 pb-2">
      <header className="flex items-center gap-2 px-0.5">
        <BackLink href="/profile" label="Back" />
        <div>
          <h1 className="page-screen-title-ink">Preferences & account</h1>
          <p className="page-screen-subtitle mt-0.5">Notifications, safety, and support.</p>
        </div>
      </header>

      <PushNotificationsCard />

      <div className="overflow-hidden rounded-2xl border border-classmates-edge bg-classmates-surface shadow-[0_4px_14px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card">
        <Link
          href="/profile/blocked"
          className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors active:bg-classmates-warm-alt dark:active:bg-muted/30 [@media(hover:hover)]:hover:bg-classmates-warm-alt dark:[@media(hover:hover)]:hover:bg-muted/25"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <ShieldBan className="h-5 w-5" strokeWidth={2} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold leading-tight text-foreground">Blocked users</p>
              <p className="mt-1 text-[12px] font-medium tabular-nums text-muted-foreground">
                {blockedCount === 0 ? "None" : `${blockedCount} blocked`}
              </p>
            </div>
          </div>
        </Link>
        {supportMailto ? (
          <a
            href={supportMailto}
            className="flex items-center justify-between gap-3 border-t border-classmates-hairline px-4 py-3.5 transition-colors active:bg-classmates-warm-alt dark:border-border/60 dark:active:bg-muted/30 [@media(hover:hover)]:hover:bg-classmates-warm-alt dark:[@media(hover:hover)]:hover:bg-muted/25"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <LifeBuoy className="h-5 w-5" strokeWidth={2} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold leading-tight text-foreground">Help & feedback</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">Email the team</p>
              </div>
            </div>
          </a>
        ) : null}
      </div>

      <LogoutForm className="block">
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-full border border-classmates-edge bg-classmates-surface px-4 py-3 text-[14px] font-semibold text-classmates-ink shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors active:bg-classmates-warm-alt dark:border-border dark:bg-card dark:text-foreground dark:active:bg-muted/40 [@media(hover:hover)]:hover:bg-classmates-warm-alt dark:[@media(hover:hover)]:hover:bg-muted/25"
        >
          <LogOut className="h-4 w-4 shrink-0 opacity-70" strokeWidth={2} aria-hidden />
          Log out
        </button>
      </LogoutForm>
    </div>
  );
}
