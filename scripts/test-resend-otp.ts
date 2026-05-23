/**
 * Diagnose signup OTP email delivery. Usage:
 *   npx tsx scripts/test-resend-otp.ts you@example.com
 */
import { readFileSync } from "fs";
import { resolve } from "path";

import { sendSignupVerificationCodeEmail } from "../lib/email/send-signup-verification-code";
import { emailDeliveryConfigured, getEmailFrom } from "../lib/email/resend";

function loadEnv() {
  const path = resolve(process.cwd(), ".env");
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    let val = trimmed.slice(eq + 1);
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

async function main() {
  loadEnv();
  const to = process.argv[2]?.trim();
  if (!to) {
    console.error("Usage: npx tsx scripts/test-resend-otp.ts <email>");
    process.exit(1);
  }

  console.log("emailDeliveryConfigured:", emailDeliveryConfigured());
  console.log("EMAIL_FROM:", getEmailFrom() || "(empty)");
  console.log("RESEND_API_KEY length:", process.env.RESEND_API_KEY?.length ?? 0);

  const result = await sendSignupVerificationCodeEmail({ email: to, code: "123456" });
  console.log("send result:", result);
  process.exit(result.sent ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
