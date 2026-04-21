import { cn } from "@/lib/utils";
import { DEFAULT_AVATAR_ID, getAvatarSrc, isValidAvatarId } from "@/lib/constants/avatars";

/**
 * Renders one of the preset avatars (JPEGs shipped in `/public/avatars/`).
 * Pass `size` to control the rendered dimensions; the image stays square and
 * is clipped to a circle via CSS. `alt` stays empty because the avatar is
 * decorative — nicknames live next to it in every context.
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
  const safeId = isValidAvatarId(id) ? id : DEFAULT_AVATAR_ID;
  return (
    <img
      alt=""
      aria-hidden="true"
      className={cn("block rounded-full object-cover", className)}
      height={size}
      src={getAvatarSrc(safeId)}
      width={size}
    />
  );
}
