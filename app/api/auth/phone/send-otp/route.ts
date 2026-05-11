import { normalizePhone } from "@/lib/auth/phone";
import { sendPhoneSignupOtp } from "@/lib/auth/phone-otp";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseBody } from "@/lib/http";
import { phoneSendOtpSchema } from "@/lib/validators/auth";

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const parsed = parseBody(raw, phoneSendOtpSchema);
    if (!parsed.ok) {
      return error(parsed.error, 422);
    }

    if (parsed.data.purpose !== "signup") {
      return error("Unsupported purpose.", 400);
    }

    const phone = normalizePhone(parsed.data.phone);
    if (!phone) {
      return error("Enter a valid phone number (include country code or use a CN mobile).", 422);
    }

    const exists = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
    if (exists) {
      return error("That phone number is already registered.", 409);
    }

    const sent = await sendPhoneSignupOtp(phone);
    if (!sent.ok) {
      return error(sent.error, sent.status ?? 503);
    }

    return ok({ sent: true as const });
  } catch (cause) {
    console.error(cause);
    return error("Unable to send code.", 500);
  }
}
