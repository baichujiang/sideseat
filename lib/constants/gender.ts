import type { UserGender } from "@prisma/client";

/** Form + profile display labels. */
export const USER_GENDER_LABEL: Record<UserGender, string> = {
  MALE: "Male",
  FEMALE: "Female",
  PRIVATE: "Prefer not to say",
};

export const USER_GENDER_OPTIONS: { value: UserGender; label: string }[] = [
  { value: "MALE", label: USER_GENDER_LABEL.MALE },
  { value: "FEMALE", label: USER_GENDER_LABEL.FEMALE },
  { value: "PRIVATE", label: USER_GENDER_LABEL.PRIVATE },
];
