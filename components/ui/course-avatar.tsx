import { cn } from "@/lib/utils";

/**
 * Course group-chat tile: same brand gradient as the Courses list
 * (`from-[#8BB8FF] to-[#6366F1]`), rounded tile (not a circle) so it reads
 * clearly next to circular `<PresetAvatar />` DMs.
 */

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
  id: _courseId,
  code,
  name,
  size = 48,
  className,
}: {
  /** Stable id for callers; reserved for future per-course art / hashing. */
  id: string;
  code?: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  const label = deriveLabel(code, name);
  const fontSize = label.length >= 4 ? size * 0.32 : size * 0.42;

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-2xl font-semibold tracking-tight text-white select-none",
        "bg-gradient-to-br from-[#8BB8FF] to-[#6366F1]",
        "shadow-[0_6px_14px_rgba(99,102,241,0.18),inset_0_-2px_6px_rgba(0,0,0,0.08)]",
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
        className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]"
        style={{ fontFeatureSettings: '"ss01","cv11"' }}
      >
        {label}
      </span>
    </span>
  );
}
