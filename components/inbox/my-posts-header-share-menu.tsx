"use client";

import { Link2, Share2 } from "lucide-react";
import { useCallback, useMemo } from "react";

import { SharePlatformMenu, type SharePlatformMenuAction } from "@/components/discover/share-platform-menu";
import { shareClassmatePostToXhs } from "@/lib/discover/share-classmate-post-to-xhs";

const MY_POSTS_PATH = "/profile/my-posts";

/**
 * My posts is a **list** (no single selected post). Header share therefore targets this
 * **listings page URL** (plus title/blurb for 小红书), not one Discover post. Peers cannot
 * open `/profile/my-posts` without your account — the flow is for the author to copy/share
 * a reminder link or paste text into 小红书 themselves.
 */
export function MyPostsHeaderShareMenu({ className }: { className?: string }) {
  const runCopyPageLink = useCallback(async () => {
    const url = `${window.location.origin}${MY_POSTS_PATH}`;
    try {
      await navigator.clipboard.writeText(url);
      return { copied: true };
    } catch {
      window.prompt("Copy link — select all, then copy:", url);
      return undefined;
    }
  }, []);

  const runXhsShare = useCallback(async () => {
    const result = await shareClassmatePostToXhs({
      title: "My posts",
      body: "My Discover listings on SideSeat — open the app to view and manage posts.",
      postPath: MY_POSTS_PATH,
      footer: "— SideSeat · my listings",
    });
    if (result === "clipboard") {
      return { copied: true };
    }
    return undefined;
  }, []);

  const actions = useMemo<SharePlatformMenuAction[]>(
    () => [
      {
        id: "xhs",
        label: "分享到小红书",
        icon: Share2,
        run: runXhsShare,
      },
      {
        id: "copy",
        label: "复制我的帖子页链接",
        icon: Link2,
        run: runCopyPageLink,
      },
    ],
    [runCopyPageLink, runXhsShare],
  );

  return (
    <SharePlatformMenu
      actions={actions}
      idleAriaLabel="Share My posts page"
      copiedAriaLabel="Copied"
      className={className}
    />
  );
}
