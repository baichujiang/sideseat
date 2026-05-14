import type { ComponentProps } from "react";
import Link from "next/link";
import type { Route } from "next";

import { PresetAvatar } from "@/components/ui/preset-avatar";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { cn } from "@/lib/utils";

type VerifiedStatus = ComponentProps<typeof VerifiedBadge>["status"];

export function BuddyAuthorCard({
  displayName,
  profileHref,
  avatarUrl,
  majorSemesterLine,
  school,
  verifiedStudent,
  studentVerificationStatus,
  viewProfileCta,
  viewProfileAria,
}: {
  displayName: string;
  profileHref: Route;
  avatarUrl: string | null;
  majorSemesterLine: string | null;
  school: string | null;
  verifiedStudent: boolean;
  studentVerificationStatus: VerifiedStatus;
  viewProfileCta: string;
  viewProfileAria: string;
}) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card/60 px-3 py-3 sm:px-4">
      <div className="flex gap-3">
        <Link href={profileHref} className="shrink-0 rounded-full ring-2 ring-background" aria-label={viewProfileAria}>
          <PresetAvatar id={avatarUrl} size={48} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[15px] font-semibold text-foreground">{displayName}</p>
            <VerifiedBadge
              size="xs"
              school={school}
              verifiedStudent={verifiedStudent}
              status={studentVerificationStatus}
            />
          </div>
          {majorSemesterLine ? (
            <p className="mt-1 text-[13px] text-muted-foreground">{majorSemesterLine}</p>
          ) : null}
        </div>
      </div>
      <Link
        href={profileHref}
        aria-label={viewProfileAria}
        className={cn(
          "mt-3 inline-flex h-10 items-center justify-center rounded-full border border-classmates-blue-border",
          "bg-classmates-blue-soft px-4 text-[13px] font-semibold text-classmates-blue no-underline",
          "hover:bg-classmates-blue-border/35 active:bg-classmates-blue-border/50",
        )}
      >
        {viewProfileCta}
      </Link>
    </section>
  );
}
