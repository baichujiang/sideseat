import { addDays } from "date-fns";
import { createHash, randomBytes } from "crypto";
import { StudentVerificationStatus } from "@prisma/client";

import { requireUser } from "@/lib/auth/session";
import {
  doesEmailMatchSchool,
  getSchoolByEmail,
  getSchoolVerificationHint,
  schoolSupportsAutomaticVerification,
} from "@/lib/constants/verification";
import { DEFAULT_SCHOOL, getSchoolLabel } from "@/lib/constants/schools";
import { prisma } from "@/lib/db/prisma";
import { emailDeliveryConfigured } from "@/lib/email/resend";
import {
  checkStudentVerificationDelivery,
  sendStudentVerificationEmail,
} from "@/lib/email/send-student-verification";
import { error, ok, parseJson } from "@/lib/http";
import { deleteVerificationProof } from "@/lib/media/verification-proof-storage";
import { consumeV1RateLimit, rateLimitSubject } from "@/lib/api/v1/rate-limit";
import { mirrorSchoolVerificationToUser, upsertSchoolVerificationState } from "@/lib/verification/school-state";
import { verifyEmailRequestSchema } from "@/lib/validators/verification";

/**
 * Don't ship emails when the verify URL can't be opened by the recipient.
 * Strict university inboxes reject messages containing localhost/private URLs
 * outright, which also burns Resend reputation.
 */
