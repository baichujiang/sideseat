import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { publicIntention } from "@/lib/intent-share/service";
import { getSessionUser } from "@/lib/auth/session";
import { shareCopy } from "@/lib/intent-share/copy";
import { resolveShareLocale, SHARE_LOCALE_COOKIE } from "@/lib/intent-share/locale";
import { IntentShareClient } from "./share-client";
import styles from "./share.module.css";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ lang?: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const value = await publicIntention((await params).token);
  const title = value ? `${value.host} · ${value.title} | SideSeat` : "SideSeat";
  const description = value ? [value.note, ...value.timeWindows.map(w => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: value.timeZone }).format(new Date(w.startAt)))].filter(Boolean).join(' · ') || 'Open this invitation to see available times and say hello.' : '';
  return { title, description, robots: { index: false, follow: false }, openGraph: { title, description, type: "website" } };
}
export default async function Page({ params, searchParams }: Props) {
  const { token } = await params;
  const requested = (await searchParams).lang;
  const [jar, requestHeaders] = await Promise.all([cookies(), headers()]);
  const locale = resolveShareLocale({ requested, saved: jar.get(SHARE_LOCALE_COOKIE)?.value,
    acceptLanguage: requestHeaders.get("accept-language") });
  const user = await getSessionUser();
  const value = await publicIntention(token, user?.id);
  if (!value) return <main lang={locale} className={styles.page}><div className={styles.wrap}><header className={styles.brand}>SideSeat<span>together, naturally.</span></header><section className={styles.card}><h1>{shareCopy[locale].unavailable}</h1></section></div></main>;
  return <IntentShareClient token={token} intention={value} locale={locale} />;
}
