import type { Metadata, Route } from "next";
import dynamic from "next/dynamic";
import { redirect } from "next/navigation";

import { ScheduleSharePageLoading } from "@/components/schedule-share/schedule-share-page-loading";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";
import { buildOwnerPreviewScheduleShareSnapshotForActiveLink } from "@/lib/schedule-share/public-snapshot";
import { findScheduleShareLinkByPlainToken } from "@/lib/schedule-share/resolve-link";
import {
  scheduleShareRecipientViewHref,
  scheduleShareRecipientViewUrl,
} from "@/lib/schedule-share/share-link-urls";
import { resolveBackHref } from "@/lib/nav/back";
import { isScheduleShareOwner } from "@/lib/schedule-share/usage-limit";

const ScheduleShareOwnerClient = dynamic(
  () =>
    import("@/components/schedule-share/schedule-share-owner-client").then(
      (mod) => mod.ScheduleShareOwnerClient,
    ),
  { loading: () => <ScheduleSharePageLoading /> },
);

export async function generateMetadata({
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const locale = await getServerAppLocale();
  const messages = getMessages(locale);
  return {
    title: messages.scheduleShare.ownerPageTitle,
    robots: { index: false, follow: false },
  };
}

export default async function ShareScheduleOwnerEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const { token } = await params;
  const query = (await searchParams) ?? {};
  const backHref = resolveBackHref(query.returnTo, "/home");
  const decoded = decodeURIComponent(token);
  const sessionUser = await getSessionUser();

  const resolved = await findScheduleShareLinkByPlainToken(prisma, decoded, {
    viewerUserId: sessionUser?.id,
  });

  if (!resolved.ok) {
    redirect(scheduleShareRecipientViewHref(decoded, { returnTo: query.returnTo }) as Route);
  }

  const isOwner = isScheduleShareOwner(resolved.link, sessionUser?.id);
  if (!isOwner || !sessionUser?.onboardingComplete) {
    redirect(scheduleShareRecipientViewHref(decoded, { returnTo: query.returnTo }) as Route);
  }

  const ownerPreviewSnapshot = await buildOwnerPreviewScheduleShareSnapshotForActiveLink(
    prisma,
    resolved.link,
  );
  const categories = await prisma.userCalendarCategory.findMany({
    where: { userId: sessionUser.id },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, presetKey: true, color: true },
  });
  const appOrigin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const guestShareUrl = scheduleShareRecipientViewUrl(appOrigin, decoded);

  return (
    <ScheduleShareOwnerClient
      token={decoded}
      backHref={backHref}
      shareUrl={guestShareUrl}
      initialSnapshot={ownerPreviewSnapshot}
      linkSettings={{
        rangeStart: resolved.link.rangeStart.toISOString(),
        rangeEnd: resolved.link.rangeEnd.toISOString(),
        revealConfig: resolved.link.revealConfig,
        allowGuestProposals: resolved.link.allowGuestProposals,
        usageLimit: resolved.link.usageLimit,
        expiresAt: resolved.link.expiresAt.toISOString(),
        createdAt: resolved.link.createdAt.toISOString(),
      }}
      calendarCategories={categories}
    />
  );
}
