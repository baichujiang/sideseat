import { ClassmatePostCategory } from "@prisma/client";
import type { LanguageProficiency, LanguageTag, UserGender } from "@prisma/client";

export type DiscoverPostRowCourse = {
  id: string;
  code: string | null;
  name: string;
};

export type DiscoverPostRow = {
  id: string;
  category: ClassmatePostCategory;
  city: string;
  title: string;
  body: string | null;
  expiresAt: Date;
  isOwn: boolean;
  userId: string;
  nickname: string;
  gender: UserGender;
  avatarUrl: string | null;
  major: string | null;
  semester: number | null;
  school: string | null;
  languages: Array<{ tag: LanguageTag; proficiency: LanguageProficiency }>;
  verifiedStudent: boolean;
  studentVerificationStatus:
    | "UNVERIFIED"
    | "EMAIL_PENDING"
    | "VERIFIED"
    | "MANUAL_REVIEW_REQUIRED"
    | "REJECTED";
  linkedCourses?: DiscoverPostRowCourse[];
};

/** Discover tabs / create-post scene — matches `DiscoverList` scene state. */
export type DiscoverPostCardScene = "shared" | "study" | "meals" | "language" | "sports";

export function discoverSceneForPostCategory(category: ClassmatePostCategory): DiscoverPostCardScene {
  switch (category) {
    case ClassmatePostCategory.SHARED_COURSES:
      return "shared";
    case ClassmatePostCategory.STUDY:
      return "study";
    case ClassmatePostCategory.MEALS:
      return "meals";
    case ClassmatePostCategory.LANGUAGE:
      return "language";
    case ClassmatePostCategory.SPORTS:
      return "sports";
  }
}
