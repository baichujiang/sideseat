import { sendEmailSignupOtp } from "@/lib/auth/email-otp";
import { normalizeSignupEmail } from "@/lib/auth/normalize-email";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseBody } from "@/lib/http";
import { emailSendOtpSchema } from "@/lib/validators/auth";

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const parsed = parseBody(raw, emailSendOtpSchema);
    if (!parsed.ok) {
      return error(parsed.error, 422);
    }

    if (parsed.data.purpose !== "signup") {
      return error("Unsupported purpose.", 400);
    }

    const email = normalizeSignupEmail(parsed.data.email);
    if (!email) {
      return error("Enter a valid email address.", 422);
    }

    const exists = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (exists) {
      return error("That email is already registered.", 409);
    }

    const sent = await sendEmailSignupOtp(email);
    if (!sent.ok) {
      return error(sent.error, sent.status ?? 503);
    }

    return ok({
      sent: true as const,
      ...(sent.devCode ? { devCode: sent.devCode } : {}),
    });
  } catch (cause) {
    console.error(cause);
    return error("Unable to send code.", 500);
  }
}