function isPublicHttpsLike(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost")) return false;
    if (host === "127.0.0.1" || host === "::1") return false;
    if (host.startsWith("10.") || host.startsWith("192.168.")) return false;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

const EMAIL_DELIVERY_SETTLE_MS = 2_000;

function waitForInitialDeliveryResult(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, EMAIL_DELIVERY_SETTLE_MS));
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { email } = await parseJson(request, verifyEmailRequestSchema);

    const school = user.school ?? DEFAULT_SCHOOL;
    const matchedSchool = getSchoolByEmail(email);
    const existingState = await prisma.userSchoolVerification.findUnique({
      where: { userId_school: { userId: user.id, school } },
      select: {
        studentVerificationStatus: true,
        manualReviewProofUrl: true,
      },
    });

    if (
      existingState?.studentVerificationStatus ===
      StudentVerificationStatus.VERIFIED
    ) {
      return ok({
        status: StudentVerificationStatus.VERIFIED,
        delivery: "verified",
        message: "Your school identity is already verified.",
      });
    }

    const emailOwner = await prisma.user.findUnique({ where: { email } });
    if (emailOwner && emailOwner.id !== user.id) {
      return error("That email is already linked to another account.", 409);
    }

    if (!schoolSupportsAutomaticVerification(school)) {
      return ok({
        status:
          existingState?.studentVerificationStatus ?? StudentVerificationStatus.UNVERIFIED,
        delivery: "manual",
        message: `${getSchoolLabel(school)} does not support automatic email verification yet. Use the document option below.`,
      });
    }

    if (!doesEmailMatchSchool(email, school)) {
      return error(
        `This email does not match your selected school. ${getSchoolVerificationHint(school)}`,
      );
    }

    if (!matchedSchool) {
      return ok({
        status:
          existingState?.studentVerificationStatus ?? StudentVerificationStatus.UNVERIFIED,
        delivery: "manual",
        message:
          "This school email cannot be verified automatically. Use the document option below.",
      });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const isEmailSafeUrl = isPublicHttpsLike(appUrl);
    if (
      process.env.NODE_ENV === "production" &&
      (!emailDeliveryConfigured() || !isEmailSafeUrl)
    ) {
      return ok({
        status:
          existingState?.studentVerificationStatus ?? StudentVerificationStatus.UNVERIFIED,
        delivery: "manual",
        message:
          "School email verification is temporarily unavailable. Use document review below.",
      });
    }

    const rateLimit = await consumeV1RateLimit({
      scope: "school-email-verification",
      subject: rateLimitSubject(`${user.id}:${email}`),
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return error("Too many verification emails. Try again in about an hour.", 429);
    }

    const rawToken = randomBytes(24).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = addDays(new Date(), 2);

    await prisma.schoolEmailVerification.updateMany({
      where: {
        userId: user.id,
        school,
        status: "PENDING",
      },
      data: {
        status: "EXPIRED",
      },
    });

    await prisma.schoolEmailVerification.create({
      data: {
        userId: user.id,
        school,
        email,
        token: tokenHash,
        expiresAt,
      },
    });

    const verifyUrl = `${appUrl}/api/student-verification/verify?token=${rawToken}`;

    let delivery: "sent" | "failed" | "skipped" = "skipped";
    if (emailDeliveryConfigured() && isEmailSafeUrl) {
      const result = await sendStudentVerificationEmail({ email, verifyUrl });
      if (result.sent) {
        delivery = "sent";
        if (result.id) {
          await waitForInitialDeliveryResult();
          const initialDelivery = await checkStudentVerificationDelivery(result.id);
          if (initialDelivery.status === "failed") {
            delivery = "failed";
            console.warn(
              "[verification] destination mail server rejected email:",
              initialDelivery.providerStatus,
              initialDelivery.reason,
            );
          }
        }
      } else {
        delivery = "failed";
        console.error("[verification] email send failed:", result.reason);
      }
    } else if (emailDeliveryConfigured() && !isEmailSafeUrl) {
      delivery = "skipped";
      console.warn(
        "[verification] Skipping Resend send because NEXT_PUBLIC_APP_URL is not publicly reachable:",
        appUrl,
      );
    }

    if (delivery === "failed") {
      await prisma.schoolEmailVerification.update({
        where: { token: tokenHash },
        data: { status: "EXPIRED" },
      });
      return ok({
        status:
          existingState?.studentVerificationStatus ?? StudentVerificationStatus.UNVERIFIED,
        delivery: "manual",
        message:
          school === "TUM"
            ? "TUM rejected the email. Try your @mytum.de school alias, try again later, or use document review."
            : "Your school mail server rejected the email. Try another official school alias, try again later, or use document review.",
      });
    }

    const skippedReason = !emailDeliveryConfigured()
      ? `Email delivery is not configured. Use the verification link in your profile to confirm ${matchedSchool}.`
      : `Email skipped because the verification link isn't publicly reachable yet. Use the link in your profile to confirm ${matchedSchool}.`;

    const notesByDelivery: Record<typeof delivery, string> = {
      sent:
        `Verification email queued for ${matchedSchool}. Open the link in that school inbox within 48 hours.`,
      skipped: skippedReason,
    };

    await prisma.$transaction(async (tx) => {
      await upsertSchoolVerificationState(tx, user.id, school, {
        email,
        verifiedStudent: false,
        studentVerificationStatus: StudentVerificationStatus.EMAIL_PENDING,
        studentVerificationMethod: null,
        studentVerifiedAt: null,
        emailVerifiedAt: null,
        studentVerificationNotes: notesByDelivery[delivery],
        manualReviewProofUrl: null,
        manualReviewProofFilename: null,
        manualReviewRequestedAt: null,
      });
      await mirrorSchoolVerificationToUser(tx, user.id, school);
    });

    if (existingState?.manualReviewProofUrl) {
      try {
        await deleteVerificationProof(existingState.manualReviewProofUrl);
      } catch (cause) {
        console.error("[verification] failed to delete superseded proof", cause);
      }
    }

    const userMessage =
      delivery === "sent"
        ? "Verification email sent. Open the link in your school inbox within 48 hours."
      : emailDeliveryConfigured() && !isEmailSafeUrl
        ? "Email delivery is disabled in this test build. Use the verification link below to finish now."
        : "Email delivery isn't configured yet. Use the link below to finish verification.";

    return ok({
      status: StudentVerificationStatus.EMAIL_PENDING,
      delivery,
      verifyUrl:
        process.env.NODE_ENV !== "production" && !isEmailSafeUrl ? verifyUrl : undefined,
      message: userMessage,
    });
  } catch (cause) {
    console.error(cause);
    return error("Unable to start student verification.");
  }
}
