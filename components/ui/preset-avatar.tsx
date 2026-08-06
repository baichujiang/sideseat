"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";
import { DEFAULT_AVATAR_ID, getAvatarSrc, resolveAvatarImageSrc } from "@/lib/constants/avatars";

/**
 * Renders a preset avatar (`/public/avatars/`) or a user-uploaded blob URL
 * stored in `User.avatarUrl`. `alt` stays empty — avatars are decorative.
 */
export function PresetAvatar({
  id,
  className,
  size = 48,
}: {
  id?: string | null;
  className?: string;
  size?: number;
}) {
  const primarySrc = resolveAvatarImageSrc(id);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [primarySrc]);

  const fallbackSrc = getAvatarSrc(DEFAULT_AVATAR_ID);
  const src = broken ? fallbackSrc : primarySrc;

  return (
    <Image
      alt=""
      aria-hidden="true"
      className={cn("block rounded-full object-cover", className)}
      height={size}
      src={src}
      unoptimized
      width={size}
      onError={() => setBroken(true)}
    />
  );
}
