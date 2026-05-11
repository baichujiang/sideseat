"use client";

import { MessageCircle, Share2 } from "lucide-react";
import { useCallback, useMemo } from "react";

import { SharePlatformMenu, type SharePlatformMenuAction } from "@/components/discover/share-platform-menu";
import { shareClassmatePostToWeChat } from "@/lib/discover/share-classmate-post-to-wechat";
import { shareClassmatePostToXhs } from "@/lib/discover/share-classmate-post-to-xhs";

export function ClassmatePostDetailShareMenu({
  title,
  body,
  postPath,
  className,
}: {
  title: string;
  body: string | null;
  postPath: string;
  className?: string;
}) {
  const runXhsShare = useCallback(async () => {
    const result = await shareClassmatePostToXhs({ title, body, postPath });
    if (result === "clipboard") {
      return { copied: true };
    }
    return undefined;
  }, [title, body, postPath]);

  const runWeChatShare = useCallback(async () => {
    const result = await shareClassmatePostToWeChat({ title, body, postPath });
    if (result === "clipboard") {
      return { copied: true };
    }
    return undefined;
  }, [title, body, postPath]);

  const actions = useMemo<SharePlatformMenuAction[]>(
    () => [
      {
        id: "xhs",
        label: "分享到小红书",
        icon: Share2,
        copiedAriaLabel: "Copied — paste in 小红书",
        run: runXhsShare,
      },
      {
        id: "wechat",
        label: "分享到微信",
        icon: MessageCircle,
        copiedAriaLabel: "Copied — paste in 微信",
        run: runWeChatShare,
      },
    ],
    [runWeChatShare, runXhsShare],
  );

  return (
    <SharePlatformMenu
      actions={actions}
      idleAriaLabel="Share post"
      copiedAriaLabel="Copied"
      className={className}
    />
  );
}
