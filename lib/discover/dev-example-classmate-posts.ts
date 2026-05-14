import {
  ClassmatePostCategory,
  LanguageProficiency,
  LanguageTag,
  MealVenueTag,
  SportTag,
  StudentVerificationStatus,
  StudyPurpose,
  StudyTimeSlot,
  StudyVenue,
  UserGender,
} from "@prisma/client";

import { DEFAULT_DISCOVER_SERVED_CITY } from "@/lib/discover/discover-city-name-keys";
import type { DiscoverPostRow } from "@/lib/discover/discover-post-row";

/**
 * Stable UUID v4-shaped ids — never written to the DB; only for list keys and dev display.
 * Cards are non-navigating when `isDevExample` is set (see `DiscoverPostCard`).
 */
const DEV_IDS = {
  shared: "10000000-0000-4000-8000-000000000001",
  study: "10000000-0000-4000-8000-000000000002",
  meals: "10000000-0000-4000-8000-000000000003",
  language: "10000000-0000-4000-8000-000000000004",
  sports: "10000000-0000-4000-8000-000000000005",
} as const;

const DEV_USER = {
  a: "20000000-0000-4000-8000-0000000000a1",
  b: "20000000-0000-4000-8000-0000000000a2",
  c: "20000000-0000-4000-8000-0000000000a3",
  d: "20000000-0000-4000-8000-0000000000a4",
  e: "20000000-0000-4000-8000-0000000000a5",
} as const;

function futureExpiry(monthsAhead: number): Date {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + monthsAhead);
  return d;
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

