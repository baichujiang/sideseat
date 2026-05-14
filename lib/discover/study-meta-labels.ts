import type {
  LanguageProficiency,
  LanguageTag,
  MealVenueTag,
  StudyPurpose,
  StudyTimeSlot,
  StudyVenue,
} from "@prisma/client";

import type { AppMessages } from "@/lib/i18n/messages";
import type { SportPayloadNormalized } from "@/lib/validators/classmate-posts";

type DiscoverListMessages = AppMessages["discoverList"];
type SportTag = SportPayloadNormalized["sportTags"][number];

export function studyPurposeLabel(p: StudyPurpose, dl: DiscoverListMessages): string {
  switch (p) {
    case "DAILY_SELF_STUDY":
      return dl.studyPurposeDailySelfStudy;
    case "EXAM_PREP":
      return dl.studyPurposeExamPrep;
    case "SPRINT":
      return dl.studyPurposeSprint;
    default: {
      const _exhaustive: never = p;
      return _exhaustive;
    }
  }
}

export function studyTimeSlotLabel(t: StudyTimeSlot, dl: DiscoverListMessages): string {
  switch (t) {
    case "MORNING":
      return dl.studyTimeMorning;
    case "AFTERNOON":
      return dl.studyTimeAfternoon;
    case "EVENING":
      return dl.studyTimeEvening;
    default: {
      const _exhaustive: never = t;
      return _exhaustive;
    }
  }
}

export function studyVenueLabel(v: StudyVenue, dl: DiscoverListMessages): string {
  switch (v) {
    case "MAIN_LIBRARY":
      return dl.studyVenueMainLibrary;
    case "GARCHING_MI_LIBRARY":
      return dl.studyVenueGarchingMi;
    case "OLYMPIA_PARK_LIBRARY":
      return dl.studyVenueOlympiaPark;
    case "OTHER":
      return dl.studyVenueOther;
    default: {
      const _exhaustive: never = v;
      return _exhaustive;
    }
  }
}

export function mealVenueLabel(v: MealVenueTag, dl: DiscoverListMessages): string {
  switch (v) {
    case "MAIN_CAMPUS_MENSA":
      return dl.mealVenueMainCampusMensa;
    case "GARCHING_MENSA":
      return dl.mealVenueGarchingMensa;
    case "GARCHING_CAFE":
      return dl.mealVenueGarchingCafe;
    case "LEOPOLDSTRASSE_MENSA":
      return dl.mealVenueLeopoldstrasseMensa;
    case "LOTHSTRASSE_MENSA":
      return dl.mealVenueLothstrasseMensa;
    case "MARTINSRIED_MENSA":
      return dl.mealVenueMartinsriedMensa;
    case "WEIHENSTEPHAN_MENSA":
      return dl.mealVenueWeihenstephanMensa;
    case "OUTSIDE":
      return dl.mealVenueOutside;
    case "OTHER":
      return dl.mealVenueOther;
    default: {
      const _exhaustive: never = v;
      return _exhaustive;
    }
  }
}

export function languageTagLabel(tag: LanguageTag, dl: DiscoverListMessages): string {
  switch (tag) {
    case "CHINESE":
      return dl.languageTagChinese;
    case "ENGLISH":
      return dl.languageTagEnglish;
    case "GERMAN":
      return dl.languageTagGerman;
    case "FRENCH":
      return dl.languageTagFrench;
    case "HINDI":
      return dl.languageTagHindi;
    case "SPANISH":
      return dl.languageTagSpanish;
    case "OTHER":
      return dl.languageTagOther;
    default: {
      const _exhaustive: never = tag;
      return _exhaustive;
    }
  }
}

export function languageProficiencyLabel(
  proficiency: LanguageProficiency,
  dl: DiscoverListMessages,
): string {
  switch (proficiency) {
    case "NATIVE":
      return dl.languageProficiencyNative;
    case "FLUENT":
      return dl.languageProficiencyFluent;
    case "CONVERSATIONAL":
      return dl.languageProficiencyConversational;
    case "BASIC":
      return dl.languageProficiencyBasic;
    case "LEARNING":
      return dl.languageProficiencyLearning;
    default: {
      const _exhaustive: never = proficiency;
      return _exhaustive;
    }
  }
}

export function sportTagLabel(tag: SportTag, dl: DiscoverListMessages): string {
  switch (tag) {
    case "BASKETBALL":
      return dl.sportTagBasketball;
    case "BADMINTON":
      return dl.sportTagBadminton;
    case "TABLE_TENNIS":
      return dl.sportTagTableTennis;
    case "FOOTBALL":
      return dl.sportTagFootball;
    case "VOLLEYBALL":
      return dl.sportTagVolleyball;
    case "TENNIS":
      return dl.sportTagTennis;
    case "GYM":
      return dl.sportTagGym;
    case "RUNNING":
      return dl.sportTagRunning;
    case "HIKING":
      return dl.sportTagHiking;
    case "CYCLING":
      return dl.sportTagCycling;
    case "SWIMMING":
      return dl.sportTagSwimming;
    case "SKIING":
      return dl.sportTagSkiing;
    case "CLIMBING":
      return dl.sportTagClimbing;
    case "YOGA":
      return dl.sportTagYoga;
    case "OTHER":
      return dl.sportTagOther;
    default: {
      const _exhaustive: never = tag;
      return _exhaustive;
    }
  }
}
