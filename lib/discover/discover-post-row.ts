import {
  ClassmatePostCategory,
  type LanguageProficiency,
  type LanguageTag,
  type StudyPurpose,
  type StudyTimeSlot,
  type StudyVenue,
  type UserGender,
} from "@prisma/client";

export type DiscoverPostRowCourse = {
  id: string;
  code: string | null;
  name: string;
};

export type DiscoverPostRowStudyMeta = {
  purposes: StudyPurpose[];
  timeSlots: StudyTimeSlot[];
  venues: StudyVenue[];
  venueOtherNote: string | null;
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
  studyMeta?: DiscoverPostRowStudyMeta;
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

/** Map optional `ClassmatePost.study` relation into a card row field (omit when empty). */
export function mapPrismaStudyToDiscoverRow(
  study: {
    purposes: StudyPurpose[];
    timeSlots: StudyTimeSlot[];
    venues: StudyVenue[];
    venueOtherNote: string | null;
  } | null,
): DiscoverPostRowStudyMeta | undefined {
  if (!study) return undefined;
  const has =
    study.purposes.length > 0 ||
    study.timeSlots.length > 0 ||
    study.venues.length > 0 ||
    Boolean(study.venueOtherNote?.trim());
  if (!has) return undefined;
  return {
    purposes: [...study.purposes],
    timeSlots: [...study.timeSlots],
    venues: [...study.venues],
    venueOtherNote: study.venueOtherNote,
  };
}
