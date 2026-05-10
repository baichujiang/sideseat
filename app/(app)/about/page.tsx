import Link from "next/link";
import type { Route } from "next";

import { BackLink } from "@/components/nav/back-link";
import { APP_NAME } from "@/lib/constants/app";
import { getPublicSupportEmail, getSupportMailto } from "@/lib/constants/support";

export default function AboutPage() {
  const email = getPublicSupportEmail();
  const mailto = getSupportMailto();

  return (
    <div className="space-y-5 pb-2">
      <header className="flex items-center gap-2 px-0.5">
        <BackLink href="/profile/account" label="Back" />
        <div>
          <h1 className="page-screen-title-ink">About</h1>
          <p className="page-screen-subtitle mt-0.5">
            {APP_NAME} — courses, chats, and your schedule in one place.
          </p>
        </div>
      </header>

      <div className="space-y-3 rounded-2xl border border-classmates-edge bg-classmates-surface px-4 py-4 text-[14px] leading-relaxed text-foreground shadow-[0_4px_14px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card dark:text-foreground">
        <p className="text-muted-foreground">
          Tell us what you want from <strong className="text-foreground">Me</strong> (top-right message button) — the
          team reads every note.
        </p>
        {email && mailto ? (
          <p className="text-muted-foreground">
            Prefer email? Reach us at{" "}
            <a className="font-semibold text-classmates-azure underline-offset-2 hover:underline" href={mailto}>
              {email}
            </a>
            .
          </p>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            To show a support address here, set <code className="rounded bg-muted px-1">NEXT_PUBLIC_SUPPORT_EMAIL</code>{" "}
            in your environment.
          </p>
        )}
      </div>

      <p className="px-0.5 text-center text-[12px] text-muted-foreground">
        <Link href={"/profile/account" as Route} className="underline-offset-2 hover:underline">
          Preferences & account
        </Link>
      </p>
    </div>
  );
}
