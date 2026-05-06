import { StudentVerificationStatus } from "@prisma/client";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { profileSchema } from "@/lib/validators/profile";

export async function PUT(request: Request) {
  try {
    const user = await requireUser();
    const values = await parseJson(request, profileSchema);
    const schoolChanged = Boolean(user.school && user.school !== values.school);

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
          nickname: values.nickname,
          gender: values.gender,
          school: values.school,
          degreeLevel: values.degreeLevel,
          major: values.major,
          semester: values.semester,
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
          onboardingComplete: true,
          ...(schoolChanged
            ? {
                verifiedStudent: false,
                studentVerificationStatus: StudentVerificationStatus.UNVERIFIED,
                email: null,
                emailVerifiedAt: null,
                studentVerificationNotes:
                  "School community changed. Please verify a matching school email again.",
              }
            : {}),
        },
      });

      if (schoolChanged) {
        await tx.schoolEmailVerification.updateMany({
          where: {
            userId: user.id,
            status: "PENDING",
          },
          data: {
            status: "CANCELED",
          },
        });
      }
    });

    return ok({ saved: true });
  } catch (cause) {
    console.error(cause);
    return error("Unable to update profile.");
  }
}
