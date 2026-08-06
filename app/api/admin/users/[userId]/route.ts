import { Prisma, StudentVerificationStatus } from "@prisma/client";

import { requireAdminUser } from "@/lib/auth/guards";
import { validateNicknameForUser } from "@/lib/auth/nickname-fields";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { mirrorSchoolVerificationToUser, upsertSchoolVerificationState } from "@/lib/verification/school-state";
import { adminUserUpdateSchema } from "@/lib/validators/admin-user";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const admin = await requireAdminUser();
    const { userId } = await params;
    const values = await parseJson(request, adminUserUpdateSchema);

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, school: true },
    });

    if (!target) {
      return error("User not found.", 404);
    }

    if (values.email && values.email !== target.email) {
      const existing = await prisma.user.findUnique({
        where: { email: values.email },
        select: { id: true },
      });
      if (existing && existing.id !== userId) {
        return error("That email is already linked to another account.", 409);
      }
    }

    // Build `data` only from the provided keys — omitted fields are left alone.
    // Empty-string sentinels for optional text/email fields are converted to
    // null so the admin can actually clear a value on the record.
    const data: Prisma.UserUpdateInput = {};

    if (values.nickname !== undefined) {
      const nicknameCheck = await validateNicknameForUser(values.nickname, { excludeUserId: userId });
      if (!nicknameCheck.ok) {
        const message =
          nicknameCheck.reason === "reserved" ? "That nickname is reserved." : "Invalid nickname.";
        return error(message, 422);
      }
      data.nickname = nicknameCheck.nickname;
      data.nicknameKey = nicknameCheck.nicknameKey;
    }
    if (values.gender !== undefined) data.gender = values.gender;
    if (values.email !== undefined) data.email = values.email === "" ? null : values.email;
    if (values.school !== undefined) data.school = values.school;
    if (values.degreeLevel !== undefined) data.degreeLevel = values.degreeLevel;
    if (values.major !== undefined) data.major = values.major === "" ? null : values.major;
    if (values.semester !== undefined) data.semester = values.semester;
    if (values.bio !== undefined) data.bio = values.bio === "" ? null : values.bio;
    if (values.wechatHandle !== undefined)
      data.wechatHandle = values.wechatHandle === "" ? null : values.wechatHandle;
    if (values.whatsappHandle !== undefined)
      data.whatsappHandle = values.whatsappHandle === "" ? null : values.whatsappHandle;
    if (values.telegramHandle !== undefined)
      data.telegramHandle = values.telegramHandle === "" ? null : values.telegramHandle;
    if (values.instagramHandle !== undefined)
      data.instagramHandle = values.instagramHandle === "" ? null : values.instagramHandle;
    if (values.onboardingComplete !== undefined)
      data.onboardingComplete = values.onboardingComplete;

    // Keep verification fields in sync. If the admin explicitly sets the
    // status, use it; otherwise infer from `verifiedStudent`.
    if (values.studentVerificationStatus !== undefined) {
      data.studentVerificationStatus = values.studentVerificationStatus;
      const verified =
        values.studentVerificationStatus === StudentVerificationStatus.VERIFIED;
      const verifiedAt = verified ? new Date() : null;
      data.verifiedStudent =
        values.verifiedStudent !== undefined ? values.verifiedStudent : verified;
      data.studentVerificationMethod = verified ? "MANUAL_DOCUMENT" : null;
      data.studentVerifiedAt = verifiedAt;
      data.emailVerifiedAt = null;
    } else if (values.verifiedStudent !== undefined) {
      data.verifiedStudent = values.verifiedStudent;
      data.studentVerificationStatus = values.verifiedStudent
        ? StudentVerificationStatus.VERIFIED
        : StudentVerificationStatus.UNVERIFIED;
      const verifiedAt = values.verifiedStudent ? new Date() : null;
      data.studentVerificationMethod = values.verifiedStudent ? "MANUAL_DOCUMENT" : null;
      data.studentVerifiedAt = verifiedAt;
      data.emailVerifiedAt = null;
    }

    if (values.studentVerificationNotes !== undefined) {
      data.studentVerificationNotes =
        values.studentVerificationNotes === ""
          ? `Edited by ${admin.adminActor}.`
          : values.studentVerificationNotes;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.user.update({
        where: { id: userId },
        data,
      });

      const targetSchool = values.school ?? target.school;
      const verificationTouched =
        values.email !== undefined ||
        values.studentVerificationStatus !== undefined ||
        values.verifiedStudent !== undefined ||
        values.studentVerificationNotes !== undefined;
      const schoolChanged = values.school !== undefined && values.school !== target.school;

      if (targetSchool && verificationTouched) {
        await upsertSchoolVerificationState(tx, userId, targetSchool, {
          email: result.email ?? null,
          verifiedStudent: result.verifiedStudent,
          studentVerificationStatus: result.studentVerificationStatus,
          studentVerificationMethod: result.studentVerificationMethod,
          studentVerifiedAt: result.studentVerifiedAt,
          emailVerifiedAt: result.emailVerifiedAt,
          studentVerificationNotes: result.studentVerificationNotes,
          manualReviewProofUrl: result.manualReviewProofUrl,
          manualReviewProofFilename: result.manualReviewProofFilename,
          manualReviewRequestedAt: result.manualReviewRequestedAt,
        });
        await mirrorSchoolVerificationToUser(tx, userId, targetSchool);
      } else if (targetSchool && schoolChanged) {
        await mirrorSchoolVerificationToUser(tx, userId, targetSchool);
      }

      return result;
    });

    return ok({ userId: updated.id });
  } catch (cause) {
    console.error(cause);
    return error("Unable to update user.", 400);
  }
}
