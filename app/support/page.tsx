import type { Metadata } from "next";
import Link from "next/link";

import { getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerAppLocale();
  const legal = getMessages(locale).legal;
  return {
    title: `${legal.supportTitle} · SideSeat`,
    description: legal.supportMetaDescription,
  };
}

export default async function SupportPage() {
  const locale = await getServerAppLocale();
  const legal = getMessages(locale).legal;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl px-5 py-10 text-foreground">
      <p className="text-[13px] font-medium text-muted-foreground">
        <Link href="/" className="underline-offset-2 hover:underline">
          SideSeat
        </Link>
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{legal.supportTitle}</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{legal.supportIntro}</p>

      <section className="mt-8 space-y-4 text-[14px] leading-relaxed">
        <div className="rounded-2xl border border-border/70 bg-card/40 px-4 py-3.5">
          <p className="text-[12px] font-medium text-muted-foreground">{legal.supportEmailLabel}</p>
          <a className="mt-1 inline-block font-medium underline underline-offset-2" href="mailto:support@sideseat.app">
            support@sideseat.app
          </a>
        </div>
        <div className="rounded-2xl border border-border/70 bg-card/40 px-4 py-3.5">
          <p className="text-[12px] font-medium text-muted-foreground">{legal.supportInAppLabel}</p>
          <p className="mt-1 text-foreground/90">{legal.supportInAppBody}</p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-card/40 px-4 py-3.5">
          <p className="text-[12px] font-medium text-muted-foreground">{legal.supportPoliciesLabel}</p>
          <Link href="/privacy" className="mt-1 inline-block font-medium underline underline-offset-2">
            {legal.supportPrivacyLink}
          </Link>
        </div>
      </section>
    </main>
  );
}
