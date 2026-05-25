import {
  ClassmatePostCategory,
  type MealVenueTag,
  type Prisma,
  type LanguageProficiency,
  type LanguageTag,
  type SportTag,
  type StudyPurpose,
  type StudyTimeSlot,
  type StudyVenue,
  type UserGender,
} from "@prisma/client";

import { displayableClassmatePostImageUrls } from "@/lib/discover/classmate-post-display-images";
import { classmatePostLanguageOffersSchema } from "@/lib/validators/classmate-posts";

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

export type DiscoverPostRowMealsMeta = {
  venueTags: MealVenueTag[];
  venueOtherNote: string | null;
};

export type DiscoverPostRowLanguageOffer = {
  tag: LanguageTag;
  proficiency: LanguageProficiency;
};

export type DiscoverPostRowLanguageMeta = {
  offers: DiscoverPostRowLanguageOffer[];
  targets: LanguageTag[];
};

export type DiscoverPostRowSportMeta = {
  sportTags: SportTag[];
  sportOtherNote: string | null;
};

export type DiscoverPostRow = {
  id: string;
  category: ClassmatePostCategory;
  city: string;
  title: string;
  body: string | null;
  createdAt: Date;
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
  mealsMeta?: DiscoverPostRowMealsMeta;
  languageMeta?: DiscoverPostRowLanguageMeta;
  sportMeta?: DiscoverPostRowSportMeta;
  /** Up to 3 image URLs in display order (Vercel Blob, inline data URLs, or `picsum.photos/seed/…`). */
  imageUrls?: string[];
  /** When set, Discover post cards show the save/bookmark control for the signed-in viewer. */
  savedByViewer?: boolean;
  /** Current visible interest signal: number of users who saved/hearted this post. */
  interestedCount?: number;
  /**
   * Client-only / UI-injected rows (e.g. `NEXT_PUBLIC_DISCOVER_DEV_EXAMPLE_POSTS=1`).
   * Disables post detail navigation, save, and peer messaging on the card.
   */
  isDevExample?: boolean;
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
    default:
      return "study";
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

export function mapPrismaMealsToDiscoverRow(
  meals: {
    venueTags: MealVenueTag[];
    venueOtherNote: string | null;
  } | null,
): DiscoverPostRowMealsMeta | undefined {
  if (!meals) return undefined;
  const has = meals.venueTags.length > 0 || Boolean(meals.venueOtherNote?.trim());
  if (!has) return undefined;
  return {
    venueTags: [...meals.venueTags],
    venueOtherNote: meals.venueOtherNote,
  };
}

export function mapPrismaLanguageToDiscoverRow(
  language: {
    offers: Prisma.JsonValue;
    targets: LanguageTag[];
  } | null,
): DiscoverPostRowLanguageMeta | undefined {
  if (!language) return undefined;
  const parsedOffers = classmatePostLanguageOffersSchema.safeParse(language.offers);
  const offers = parsedOffers.success ? parsedOffers.data : [];
  const targets = [...language.targets];
  if (offers.length === 0 && targets.length === 0) return undefined;
  return {
    offers: offers.map((offer) => ({
      tag: offer.tag,
      proficiency: offer.proficiency,
    })),
    targets,
  };
}

export function mapPrismaSportToDiscoverRow(
  sport: {
    sportTags: SportTag[];
    sportOtherNote: string | null;
  } | null,
): DiscoverPostRowSportMeta | undefined {
  if (!sport) return undefined;
  const has = sport.sportTags.length > 0 || Boolean(sport.sportOtherNote?.trim());
  if (!has) return undefined;
  return {
    sportTags: [...sport.sportTags],
    sportOtherNote: sport.sportOtherNote,
  };
}

export function mapPrismaClassmatePostImagesToUrls(
  images: { url: string; sortOrder: number }[] | null | undefined,
): string[] | undefined {
  if (!images?.length) return undefined;
  const sorted = [...images].sort((a, b) => a.sortOrder - b.sortOrder);
  const urls = displayableClassmatePostImageUrls(sorted.map((r) => r.url));
  return urls.length ? urls : undefined;
}
