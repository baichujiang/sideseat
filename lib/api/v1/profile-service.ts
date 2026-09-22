import "server-only";

import { ConnectionStatus, Prisma, type User } from "@prisma/client";
import { z } from "zod";

import { deriveNativeMVPReadiness } from "@/lib/api/v1/mvp-readiness";
import { currentUserV1 } from "@/lib/api/v1/user-dto";
import { validateNicknameForUser } from "@/lib/auth/nickname-fields";
import { DEFAULT_SCHOOL, normalizeSchoolCode, schoolOptions } from "@/lib/constants/schools";
import { DEGREE_LEVEL_LABELS } from "@/lib/constants/majors";
import { contactRemarkForViewer } from "@/lib/connections/contact-remark";
import { activeCourseMembershipWhere } from "@/lib/courses/active-membership";
import { loadSharedActiveCourses } from "@/lib/courses/shared-active-courses";
import { prisma } from "@/lib/db/prisma";
import { archivePreviousSchoolSocialState, schoolIdentityChanged } from "@/lib/profile/school-change";
import { usernameChangePolicyDto } from "@/lib/profile/username-change-policy";
import { mirrorSchoolVerificationToUser } from "@/lib/verification/school-state";
import { profileObjectSchema } from "@/lib/validators/profile";

export const nativeProfileUpdateSchema = profileObjectSchema
  .omit({ languages: true })
  .partial()
  .strict()
  .superRefine((values, ctx) => {
    if (values.studentStatus === "ALUMNI" && values.graduationYear === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["graduationYear"],
        message: "Graduation year is required for alumni.",
      });
    }
  })
  .refine((values) => Object.values(values).some((value) => value !== undefined), {
    message: "Nothing to update.",
  });

export type NativeProfileUpdateInput = z.infer<typeof nativeProfileUpdateSchema>;

type NativeProfileLanguageRow = {
  tag: string;
  proficiency: string;
};

type NativeCurrentProfileRecord = User & {
  lifePhotos: Array<{ id: string; url: string; sortOrder: number }>;
  userLanguages?: NativeProfileLanguageRow[];
};

export class NativeProfileUpdateError extends Error {
  constructor(
    public readonly code:
      | "NICKNAME_TAKEN"
      | "NICKNAME_RESERVED"
      | "NICKNAME_INVALID"
      | "PROFILE_NOT_FOUND",
  ) {
    super(code);
  }
}

function schoolSummary(input: {
  school: string | null;
  studentStatus: string | null;
  degreeLevel: string | null;
  major: string | null;
  semester: number | null;
  graduationYear: number | null;
}) {
  const schoolCode = normalizeSchoolCode(input.school) ?? DEFAULT_SCHOOL;
  const schoolShort = schoolOptions.find((school) => school.value === schoolCode)?.shortLabel ?? schoolCode;
  const degreeLevel =
    input.degreeLevel != null && input.degreeLevel in DEGREE_LEVEL_LABELS
      ? (input.degreeLevel as keyof typeof DEGREE_LEVEL_LABELS)
      : "BACHELOR";
  return {
    schoolShort,
    degreeLabel: DEGREE_LEVEL_LABELS[degreeLevel],
    major: input.major?.trim() ?? "",
    semester: input.semester ?? 1,
    studentStatus: input.studentStatus,
    graduationYear: input.graduationYear,
  };
}

function courseDto(course: { id: string; name: string; code: string | null }) {
  return {
    id: course.id,
    code: course.code,
    name: course.name,
  };
}

function profileUserDto(user: {
  id: string;
  username: string;
  nickname: string | null;
  gender: string;
  avatarUrl: string | null;
  bio: string | null;
  school: string | null;
  studentStatus: string | null;
  degreeLevel: string | null;
  major: string | null;
  semester: number | null;
  graduationYear: number | null;
  verifiedStudent: boolean;
  studentVerificationStatus: string;
  lifePhotos: Array<{ id: string; url: string; sortOrder: number }>;
}) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.nickname?.trim() || user.username,
    nickname: user.nickname,
    gender: user.gender,
    avatarUrl: user.avatarUrl,
    tagline: user.bio,
    school: user.school,
    studentStatus: user.studentStatus,
    degreeLevel: user.degreeLevel,
    major: user.major,
    semester: user.semester,
    graduationYear: user.graduationYear,
    verifiedStudent: user.verifiedStudent,
    studentVerificationStatus: user.studentVerificationStatus,
    schoolSummary: schoolSummary(user),
    lifePhotos: user.lifePhotos.map((row) => ({
      id: row.id,
      url: row.url,
      sortOrder: row.sortOrder,
    })),
  };
}

