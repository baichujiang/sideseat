import { validateNicknameForUser } from "@/lib/auth/nickname-fields";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import {
  NICKNAME_ERROR_CODES,
  nicknameValidationErrorMessage,
} from "@/lib/profile/nickname-api-errors";
import { mirrorSchoolVerificationToUser } from "@/lib/verification/school-state";
import { profileSchema } from "@/lib/validators/profile";
import { archivePreviousSchoolSocialState, schoolIdentityChanged } from "@/lib/profile/school-change";

export async function PUT(request: Request) {
  try {
    const user = await requireUser();
    const values = await parseJson(request, profileSchema);

    const nicknameCheck = await validateNicknameForUser(values.nickname, { excludeUserId: user.id });
    if (!nicknameCheck.ok) {
      const code =
        nicknameCheck.reason === "taken"
          ? NICKNAME_ERROR_CODES.TAKEN
          : NICKNAME_ERROR_CODES.RESERVED;
      return error(
        nicknameValidationErrorMessage(nicknameCheck.reason, {
          taken: "That name is already taken.",
          reserved: "That name is reserved.",
        }, "Invalid name."),
        nicknameCheck.reason === "taken" ? 409 : 422,
        code,
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.userLanguage.deleteMany({ where: { userId: user.id } });
      await tx.userLanguage.createMany({
        data: values.languages.map((l) => ({
          userId: user.id,
          tag: l.tag,
          proficiency: l.proficiency,
        })),
      });
      await tx.user.update({
        where: { id: user.id },
        data: {
          nickname: nicknameCheck.nickname,
          nicknameKey: nicknameCheck.nicknameKey,
          gender: values.gender,
          school: values.school,
          studentStatus: values.studentStatus,
          degreeLevel: values.degreeLevel,
          major: values.major === "" ? null : values.major,
          semester: values.studentStatus === "ALUMNI" ? null : values.semester,
          graduationYear: values.studentStatus === "ALUMNI" ? values.graduationYear : null,
          bio: values.bio || null,
          wechatHandle: values.wechatHandle || null,
          whatsappHandle: values.whatsappHandle || null,
          telegramHandle: values.telegramHandle || null,
          instagramHandle: values.instagramHandle || null,
          discoverByCourse: values.discoverByCourse,
          discoverByMajor: values.discoverByMajor,
          discoverBySemester: values.discoverBySemester,
          allowInvitationNotes: values.allowInvitationNotes,
          contactInfoOptIn: values.contactInfoOptIn,
          hideFromCourseMembers: values.hideFromCourseMembers,
          hideFromDiscovery: values.hideFromDiscovery,
          hideFromRecommendations: values.hideFromRecommendations,
          onboardingComplete: true,
        },
      });
      if (schoolIdentityChanged(user.school, values.school)) {
        await archivePreviousSchoolSocialState(tx, {
          userId: user.id,
          previousSchool: user.school,
          nextSchool: values.school,
        });
      }
      await mirrorSchoolVerificationToUser(tx, user.id, values.school);
    });

    return ok({ saved: true });
  } catch (cause) {
    console.error(cause);
    return error("Unable to update profile.");
  }
}
