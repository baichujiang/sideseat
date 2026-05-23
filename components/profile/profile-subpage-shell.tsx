import type { ReactNode } from "react";

import { BackLink } from "@/components/nav/back-link";
import { getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";

export async function ProfileSubpageShell({
  title,
  subtitle,
  backFallback = "/profile",
  children,
}: {
  title: string;
  subtitle?: string;
  /** Profile field editors use `/profile/info`; the info hub uses `/profile`. */
  backFallback?: string;
  children: ReactNode;
}) {
  const locale = await getServerAppLocale();
  const t = getMessages(locale).meIdentity;

  return (
    <div className="space-y-5 pb-2">
      <header className="flex items-center gap-2 px-0.5">
        <BackLink fallback={backFallback} label={t.backAria} />
        <div className="min-w-0 flex-1">
          <h1 className="page-screen-title-ink">{title}</h1>
          {subtitle ? <p className="page-screen-subtitle mt-0.5">{subtitle}</p> : null}
        </div>
      </header>
      {children}
    </div>
  );
}
