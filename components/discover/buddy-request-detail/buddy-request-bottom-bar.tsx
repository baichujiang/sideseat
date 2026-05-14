"use client";

import Link from "next/link";
import type { Route } from "next";

import { ClassmatePostSaveButton } from "@/components/discover/classmate-post-save-button";
import {
  DiscoverMessageButton,
  discoverPrimarySolidCtaClassName,
} from "@/components/discover/discover-message-button";
import type { BuddyRequestDisplayStatus } from "@/lib/discover/buddy-request-status";
import { cn } from "@/lib/utils";

const BAR =
  "fixed bottom-0 left-0 right-0 z-30 border-t border-border/60 bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_24px_rgba(15,23,42,0.06)] backdrop-blur-sm dark:bg-background/90";

const PRIMARY_SHADOW =
  "shadow-[0_4px_14px_rgba(37,99,235,0.22)] dark:shadow-[0_4px_18px_rgba(37,99,235,0.18)]";

export function BuddyRequestBottomBar({
  variant,
  displayStatus,
  viewerCanMessage,
  postId,
  authorId,
  peerCourseId,
  postPath,
  initialSaved,
  signInHref,
  manageHref,
  messageCta,
  messageAria,
  signInCta,
  signInAria,
  manageCta,
  manageAria,
  expiredNote,
  closedNote,
  messagingUnavailable,
}: {
  variant: "guest" | "peer" | "author";
  displayStatus: BuddyRequestDisplayStatus;
  viewerCanMessage: boolean;
  postId: string;
  authorId: string;
  peerCourseId?: string;
  postPath: string;
  initialSaved: boolean;
  signInHref?: Route;
  manageHref?: Route;
  messageCta: string;
  messageAria: string;
  signInCta: string;
  signInAria: string;
  manageCta: string;
  manageAria: string;
  expiredNote: string;
  closedNote: string;
  messagingUnavailable: string;
}) {
  const showMessage =
    variant === "peer" &&
    displayStatus === "open" &&
    viewerCanMessage;

  const statusNote =
    variant === "peer" && displayStatus === "expired"
      ? expiredNote
      : variant === "peer" && displayStatus === "closed"
        ? closedNote
        : variant === "peer" && displayStatus === "open" && !viewerCanMessage
          ? messagingUnavailable
          : null;

  return (
    <div data-testid="buddy-request-bottom-bar" className={BAR}>
      {variant === "guest" && signInHref ? (
        <Link
          href={signInHref}
          aria-label={signInAria}
          className={cn(discoverPrimarySolidCtaClassName, PRIMARY_SHADOW, "text-center no-underline")}
        >
          {signInCta}
        </Link>
      ) : null}

      {variant === "author" && manageHref ? (
        <Link
          href={manageHref}
          aria-label={manageAria}
          data-testid="manage-request-button"
          className={cn(
            discoverPrimarySolidCtaClassName,
            PRIMARY_SHADOW,
            "text-center no-underline active:scale-[0.98]",
          )}
        >
          {manageCta}
        </Link>
      ) : null}

      {variant === "peer" ? (
        <div className="flex flex-col gap-2.5">
          {statusNote ? (
            <p className="text-center text-[12px] leading-snug text-muted-foreground">{statusNote}</p>
          ) : null}
          <div className={cn("flex items-stretch gap-2.5", !showMessage && "justify-end")}>
            {showMessage ? (
              <div data-testid="message-request-button" className="min-w-0 flex-1" role="group" aria-label={messageAria}>
                <DiscoverMessageButton
                  peerId={authorId}
                  courseId={peerCourseId}
                  returnTo={postPath}
                  tone="solid"
                  insightPostId={postId}
                  label={messageCta}
                  className={cn(discoverPrimarySolidCtaClassName, PRIMARY_SHADOW, "w-full")}
                />
              </div>
            ) : null}
            <ClassmatePostSaveButton postId={postId} initialSaved={initialSaved} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
