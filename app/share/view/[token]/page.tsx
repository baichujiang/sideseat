import type { Metadata } from "next";
import dynamic from "next/dynamic";

import { ScheduleSharePageLoading } from "@/components/schedule-share/schedule-share-page-loading";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";
import { scheduleShareOwnerDisplayLabel } from "@/lib/schedule-share/build-schedule-share-snapshot";
import { buildSharePublicHeadline } from "@/lib/schedule-share/format-share-public-headline";
import { loadInitialViewerProposalForShareLink } from "@/lib/schedule-share/load-initial-viewer-proposal";
import { loadScheduleShareRecipientPage } from "@/lib/schedule-share/load-recipient-page";
import { scheduleShareOwnerEditPath } from "@/lib/schedule-share/share-link-urls";
import { isScheduleShareOwner } from "@/lib/schedule-share/usage-limit";

const ScheduleShareRecipientPage = dynamic(
  () =>
    import("@/components/schedule-share/schedule-share-recipient-page").then(
      (mod) => mod.ScheduleShareRecipientPage,
    ),
  { loading: () => <ScheduleSharePageLoading /> },
);

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

  const loaded = await loadScheduleShareRecipientPage(prisma, decoded);
  if (!loaded.ok) {
    return {
      title: s.publicUnavailableTitle,
      robots: { index: false, follow: false },
    };
  }

  const owner =
    scheduleShareOwnerDisplayLabel(loaded.resolved.link.owner) ?? s.ownerDisplayFallback;
  const { headline } = buildSharePublicHeadline({
    ownerDisplayLabel: owner,
    ownerFallback: s.ownerDisplayFallback,
    rangeStart: loaded.resolved.link.rangeStart,
    rangeEnd: loaded.resolved.link.rangeEnd,
    locale,
    messages,
  });

  return {
    title: headline,
    robots: { index: false, follow: false },
  };
}

export default async function ShareScheduleRecipientViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const { token } = await params;
  const query = (await searchParams) ?? {};
  const decoded = decodeURIComponent(token);
  const sessionUser = await getSessionUser();
  const showGuestNudge = !sessionUser;

  const loaded = await loadScheduleShareRecipientPage(prisma, decoded, {
    viewerUserId: sessionUser?.id,
  });

  if (!loaded.ok) {
    return (
      <ScheduleShareRecipientPage
        unavailable
        showGuestNudge={showGuestNudge}
        backReturnTo={query.returnTo}
        backFallback="/inbox"
      />
    );
  }

  const locale = await getServerAppLocale();
  const messages = getMessages(locale);
  const s = messages.scheduleShare;
  const owner =
    scheduleShareOwnerDisplayLabel(loaded.resolved.link.owner) ?? s.ownerDisplayFallback;
  const isLinkOwner = isScheduleShareOwner(loaded.resolved.link, sessionUser?.id);
  const shareHeadline = buildSharePublicHeadline({
    ownerDisplayLabel: owner,
    ownerFallback: s.ownerDisplayFallback,
    rangeStart: loaded.resolved.link.rangeStart,
    rangeEnd: loaded.resolved.link.rangeEnd,
    locale,
    messages,
  });
  const pageHeadline = isLinkOwner ? s.recipientOwnerViewHeadline : shareHeadline.headline;
  const rangeDetail = shareHeadline.rangeDetail;

  let initialMyProposal = null;
  if (sessionUser?.onboardingComplete) {
    initialMyProposal = await loadInitialViewerProposalForShareLink(
      prisma,
      loaded.resolved.link.id,
      sessionUser.id,
    );
  }

  return (
    <ScheduleShareRecipientPage
      token={decoded}
      snapshot={loaded.snapshot}
      pageHeadline={pageHeadline}
      rangeDetail={rangeDetail}
      showGuestNudge={showGuestNudge}
      isLinkOwner={isLinkOwner && Boolean(sessionUser?.onboardingComplete)}
      ownerEditPath={isLinkOwner ? scheduleShareOwnerEditPath(decoded) : undefined}
      initialMyProposal={initialMyProposal}
      backReturnTo={query.returnTo}
      backFallback="/inbox"
    />
  );
}
