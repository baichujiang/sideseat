import { getEmailFrom, getResendClient } from "@/lib/email/resend";

function buildSignupCodeHtml({ code }: { code: string }) {
  return `
    <div style="margin:0;padding:32px 16px;background:#f4efe6;font-family:Arial,Helvetica,sans-serif;color:#23313d;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e6ddd0;border-radius:24px;padding:32px 24px;">
        <p style="margin:0 0 12px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#7b6b58;">SideSeat</p>
        <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;color:#17222b;">Your sign-up code</h1>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#44515b;">
          Enter this code in the app to verify your email and create your account. It expires in 10 minutes.
        </p>
        <p style="margin:0;font-size:32px;font-weight:700;letter-spacing:0.2em;color:#1f4d6b;">${code}</p>
        <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#6b7280;">
          If you did not request this, you can ignore this email.
        </p>
      </div>
    </div>
  `;
}

export type SendSignupCodeResult =
  | { sent: true; id: string | null }
  | { sent: false; reason: string };

export async function sendSignupVerificationCodeEmail({
  email,
  code,
}: {
  email: string;
  code: string;
}): Promise<SendSignupCodeResult> {
  const resend = getResendClient();
  const from = getEmailFrom();

  if (!resend || !from) {
    return { sent: false, reason: "Email delivery is not configured." };
  }

  try {
    const result = await resend.emails.send({
      from,
      to: email,
      subject: "Your SideSeat sign-up code",
      html: buildSignupCodeHtml({ code }),
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
