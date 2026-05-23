import { ClassmatePostCategory } from "@prisma/client";

import type { AppMessages } from "@/lib/i18n/messages";

export function buddyTypeLabel(category: ClassmatePostCategory, b: AppMessages["discoverBuddy"]): string {
  switch (category) {
    case ClassmatePostCategory.SHARED_COURSES:
      return b.buddyTypeCourse;
    case ClassmatePostCategory.STUDY:
      return b.buddyTypeStudy;
    case ClassmatePostCategory.MEALS:
      return b.buddyTypeMeal;
    case ClassmatePostCategory.LANGUAGE:
      return b.buddyTypeLanguage;
    case ClassmatePostCategory.SPORTS:
      return b.buddyTypeSports;
    case ClassmatePostCategory.OTHER:
      return "";
    default:
      return "";
  }
}

/** Legacy typed posts show a chip; new posts default to OTHER and hide the label. */
export function shouldShowBuddyCategoryLabel(category: ClassmatePostCategory): boolean {
  return category !== ClassmatePostCategory.OTHER;
}

export const ALL_BUDDY_CATEGORIES: ClassmatePostCategory[] = [
  ClassmatePostCategory.STUDY,
  ClassmatePostCategory.MEALS,
  ClassmatePostCategory.SHARED_COURSES,
  ClassmatePostCategory.LANGUAGE,
  ClassmatePostCategory.SPORTS,
];
