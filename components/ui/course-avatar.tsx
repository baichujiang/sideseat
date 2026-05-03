import { cn } from "@/lib/utils";

/**
 * Default avatar for course group chats. We don't ship per-course artwork, so
 * we derive a stable gradient from the course id and stamp the course code (or
 * the first couple of letters of the name) on top. This gives every course a
 * recognizable, distinct "group" tile that matches the circular geometry of
 * `<PresetAvatar />` used for 1:1 chats.
 */

const GRADIENTS = [
  "bg-gradient-to-br from-indigo-500 to-violet-500",
  "bg-gradient-to-br from-sky-500 to-cyan-500",
  "bg-gradient-to-br from-emerald-500 to-teal-500",
  "bg-gradient-to-br from-amber-500 to-orange-500",
  "bg-gradient-to-br from-rose-500 to-pink-500",
  "bg-gradient-to-br from-fuchsia-500 to-purple-500",
  "bg-gradient-to-br from-lime-500 to-emerald-500",
  "bg-gradient-to-br from-blue-500 to-indigo-500",
] as const;

function hashToIndex(seed: string, mod: number) {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % mod;
}

function deriveLabel(code: string | null | undefined, name: string) {
  const c = (code ?? "").replace(/\s+/g, "").toUpperCase();
  if (c.length >= 2) return c.slice(0, 4);
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0]![0]! + words[1]![0]!).toUpperCase();
  }
  return name.replace(/\s+/g, "").slice(0, 2).toUpperCase() || "#";
}

export function CourseAvatar({
  id,
  code,
  name,
  size = 48,
  className,
}: {
  id: string;
  code?: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  const gradient = GRADIENTS[hashToIndex(id, GRADIENTS.length)]!;
  const label = deriveLabel(code, name);
  const fontSize = label.length >= 4 ? size * 0.32 : size * 0.42;

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full text-white font-semibold tracking-tight select-none",
        "shadow-[inset_0_-2px_6px_rgba(0,0,0,0.12),0_1px_2px_rgba(15,23,42,0.18)]",
        gradient,
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize,
        lineHeight: 1,
        letterSpacing: label.length >= 4 ? "-0.02em" : 0,
      }}
    >
      <span
        className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]"
        style={{ fontFeatureSettings: '"ss01","cv11"' }}
      >
        {label}
      </span>
    </span>
  );
}