export function currentProfileDto(
  profile: NativeCurrentProfileRecord,
  options: { blockedCount: number; locale: "en" | "zh-CN" },
) {
  const languages = profile.userLanguages?.map((row) => ({
    tag: row.tag,
    proficiency: row.proficiency,
  }));
  const readiness = profile.userLanguages
    ? deriveNativeMVPReadiness({
        school: profile.school,
        studentStatus: profile.studentStatus,
        verifiedStudent: profile.verifiedStudent,
        studentVerificationStatus: profile.studentVerificationStatus,
        languageCount: profile.userLanguages.length,
      })
    : undefined;

  return {
    ...currentUserV1(profile, options.locale),
    displayName: profile.nickname?.trim() || profile.username,
    schoolSummary: schoolSummary(profile),
    lifePhotos: profile.lifePhotos,
    ...(languages !== undefined && readiness !== undefined
      ? { languages, readiness }
      : {}),
    contacts: {
      wechatHandle: profile.wechatHandle,
      whatsappHandle: profile.whatsappHandle,
      telegramHandle: profile.telegramHandle,
      instagramHandle: profile.instagramHandle,
    },
    privacy: {
      discoverByCourse: profile.discoverByCourse,
      discoverByMajor: profile.discoverByMajor,
      discoverBySemester: profile.discoverBySemester,
      allowInvitationNotes: profile.allowInvitationNotes,
      contactInfoOptIn: profile.contactInfoOptIn,
      hideFromCourseMembers: profile.hideFromCourseMembers,
      hideFromDiscovery: profile.hideFromDiscovery,
    },
    usernameChangePolicy: usernameChangePolicyDto(profile),
    counts: { blocked: options.blockedCount },
  };
}

export async function loadNativeCurrentProfile(options: {
  user: User;
  locale: "en" | "zh-CN";
}) {
  const [profile, blockedCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: options.user.id },
      include: {
        lifePhotos: {
          orderBy: { sortOrder: "asc" },
          select: { id: true, url: true, sortOrder: true },
        },
        userLanguages: {
          orderBy: { tag: "asc" },
          select: { tag: true, proficiency: true },
        },
      },
    }),
    prisma.block.count({ where: { blockerId: options.user.id } }),
  ]);
  if (!profile) return null;

  return currentProfileDto(profile, {
    blockedCount,
    locale: options.locale,
  });
}

export async function updateNativeCurrentProfile(options: {
  user: User;
  locale: "en" | "zh-CN";
  values: NativeProfileUpdateInput;
  tx?: Prisma.TransactionClient;
}) {
  const db = options.tx ?? prisma;
  const values = options.values;
  const changedSchool = values.school !== undefined
    && schoolIdentityChanged(options.user.school, values.school);
  let schoolChange: Awaited<ReturnType<typeof archivePreviousSchoolSocialState>> | null = null;

  const data: Prisma.UserUpdateInput = {};
  if (values.nickname !== undefined) {
    const nicknameCheck = await validateNicknameForUser(values.nickname, {
      excludeUserId: options.user.id,
    });
    if (!nicknameCheck.ok) {
      throw new NativeProfileUpdateError(
        nicknameCheck.reason === "taken"
          ? "NICKNAME_TAKEN"
          : nicknameCheck.reason === "reserved"
            ? "NICKNAME_RESERVED"
            : "NICKNAME_INVALID",
      );
    }
    data.nickname = nicknameCheck.nickname;
    data.nicknameKey = nicknameCheck.nicknameKey;
  }
  if (values.gender !== undefined) data.gender = values.gender;
  if (values.school !== undefined) {
    data.school = values.school;
    if (changedSchool) {
      data.courseReviewSemesterLabel = null;
    }
  }
  if (values.studentStatus !== undefined) data.studentStatus = values.studentStatus;
  if (values.degreeLevel !== undefined) data.degreeLevel = values.degreeLevel;
  if (values.major !== undefined) data.major = values.major.trim() ? values.major.trim() : null;
  if (values.semester !== undefined) data.semester = values.semester;
  if (values.graduationYear !== undefined) data.graduationYear = values.graduationYear;
  const nextStudentStatus = values.studentStatus ?? options.user.studentStatus;
  if (nextStudentStatus === "ALUMNI") {
    data.semester = null;
  } else if (nextStudentStatus) {
    data.graduationYear = null;
  }
  if (values.bio !== undefined) data.bio = values.bio.trim() ? values.bio.trim() : null;
  if (values.wechatHandle !== undefined) data.wechatHandle = values.wechatHandle.trim() || null;
  if (values.whatsappHandle !== undefined) data.whatsappHandle = values.whatsappHandle.trim() || null;
  if (values.telegramHandle !== undefined) data.telegramHandle = values.telegramHandle.trim() || null;
  if (values.instagramHandle !== undefined) data.instagramHandle = values.instagramHandle.trim() || null;
  if (values.discoverByCourse !== undefined) data.discoverByCourse = values.discoverByCourse;
  if (values.discoverByMajor !== undefined) data.discoverByMajor = values.discoverByMajor;
  if (values.discoverBySemester !== undefined) data.discoverBySemester = values.discoverBySemester;
  if (values.allowInvitationNotes !== undefined) data.allowInvitationNotes = values.allowInvitationNotes;
  if (values.contactInfoOptIn !== undefined) data.contactInfoOptIn = values.contactInfoOptIn;
  if (values.hideFromCourseMembers !== undefined) data.hideFromCourseMembers = values.hideFromCourseMembers;
  if (values.hideFromDiscovery !== undefined) data.hideFromDiscovery = values.hideFromDiscovery;
  if (values.hideFromRecommendations !== undefined) {
    data.hideFromRecommendations = values.hideFromRecommendations;
  }

  await db.user.update({
    where: { id: options.user.id },
    data,
  });

  if (changedSchool && values.school !== undefined) {
    if (options.tx) {
      schoolChange = await archivePreviousSchoolSocialState(options.tx, {
        userId: options.user.id,
        previousSchool: options.user.school,
        nextSchool: values.school,
      });
    }
    await mirrorSchoolVerificationToUser(db, options.user.id, values.school);
  }

  const [profile, blockedCount] = await Promise.all([
    db.user.findUnique({
      where: { id: options.user.id },
      include: {
        lifePhotos: {
          orderBy: { sortOrder: "asc" },
          select: { id: true, url: true, sortOrder: true },
        },
        userLanguages: {
          orderBy: { tag: "asc" },
          select: { tag: true, proficiency: true },
        },
      },
    }),
    db.block.count({ where: { blockerId: options.user.id } }),
  ]);
  if (!profile) throw new NativeProfileUpdateError("PROFILE_NOT_FOUND");
  return {
    ...currentProfileDto(profile, {
      blockedCount,
      locale: options.locale,
    }),
    ...(schoolChange ? { schoolChange } : {}),
  };
}

