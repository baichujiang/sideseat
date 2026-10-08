import { z } from "zod";

export const profileAppearanceSchema = z.object({
  theme: z.enum(["classic", "rose", "ocean", "forest"]),
  icon: z.enum(["none", "sun", "moon", "leaf", "sparkles"]),
  style: z.enum(["classic", "outline", "spotlight"]),
  showMembershipBadge: z.boolean(),
}).strict();

export type ProfileAppearance = z.infer<typeof profileAppearanceSchema>;
export const defaultProfileAppearance: ProfileAppearance = {
  theme: "classic", icon: "none", style: "classic", showMembershipBadge: true,
};

export function requiresPlus(appearance: ProfileAppearance) {
  return ["ocean", "forest"].includes(appearance.theme)
    || ["moon", "leaf", "sparkles"].includes(appearance.icon)
    || appearance.style !== "classic";
}

export function savedProfileAppearance(value: unknown): ProfileAppearance {
  const parsed = profileAppearanceSchema.safeParse(value);
  return parsed.success ? parsed.data : { ...defaultProfileAppearance };
}

export function effectiveProfileAppearance(value: unknown, isPlus: boolean): ProfileAppearance {
  const saved = savedProfileAppearance(value);
  if (isPlus) return saved;
  return {
    theme: ["ocean", "forest"].includes(saved.theme) ? "classic" : saved.theme,
    icon: ["moon", "leaf", "sparkles"].includes(saved.icon) ? "none" : saved.icon,
    style: "classic",
    showMembershipBadge: saved.showMembershipBadge,
  };
}
