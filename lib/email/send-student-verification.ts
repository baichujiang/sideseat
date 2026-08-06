import { getEmailFrom, getResendClient } from "@/lib/email/resend";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildStudentVerificationText({
  email,
  verifyUrl,
}: {
  email: string;
  verifyUrl: string;
}) {
  return [
    "Confirm your SideSeat school email",
    "",
    `You requested school verification for ${email}.`,
    "Open this secure link to confirm your address:",
    verifyUrl,
    "",
    "This link expires in 48 hours. If you did not request this, you can ignore this email.",
  ].join("\n");
}

export function buildStudentVerificationHtml({
  email,
  verifyUrl,
}: {
  email: string;
  verifyUrl: string;
}) {
  const safeEmail = escapeHtml(email);
  const safeVerifyUrl = escapeHtml(verifyUrl);

  return `
    <div style="margin:0;padding:32px 16px;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;color:#23313d;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:32px 24px;">
        <p style="margin:0 0 12px;font-size:12px;text-transform:uppercase;color:#6b7280;">SideSeat</p>
        <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;color:#17222b;">Verify your student email</h1>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#44515b;">
          You requested school verification for <strong>${safeEmail}</strong>.
        </p>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#44515b;">
          Confirm this address to unlock invitations and connect with classmates through shared courses.
        </p>
        <a
          href="${safeVerifyUrl}"
          style="display:inline-block;padding:14px 20px;background:#17222b;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;"
        >
          Verify student email
        </a>
        <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#6b7280;">
          This link expires in 48 hours. If you did not request this, you can ignore this email.
        </p>
      </div>
    </div>
  `;
}

export type SendResult =
  | { sent: true; id: string | null }
  | { sent: false; reason: string };

export type StudentVerificationDeliveryCheck =
  | { status: "accepted"; providerStatus: string }
  | { status: "failed"; providerStatus: string; reason: string }
  | { status: "unknown"; reason: string };

type ResendBounce = {
  message?: string;
  type?: string;
  subType?: string;
  diagnosticCode?: string[];
};

/**
 * Send the verification email via Resend. Never throws — callers can continue
 * with a local fallback link when delivery is not configured or Resend errors.
 */
export async function sendStudentVerificationEmail({
  email,
  verifyUrl,
}: {
  email: string;
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
      to: email,
      subject: "Verify your SideSeat student email",
      html: buildStudentVerificationHtml({ email, verifyUrl }),
      text: buildStudentVerificationText({ email, verifyUrl }),
      tags: [{ name: "category", value: "student_verification" }],
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

/**
 * Resend accepts a message before the destination school mail server responds.
 * A short follow-up check catches immediate SMTP rejections without claiming
 * that a message reached the inbox when it did not.
 */
export async function checkStudentVerificationDelivery(
  emailId: string,
): Promise<StudentVerificationDeliveryCheck> {
  const resend = getResendClient();
  if (!resend) {
    return { status: "unknown", reason: "Email delivery is not configured." };
  }

  try {
    const result = await resend.emails.get(emailId);
    if (result.error || !result.data) {
      return {
        status: "unknown",
        reason: result.error?.message ?? "Email status is unavailable.",
      };
    }

    const email = result.data as typeof result.data & { bounce?: ResendBounce };
    const providerStatus = email.last_event;
    if (["bounced", "failed", "suppressed", "canceled"].includes(providerStatus)) {
      const diagnostic = email.bounce?.diagnosticCode?.join("; ");
      return {
        status: "failed",
        providerStatus,
        reason:
          diagnostic ??
          email.bounce?.message ??
          `The email provider reported ${providerStatus}.`,
      };
    }

    return { status: "accepted", providerStatus };
  } catch (cause) {
    return {
      status: "unknown",
      reason: cause instanceof Error ? cause.message : "Email status is unavailable.",
    };
  }
}
