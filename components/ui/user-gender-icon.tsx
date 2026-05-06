import type { UserGender } from "@prisma/client";
import { USER_GENDER_LABEL } from "@/lib/constants/gender";

export function userGenderLabel(gender: UserGender): string {
  return USER_GENDER_LABEL[gender];
}

/**
 * Icon-style marker (Unicode symbols + Lucide for “private”) so we do not
 * depend on lucide version-specific gender glyphs.
 */
export function UserGenderIcon({ gender, className }: { gender: UserGender; className?: string }) {
  void gender;
  void className;
  return null;
}

/** Profile / detail rows: icon + visible gender label. */
export function UserGenderProfileMark({
  gender,
  iconClassName,
}: {
  gender: UserGender;
  iconClassName?: string;
}) {
  void gender;
  void iconClassName;
  return null;
}

/** Discover / search / course rows — ♂/♀ stay icon-only; PRIVATE adds a short text label. */
export function UserGenderCardIcon({ gender, className }: { gender: UserGender; className?: string }) {
  void gender;
  void className;
  return null;
}