/** Five fully-populated rows for local UI testing (images + category meta). */
export function getDevExampleDiscoverPosts(): DiscoverPostRow[] {
  const city = DEFAULT_DISCOVER_SERVED_CITY;
  return [
    {
      id: DEV_IDS.shared,
      category: ClassmatePostCategory.SHARED_COURSES,
      city,
      title: "一起上机器学习导论（示例）",
      body: "想找同课同学课后对一下作业思路，周末也可约在主图自习。此为开发环境示例卡片。",
      createdAt: daysAgo(2),
      expiresAt: futureExpiry(8),
      isOwn: false,
      userId: DEV_USER.a,
      nickname: "示例·小林",
      gender: UserGender.FEMALE,
      avatarUrl: null,
      major: "Informatics",
      semester: 3,
      school: "TUM",
      languages: [
        { tag: LanguageTag.CHINESE, proficiency: LanguageProficiency.NATIVE },
        { tag: LanguageTag.ENGLISH, proficiency: LanguageProficiency.FLUENT },
      ],
      verifiedStudent: true,
      studentVerificationStatus: StudentVerificationStatus.VERIFIED,
      linkedCourses: [
        { id: "dev-course-ml", code: "IN2345", name: "Introduction to Machine Learning" },
        { id: "dev-course-linalg", code: "MA0001", name: "Linear Algebra" },
      ],
      imageUrls: [
        "https://picsum.photos/seed/classlink-dev-shared-a/720/540",
        "https://picsum.photos/seed/classlink-dev-shared-b/720/540",
      ],
      isDevExample: true,
    },
    {
      id: DEV_IDS.study,
      category: ClassmatePostCategory.STUDY,
      city,
      title: "期末周组队刷题（示例）",
      body: "希望找 1–2 人一起过课件与往年题，下午或晚上都可。示例数据，无真实发帖人。",
      createdAt: daysAgo(5),
      expiresAt: futureExpiry(3),
      isOwn: false,
      userId: DEV_USER.b,
      nickname: "示例·阿哲",
      gender: UserGender.MALE,
      avatarUrl: null,
      major: "Electrical Engineering",
      semester: 5,
      school: "TUM",
      languages: [{ tag: LanguageTag.GERMAN, proficiency: LanguageProficiency.CONVERSATIONAL }],
      verifiedStudent: true,
      studentVerificationStatus: StudentVerificationStatus.VERIFIED,
      studyMeta: {
        purposes: [StudyPurpose.EXAM_PREP, StudyPurpose.SPRINT],
        timeSlots: [StudyTimeSlot.AFTERNOON, StudyTimeSlot.EVENING],
        venues: [StudyVenue.MAIN_LIBRARY, StudyVenue.GARCHING_MI_LIBRARY],
        venueOtherNote: null,
      },
      imageUrls: [
        "https://picsum.photos/seed/classlink-dev-study-1/640/480",
        "https://picsum.photos/seed/classlink-dev-study-2/640/480",
        "https://picsum.photos/seed/classlink-dev-study-3/640/480",
      ],
      isDevExample: true,
    },
    {
      id: DEV_IDS.meals,
      category: ClassmatePostCategory.MEALS,
      city,
      title: "Garching 食堂约饭（示例）",
      body: "中午或傍晚都行，想认识新朋友。图片与文案仅供界面调试。",
      createdAt: daysAgo(1),
      expiresAt: futureExpiry(12),
      isOwn: false,
      userId: DEV_USER.c,
      nickname: "示例·Mia",
      gender: UserGender.PRIVATE,
      avatarUrl: null,
      major: "Management",
      semester: 2,
      school: "TUM",
      languages: [
        { tag: LanguageTag.ENGLISH, proficiency: LanguageProficiency.FLUENT },
        { tag: LanguageTag.CHINESE, proficiency: LanguageProficiency.CONVERSATIONAL },
      ],
      verifiedStudent: false,
      studentVerificationStatus: StudentVerificationStatus.UNVERIFIED,
      mealsMeta: {
        venueTags: [MealVenueTag.GARCHING_MENSA, MealVenueTag.GARCHING_CAFE, MealVenueTag.OUTSIDE],
        venueOtherNote: "偶尔也会在主校区附近简餐。",
      },
      imageUrls: ["https://picsum.photos/seed/classlink-dev-meals-1/680/520"],
      isDevExample: true,
    },
    {
      id: DEV_IDS.language,
      category: ClassmatePostCategory.LANGUAGE,
      city,
      title: "中英德语交换练习（示例）",
      body: "想练口语与听力，可线上或线下咖啡。此为占位内容。",
      createdAt: daysAgo(7),
      expiresAt: futureExpiry(6),
      isOwn: false,
      userId: DEV_USER.d,
      nickname: "示例·Leo",
      gender: UserGender.MALE,
      avatarUrl: null,
      major: "Computer Science",
      semester: 1,
      school: "TUM",
      languages: [{ tag: LanguageTag.ENGLISH, proficiency: LanguageProficiency.NATIVE }],
      verifiedStudent: true,
      studentVerificationStatus: StudentVerificationStatus.VERIFIED,
      languageMeta: {
        offers: [
          { tag: LanguageTag.ENGLISH, proficiency: LanguageProficiency.NATIVE },
          { tag: LanguageTag.GERMAN, proficiency: LanguageProficiency.CONVERSATIONAL },
        ],
        targets: [LanguageTag.CHINESE, LanguageTag.FRENCH],
      },
      imageUrls: [
        "https://picsum.photos/seed/classlink-dev-lang-1/700/500",
        "https://picsum.photos/seed/classlink-dev-lang-2/700/500",
      ],
      isDevExample: true,
    },
    {
      id: DEV_IDS.sports,
      category: ClassmatePostCategory.SPORTS,
      city,
      title: "羽毛球双打缺人（示例）",
      body: "水平不限，主要是出汗放松。场地时间可商量。开发示例，请勿联系。",
      createdAt: daysAgo(3),
      expiresAt: futureExpiry(4),
      isOwn: false,
      userId: DEV_USER.e,
      nickname: "示例·小周",
      gender: UserGender.FEMALE,
      avatarUrl: null,
      major: "Mathematics",
      semester: 4,
      school: "TUM",
      languages: [{ tag: LanguageTag.CHINESE, proficiency: LanguageProficiency.NATIVE }],
      verifiedStudent: true,
      studentVerificationStatus: StudentVerificationStatus.VERIFIED,
      sportMeta: {
        sportTags: [SportTag.BADMINTON, SportTag.TABLE_TENNIS],
        sportOtherNote: "也欢迎乒乓球友谊赛。",
      },
      imageUrls: [
        "https://picsum.photos/seed/classlink-dev-sport-1/660/500",
        "https://picsum.photos/seed/classlink-dev-sport-2/660/500",
      ],
      isDevExample: true,
    },
  ];
}
