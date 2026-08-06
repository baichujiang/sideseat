import type { User, UserGender, StudentVerificationStatus } from "@prisma/client";

export type CurrentUserV1 = {
  id: string;
  username: string;
  nickname: string | null;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  tagline: string | null;
  school: string | null;
  studentStatus: string | null;
  degreeLevel: string | null;
  major: string | null;
  semester: number | null;
  graduationYear: number | null;
  gender: UserGender;
  onboardingComplete: boolean;
  isGuest: boolean;
  verifiedStudent: boolean;
  studentVerificationStatus: StudentVerificationStatus;
  usernameUpdatedAt: string | null;
  productTutorialDismissedAt: string | null;
  locale: "en" | "zh-CN";
};

export function currentUserV1(user: User, locale: "en" | "zh-CN" = "en"): CurrentUserV1 {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    email: user.email,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    tagline: user.bio,
    school: user.school,
    studentStatus: user.studentStatus,
    degreeLevel: user.degreeLevel,
    major: user.major,
    semester: user.semester,
    graduationYear: user.graduationYear,
    gender: user.gender,
    onboardingComplete: user.onboardingComplete,
    isGuest: user.isGuest,
    verifiedStudent: user.verifiedStudent,
    studentVerificationStatus: user.studentVerificationStatus,
    usernameUpdatedAt: user.usernameUpdatedAt?.toISOString() ?? null,
    productTutorialDismissedAt: user.productTutorialDismissedAt?.toISOString() ?? null,
    locale,
  };
}
