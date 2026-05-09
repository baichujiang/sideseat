import { UsersRound } from "lucide-react";

import { PresetAvatar } from "@/components/ui/preset-avatar";
import { cn } from "@/lib/utils";

export type GroupChatCollageParticipant = {
  userId: string;
  avatarUrl: string | null;
};

/**
 * Stacked member avatars for group chats (up to 9), same palette as inbox tiles.
 */
export function GroupChatAvatarCollage({
  participants,
  sizePx = 52,
  className,
}: {
  participants: ReadonlyArray<GroupChatCollageParticipant>;
  sizePx?: number;
  className?: string;
}) {
  const slice = participants.slice(0, 9);
  const n = slice.length;

  if (n === 0) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-2xl bg-classmates-blue-soft/80 text-classmates-blue shadow-sm ring-2 ring-background",
          className,
        )}
        style={{ width: sizePx, height: sizePx }}
      >
        <UsersRound className="h-[55%] w-[55%]" strokeWidth={2.2} aria-hidden />
      </span>
    );
  }

  const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const pad = 2;
  const gapPx = 2;
  const inner = sizePx - pad * 2;
  const cellW = (inner - (cols - 1) * gapPx) / cols;
  const cellH = (inner - (rows - 1) * gapPx) / rows;
  const avatarSize = Math.max(8, Math.floor(Math.min(cellW, cellH)));

  return (
    <span
      className={cn(
        "grid shrink-0 gap-0.5 overflow-hidden rounded-2xl bg-muted/35 p-0.5 shadow-sm ring-2 ring-background dark:bg-muted/20",
        className,
      )}
      style={{
        width: sizePx,
        height: sizePx,
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
      }}
    >
      {slice.map((p) => (
        <span
          key={p.userId}
          className="flex min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-[3px] bg-muted/20"
        >
          <PresetAvatar id={p.avatarUrl} size={avatarSize} className="max-h-full max-w-full object-cover" />
        </span>
      ))}
    </span>
  );
}
