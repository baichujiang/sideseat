import { getEmailFrom, getResendClient } from "@/lib/email/resend";

function buildStudentVerificationHtml({
  schoolEmail,
  verifyUrl,
}: {
  schoolEmail: string;
  verifyUrl: string;
}) {
  return `
    <div style="margin:0;padding:32px 16px;background:#f4efe6;font-family:Arial,Helvetica,sans-serif;color:#23313d;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e6ddd0;border-radius:24px;padding:32px 24px;">
        <p style="margin:0 0 12px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#7b6b58;">SideSeat</p>
        <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;color:#17222b;">Verify your student email</h1>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#44515b;">
          You requested student verification for <strong>${schoolEmail}</strong>.
        </p>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#44515b;">
          Confirm this address to unlock invitations and connect with classmates through shared courses.
        </p>
        <a
          href="${verifyUrl}"
          style="display:inline-block;padding:14px 20px;background:#1f4d6b;color:#ffffff;text-decoration:none;border-radius:999px;font-weight:600;"
        >
          Verify student email
        </a>
        <p style="margin:24px 0 8px;font-size:13px;line-height:1.6;color:#6b7280;">
          This link expires in 48 hours. If you did not request this, you can ignore this email.
        </p>
        <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;word-break:break-all;">
          ${verifyUrl}
        </p>
      </div>
    </div>
  `;
}

export type SendResult =
  | { sent: true; id: string | null }
  | { sent: false; reason: string };

/**
 * Send the verification email via Resend. Never throws — callers can continue
 * with a local fallback link when delivery is not configured or Resend errors.
 */
export async function sendStudentVerificationEmail({
  schoolEmail,
  verifyUrl,
}: {
  schoolEmail: string;
  verifyUrl: string;
}): Promise<SendResult> {
  const resend = getResendClient();
  const from = getEmailFrom();

  if (!resend || !from) {
    return { sent: false, reason: "Email delivery is not configured." };
  }

  try {
    const result = await resend.emails.send({
      from,
      to: schoolEmail,
      subject: "Verify your SideSeat student email",
      html: buildStudentVerificationHtml({ schoolEmail, verifyUrl }),
    });

    if (result.error) {
      return { sent: false, reason: result.error.message };
    }

    return { sent: true, id: result.data?.id ?? null };
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : "Unknown email error";
    return { sent: false, reason };
  }
}
