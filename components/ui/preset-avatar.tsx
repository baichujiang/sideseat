import { cn } from "@/lib/utils";
import { getAvatarPreset, type AvatarMotif } from "@/lib/constants/avatars";

function Motif({ motif }: { motif: AvatarMotif }) {
  switch (motif) {
    case "circle":
      return <circle cx="24" cy="24" r="9" />;
    case "triangle":
      return <polygon points="24,13 35,34 13,34" />;
    case "square":
      return <rect x="14" y="14" width="20" height="20" rx="3" />;
    case "diamond":
      return <polygon points="24,11 37,24 24,37 11,24" />;
    case "bars":
      return (
        <g>
          <rect x="13" y="15" width="4" height="18" rx="1.5" />
          <rect x="22" y="11" width="4" height="26" rx="1.5" />
          <rect x="31" y="18" width="4" height="12" rx="1.5" />
        </g>
      );
  }
}

export function PresetAvatar({
  id,
  className,
  size,
}: {
  id?: string | null;
  className?: string;
  size?: number;
}) {
  const preset = getAvatarPreset(id);
  const gradientId = `avatar-${preset.id}`;
  return (
    <svg
      aria-hidden="true"
      className={cn("block", className)}
      height={size}
      viewBox="0 0 48 48"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={preset.gradient[0]} />
          <stop offset="1" stopColor={preset.gradient[1]} />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="24" fill={`url(#${gradientId})`} />
      <g fill="white" fillOpacity="0.65">
        <Motif motif={preset.motif} />
      </g>
    </svg>
  );
}
