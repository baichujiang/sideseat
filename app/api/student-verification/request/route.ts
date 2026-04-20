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
import { sendStudentVerificationEmail } from "@/lib/email/send-student-verification";
import { error, ok, parseJson } from "@/lib/http";
import { verifyEmailRequestSchema } from "@/lib/validators/verification";

/**
 * Don't ship emails when the verify URL can't be opened by the recipient.
 * Strict university inboxes reject messages containing localhost/private URLs
 * outright, which also burns Resend reputation.
 */
function isPublicHttpsLike(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
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

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { email } = await parseJson(request, verifyEmailRequestSchema);

    const school = user.school ?? DEFAULT_SCHOOL;
    const matchedSchool = getSchoolByEmail(email);

    const emailOwner = await prisma.user.findUnique({ where: { email } });
    if (emailOwner && emailOwner.id !== user.id) {
      return error("That email is already linked to another account.", 409);
    }

    if (!schoolSupportsAutomaticVerification(school)) {
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          email,
          school,
          verifiedStudent: false,
          studentVerificationStatus: StudentVerificationStatus.MANUAL_REVIEW_REQUIRED,
          studentVerificationNotes:
            `${getSchoolLabel(school)} currently uses manual review for student verification.`,
        },
      });

      return ok({
        status: updatedUser.studentVerificationStatus,
        delivery: "manual",
        message: getSchoolVerificationHint(school),
      });
    }

    if (!doesEmailMatchSchool(email, school)) {
      return error(
        `This email does not match your selected school. ${getSchoolVerificationHint(school)}`,
      );
    }

    if (!matchedSchool) {
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          email,
          school,
          verifiedStudent: false,
          studentVerificationStatus: StudentVerificationStatus.MANUAL_REVIEW_REQUIRED,
          studentVerificationNotes:
            "The submitted email could not be matched to a verified school domain and needs manual review.",
        },
      });

      return ok({
        status: updatedUser.studentVerificationStatus,
        delivery: "manual",
        message:
          "This school email could not be matched automatically, so it was sent to manual review.",
      });
    }

    const rawToken = randomBytes(24).toString("hex");
    const token = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = addDays(new Date(), 2);

    await prisma.schoolEmailVerification.updateMany({
      where: {
        userId: user.id,
        status: "PENDING",
      },
      data: {
        status: "CANCELED",
      },
    });

    await prisma.schoolEmailVerification.create({
      data: {
        userId: user.id,
        email,
        token,
        expiresAt,
      },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const verifyUrl = `${appUrl}/api/student-verification/verify?token=${token}`;

    let delivery: "sent" | "failed" | "skipped" = "skipped";
    let deliveryMessage = "";
    const isEmailSafeUrl = isPublicHttpsLike(appUrl);

    if (emailDeliveryConfigured() && isEmailSafeUrl) {
      const result = await sendStudentVerificationEmail({ email, verifyUrl });
      if (result.sent) {
        delivery = "sent";
      } else {
        delivery = "failed";
        deliveryMessage = result.reason;
        console.error("[verification] email send failed:", result.reason);
      }
    } else if (emailDeliveryConfigured() && !isEmailSafeUrl) {
      delivery = "skipped";
      deliveryMessage =
        "NEXT_PUBLIC_APP_URL points to localhost or a private host, so strict school inboxes would bounce the email. Use the link below to finish verification.";
      console.warn(
        "[verification] Skipping Resend send because NEXT_PUBLIC_APP_URL is not publicly reachable:",
        appUrl,
      );
    }

    const skippedReason = !emailDeliveryConfigured()
      ? `Email delivery is not configured. Use the verification link in your profile to confirm ${matchedSchool}.`
      : `Email skipped because the verification link isn't publicly reachable yet. Use the link in your profile to confirm ${matchedSchool}.`;

    const notesByDelivery: Record<typeof delivery, string> = {
      sent:
        `Verification email queued for ${matchedSchool}. It can take a minute; if it doesn't arrive you can tap the link in your profile.`,
      failed:
        `Verification email could not be delivered (${deliveryMessage || "bounced"}). Use the verification link in your profile instead.`,
      skipped: skippedReason,
    };

    await prisma.user.update({
      where: { id: user.id },
      data: {
        email,
        school,
        verifiedStudent: false,
        studentVerificationStatus: StudentVerificationStatus.EMAIL_PENDING,
        studentVerificationNotes: notesByDelivery[delivery],
      },
    });

    const userMessage =
      delivery === "sent"
        ? "Verification email queued. It usually arrives within a minute — if it doesn't, use the link below."
        : delivery === "failed"
          ? "We couldn't deliver the email right now, but you can still finish verification with the link below."
          : emailDeliveryConfigured() && !isEmailSafeUrl
            ? "Skipped email because the verify link points to localhost. Use the link below to finish now; deploy with a public NEXT_PUBLIC_APP_URL to enable email."
            : "Email delivery isn't configured yet. Use the link below to finish verification.";

    return ok({
      status: StudentVerificationStatus.EMAIL_PENDING,
      delivery,
      verifyUrl,
      message: userMessage,
    });
  } catch (cause) {
    console.error(cause);
    return error("Unable to start student verification.");
  }
}
