import type { StudyPurpose, StudyTimeSlot, StudyVenue } from "@prisma/client";

import type { AppMessages } from "@/lib/i18n/messages";

type DiscoverListMessages = AppMessages["discoverList"];

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
