import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";

import { BackLink } from "@/components/nav/back-link";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { cn } from "@/lib/utils";

type VerifiedStatus = ComponentProps<typeof VerifiedBadge>["status"];

export function BuddyRequestTopBar({
  backHref,
  backFallback = "/discover",
  backLabel,
  authorName,
  profileHref,
  avatarUrl,
  school,
  verifiedStudent,
  studentVerificationStatus,
  showProfileCue,
  shareSlot,
}: {
  backHref: Route;
  backFallback?: string;
  backLabel: string;
  authorName: string;
  profileHref: Route;
  avatarUrl: string | null;
  school: string | null;
  verifiedStudent: boolean;
  studentVerificationStatus: VerifiedStatus;
  showProfileCue: boolean;
  shareSlot: ReactNode;
}) {
  return (
    <div
      data-testid="buddy-request-top-bar"
      className={cn(
        "flex items-center gap-2 border-b border-border/70 bg-card/80 px-3 py-2.5 sm:px-4",
        "rounded-t-[1.25rem]",
      )}
    >
      <BackLink href={backHref} fallback={backFallback} label={backLabel} className="shrink-0" />
      <Link
        href={profileHref}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-0.5 pr-1 no-underline hover:bg-muted/40"
      >
        <PresetAvatar id={avatarUrl} size={36} className="shrink-0 ring-2 ring-background" />
        <span className="truncate text-[14px] font-semibold text-foreground">{authorName}</span>
        <VerifiedBadge
          size="xs"
          school={school}
          verifiedStudent={verifiedStudent}
          status={studentVerificationStatus}
        />
        {showProfileCue ? (
          <span className="sr-only">Profile</span>
        ) : null}
      </Link>
      {shareSlot ? <div className="shrink-0">{shareSlot}</div> : null}
    </div>
  );
}