export async function loadNativePublicProfile(options: {
  viewer: Pick<User, "id" | "school">;
  peerUserId: string;
}) {
  if (options.peerUserId === options.viewer.id) return null;

  const viewerSchool = normalizeSchoolCode(options.viewer.school) ?? DEFAULT_SCHOOL;
  const peerBase = await prisma.user.findUnique({
    where: { id: options.peerUserId },
    select: {
      id: true,
      username: true,
      nickname: true,
      gender: true,
      avatarUrl: true,
      bio: true,
      school: true,
      studentStatus: true,
      degreeLevel: true,
      major: true,
      semester: true,
      graduationYear: true,
      verifiedStudent: true,
      studentVerificationStatus: true,
      onboardingComplete: true,
      lifePhotos: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, url: true, sortOrder: true },
      },
    },
  });
  if (!peerBase?.onboardingComplete) return null;

  const peerSchool = normalizeSchoolCode(peerBase.school) ?? DEFAULT_SCHOOL;
  if (peerSchool !== viewerSchool) return null;

  const hidden = await prisma.moderationBlock.findFirst({
    where: { userId: { in: [options.viewer.id, options.peerUserId] }, isActive: true },
    select: { id: true },
  });
  if (hidden) return null;

  const mutualBlock = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: options.viewer.id, blockedId: options.peerUserId },
        { blockerId: options.peerUserId, blockedId: options.viewer.id },
      ],
    },
    select: { id: true },
  });
  if (mutualBlock) return null;

  const [connection, sharedCourses, peerCourses] = await Promise.all([
    prisma.connection.findFirst({
      where: {
        status: ConnectionStatus.ACTIVE,
        OR: [
          { userAId: options.viewer.id, userBId: options.peerUserId },
          { userAId: options.peerUserId, userBId: options.viewer.id },
        ],
      },
      include: {
        invitation: { include: { course: true } },
        userA: {
          include: {
            lifePhotos: {
              orderBy: { sortOrder: "asc" },
              select: { id: true, url: true, sortOrder: true },
            },
          },
        },
        userB: {
          include: {
            lifePhotos: {
              orderBy: { sortOrder: "asc" },
              select: { id: true, url: true, sortOrder: true },
            },
          },
        },
      },
    }),
    loadSharedActiveCourses(prisma, options.viewer.id, options.peerUserId),
    prisma.userCourse.findMany({
      where: {
        userId: options.peerUserId,
        ...activeCourseMembershipWhere(),
      },
      select: {
        course: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const isConnection = Boolean(connection);
  const peer = connection
    ? connection.userAId === options.peerUserId
      ? connection.userA
      : connection.userB
    : peerBase;
  const mode = isConnection ? "connection" : sharedCourses.length > 0 ? "classmate" : "public";

  return {
    mode,
    connectionId: connection?.id ?? null,
    metVia: connection?.invitation?.course?.name ?? sharedCourses[0]?.name ?? null,
    viewerCanMessage: true,
    myContactRemark: connection ? contactRemarkForViewer(connection, options.viewer.id) : null,
    profile: profileUserDto(peer),
    sharedCourses: sharedCourses.map(courseDto),
    peerCourses: peerCourses.map((row) => courseDto(row.course)),
  };
}
