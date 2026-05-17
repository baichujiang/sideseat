import type { Metadata } from "next";

import { ScheduleSharePublicClient } from "@/components/schedule-share/schedule-share-public-client";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";
import { buildPublicScheduleShareSnapshotForActiveLink } from "@/lib/schedule-share/public-snapshot";
import { buildSharePublicHeadline } from "@/lib/schedule-share/format-share-public-headline";
import { findScheduleShareLinkByPlainToken } from "@/lib/schedule-share/resolve-link";
import { scheduleShareOwnerDisplayLabel } from "@/lib/schedule-share/build-schedule-share-snapshot";
import { serializeViewerProposal } from "@/lib/schedule-share/viewer-proposal";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const decoded = decodeURIComponent(token);
  const locale = await getServerAppLocale();
  const messages = getMessages(locale);
  const s = messages.scheduleShare;

  const resolved = await findScheduleShareLinkByPlainToken(prisma, decoded);
  if (!resolved.ok) {
    return {
      title: s.publicUnavailableTitle,
      robots: { index: false, follow: false },
    };
  }

  const owner =
    scheduleShareOwnerDisplayLabel(resolved.link.owner) ?? s.ownerDisplayFallback;
  const { headline } = buildSharePublicHeadline({
    ownerDisplayLabel: owner,
    ownerFallback: s.ownerDisplayFallback,
    rangeStart: resolved.link.rangeStart,
    rangeEnd: resolved.link.rangeEnd,
    locale,
    messages,
  });

  return {
    title: headline,
    robots: { index: false, follow: false },
  };
}

export default async function ShareSchedulePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const decoded = decodeURIComponent(token);
  const sessionUser = await getSessionUser();
  const showGuestNudge = !sessionUser;

  const resolved = await findScheduleShareLinkByPlainToken(prisma, decoded);

  if (!resolved.ok) {
    return <ScheduleSharePublicClient unavailable showGuestNudge={showGuestNudge} />;
  }

  const snapshot = await buildPublicScheduleShareSnapshotForActiveLink(prisma, resolved.link);

  let initialMyProposal = null;
  if (sessionUser?.onboardingComplete) {
    const row = await prisma.scheduleShareGuestProposal.findFirst({
      where: {
        scheduleShareLinkId: resolved.link.id,
        proposerUserId: sessionUser.id,
        status: { in: ["PENDING", "ACCEPTED"] },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        note: true,
        location: true,
        startTime: true,
        endTime: true,
        status: true,
      },
    });
    initialMyProposal = row ? serializeViewerProposal(row) : null;
  }

  return (
    <ScheduleSharePublicClient
      token={decoded}
      snapshot={snapshot}
      showGuestNudge={showGuestNudge}
      initialMyProposal={initialMyProposal}
    />
  );
}
