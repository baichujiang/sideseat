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
            {APP_NAME} helps you plan with classmates—courses, chats, and your calendar in one app.
          </p>
        </div>
      </header>

      <div className="space-y-3 rounded-2xl border border-classmates-edge bg-classmates-surface px-4 py-4 text-[14px] leading-relaxed text-foreground shadow-[0_4px_14px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card dark:text-foreground">
        <p className="text-muted-foreground">
          See what&apos;s on your schedule, stay in touch in course threads, and meet people in your program without
          juggling a dozen tools.
        </p>
        <p className="text-muted-foreground">
          Have a question or an idea? Go to{" "}
          <Link href={"/profile" as Route} className="font-semibold text-classmates-azure underline-offset-2 hover:underline">
            Profile
          </Link>{" "}
          and send <strong className="text-foreground">Feedback</strong>—we read every submission.
        </p>
        {email && mailto ? (
          <p className="text-muted-foreground">
            You can also email us at{" "}
            <a className="font-semibold text-classmates-azure underline-offset-2 hover:underline" href={mailto}>
              {email}
            </a>
            .
          </p>
        ) : null}
      </div>

      <p className="px-0.5 text-center text-[12px] text-muted-foreground">
        <Link href={"/profile/account" as Route} className="underline-offset-2 hover:underline">
          Preferences & account
        </Link>
      </p>
    </div>
  );
}
